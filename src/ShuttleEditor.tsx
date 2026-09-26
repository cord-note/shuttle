import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor, JSONContent } from '@tiptap/core';
import { EditorState } from '@tiptap/pm/state';
import type { TableOfContentData } from '@tiptap/extension-table-of-contents';
import { buildExtensions } from './extensions';
import type { MathEditRequest, ShuttleContextRef, ShuttleUiEvents } from './context';
import type { ShuttleHost, ShuttleMode } from './host';
import { collectFragmentLinkIds, collectMentionTargets, diffSets } from './doc/tracking';
import { EMPTY_DOC, isValidDoc } from './doc/validate';
import { toStoredJson } from './doc/persist';
import { stripPendingUploads, insertImageFiles } from './custom/image/upload';
import { UNLINKED_REFRESH_META } from './custom/unlinkedMentions';
import { Toolbar } from './ui/Toolbar';
import { SelectionBubble } from './ui/SelectionBubble';
import { BlockGutter } from './ui/BlockGutter';
import { RefPicker } from './ui/RefPicker';
import { MathEditor } from './ui/MathEditor';
import { FindBar } from './ui/FindBar';
import { Outline } from './ui/Outline';

export interface ShuttleEditorProps {
  /** Identity of the document. Changing it loads `doc` and flushes pending edits. */
  docKey: string;
  /** Stored document. Read only when `docKey` changes; the editor owns it after. */
  doc: JSONContent | null;
  mode: ShuttleMode;
  /**
   * The embedding application. Pass a new host object when the note list
   * changes; Shuttle refreshes derived views on identity change.
   */
  host: ShuttleHost;
  /** Debounced save; also called immediately on document switch and unmount. */
  onChange: (docKey: string, doc: JSONContent) => void;
  onStats?: (stats: { words: number; characters: number }) => void;
  /** The live editor, for host overlays (context menus, fragment overlays). */
  onReady?: (editor: Editor | null) => void;
  saveDebounceMs?: number;
  toolbar?: boolean;
  outline?: boolean;
  placeholder?: string;
  twitchParent?: string;
  className?: string;
  /** Host overlays rendered inside the content area. */
  children?: ReactNode;
}

const DEFAULT_DEBOUNCE_MS = 750;

/**
 * Replaces the editor's document without making the load undoable.
 *
 * The content goes in through a normal transaction so appendTransaction
 * plugins (UniqueID, BlockIdGuard, TableOfContents) mint their ids. The view
 * state is then rebuilt from the resulting document, which resets every
 * plugin's state — history included — so undo can never reach back into the
 * previously loaded document.
 */
export function loadDocument(editor: Editor, json: JSONContent): void {
  editor
    .chain()
    .command(({ tr }) => { tr.setMeta('addToHistory', false); return true; })
    .setContent(json, { emitUpdate: false })
    .run();
  // Keep the selection setContent left (end of document), so typing continues the text.
  const { doc, plugins, selection } = editor.state;
  editor.view.updateState(EditorState.create({ doc, plugins, selection }));
}

/** The document as handed to `onChange`. */
const toSaved = (editor: Editor): JSONContent => toStoredJson(stripPendingUploads(editor.getJSON()));

export function ShuttleEditor(props: ShuttleEditorProps) {
  const {
    docKey, doc, mode, host, toolbar = true, outline = false, placeholder, className, children,
  } = props;
  const twitchParent = props.twitchParent
    ?? (typeof window !== 'undefined' ? window.location.hostname || 'localhost' : 'localhost');

  const [legacy, setLegacy] = useState(false);
  const [refPicker, setRefPicker] = useState(false);
  const [math, setMath] = useState<MathEditRequest | null>(null);
  const [find, setFind] = useState(false);
  const [toc, setToc] = useState<TableOfContentData>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  // Latest-value refs: the editor's callbacks are created once.
  const latest = useRef(props);
  latest.current = props;
  const legacyRef = useRef(false);

  const events = useMemo<ShuttleUiEvents>(() => ({
    openRefPicker: () => setRefPicker(true),
    editMath: (req) => setMath(req),
    openFind: () => setFind(true),
    pickImage: () => fileInput.current?.click(),
  }), []);

  const ctxRef = useRef<ShuttleContextRef['current']>({ host, events, docKey });
  ctxRef.current = { host, events, docKey };
  const ctx = useMemo<ShuttleContextRef>(() => ({ get current() { return ctxRef.current; } }), []);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The unsaved edit, keyed by the document it was made in. */
  const pending = useRef<{ key: string; doc: JSONContent } | null>(null);
  const mentions = useRef<Set<string>>(new Set());
  const fragments = useRef<Set<string>>(new Set());

  const flush = (): void => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    const p = pending.current;
    pending.current = null;
    if (p) latest.current.onChange(p.key, p.doc);
  };

  const reportStats = (editor: Editor): void => {
    const onStats = latest.current.onStats;
    if (!onStats) return;
    const counter = editor.storage.characterCount;
    onStats({ words: counter.words(), characters: counter.characters() });
  };

  const editor = useEditor({
    immediatelyRender: true,
    extensions: buildExtensions(mode, ctx, {
      reactViews: true,
      twitchParent,
      ...(placeholder ? { placeholder } : {}),
      onOutline: (items) => setToc(items),
    }),
    content: EMPTY_DOC,
    onUpdate: ({ editor: ed }) => {
      if (legacyRef.current) return;
      const { host: currentHost, docKey: key } = ctx.current;

      const nextMentions = collectMentionTargets(ed.state.doc);
      const linkDiff = diffSets(mentions.current, nextMentions);
      mentions.current = nextMentions;
      if (linkDiff.added.length > 0 || linkDiff.removed.length > 0) currentHost.onLinksChanged(key, linkDiff);

      const nextFragments = collectFragmentLinkIds(ed.state.doc);
      const removedFragments = diffSets(fragments.current, nextFragments).removed;
      fragments.current = nextFragments;
      if (removedFragments.length > 0) currentHost.onFragmentLinksRemoved(key, removedFragments);

      reportStats(ed);

      pending.current = { key, doc: toSaved(ed) };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(flush, latest.current.saveDebounceMs ?? DEFAULT_DEBOUNCE_MS);
    },
  }, [mode, twitchParent, placeholder]);

  // Load the document for this key, after writing the previous key's edit.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    flush();
    const stored = doc ?? EMPTY_DOC;
    const valid = isValidDoc(editor.schema, stored);
    legacyRef.current = !valid;
    setLegacy(!valid);
    if (!valid) host.log('warn', 'Document does not match the current schema; opened read-only', { docKey });
    loadDocument(editor, valid ? stored : EMPTY_DOC);
    editor.setEditable(valid, false);
    mentions.current = collectMentionTargets(editor.state.doc);
    fragments.current = collectFragmentLinkIds(editor.state.doc);
    reportStats(editor);
    setRefPicker(false);
    setMath(null);
  }, [docKey, editor]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new host may carry a new note list; rebuild the views derived from it.
  const previousHost = useRef(host);
  useEffect(() => {
    if (previousHost.current === host) return;
    previousHost.current = host;
    if (!editor || editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr.setMeta(UNLINKED_REFRESH_META, true).setMeta('addToHistory', false));
  }, [host, editor]);

  useEffect(() => {
    latest.current.onReady?.(editor);
    return () => latest.current.onReady?.(null);
  }, [editor]);

  // Write, never drop, an edit still inside the debounce window.
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const editable = editor !== null && !legacy;

  return (
    <div className={`sh-root sh-mode-${mode}${className ? ` ${className}` : ''}`}>
      {legacy && (
        <div className="sh-legacy" role="status">
          This note uses an older format and is read-only.
        </div>
      )}
      {editor && editable && toolbar && <Toolbar editor={editor} ctx={ctx} />}
      <div className="sh-content">
        <EditorContent editor={editor} className="sh-prose" />
        {editor && editable && <SelectionBubble editor={editor} />}
        {editor && editable && mode === 'notepad' && <BlockGutter editor={editor} ctx={ctx} />}
        {children}
      </div>
      {editor && outline && <Outline items={toc} editor={editor} />}
      {editor && find && <FindBar editor={editor} onClose={() => setFind(false)} />}
      {editor && refPicker && (
        <RefPicker editor={editor} ctx={ctx} onClose={() => setRefPicker(false)} />
      )}
      {editor && math && <MathEditor editor={editor} request={math} onClose={() => setMath(null)} />}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (editor && files.length > 0) void insertImageFiles(editor, ctx, files);
        }}
      />
    </div>
  );
}
