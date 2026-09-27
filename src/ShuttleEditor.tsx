import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor, JSONContent } from '@tiptap/core';
import { EditorState } from '@tiptap/pm/state';
import type { TableOfContentData } from '@tiptap/extension-table-of-contents';
import { buildExtensions } from './extensions';
import type { MathEditRequest, ShuttleContextRef, ShuttleUiEvents } from './context';
import type { BlockSummary, NoteRef, ShuttleHost, ShuttleMode } from './host';
import { guardHost } from './guardHost';
import { collectFragmentLinkIds, collectMentionTargets, diffSets } from './doc/tracking';
import { EMPTY_DOC, isValidDoc } from './doc/validate';
import { toStoredJson } from './doc/persist';
import { legacyPreview } from './doc/legacyText';
import { stripPendingUploads, insertImageFiles } from './custom/image/upload';
import { UNLINKED_REFRESH_META } from './custom/unlinkedMentions';
import { Toolbar } from './ui/Toolbar';
import { SelectionBubble } from './ui/SelectionBubble';
import { BlockGutter } from './ui/BlockGutter';
import { RefPicker } from './ui/RefPicker';
import { MathEditor } from './ui/MathEditor';
import { MathAlignToggle } from './ui/MathAlignToggle';
import { FindBar } from './ui/FindBar';
import { Outline } from './ui/Outline';

export interface PickerOptions {
  /** The picker's label, e.g. "Link to note". */
  title?: string;
}

export interface PickedBlock {
  note: NoteRef;
  block: BlockSummary;
}

/** Opens Shuttle's own dialogs from outside the editor (command bars, menus). */
export interface ShuttleControls {
  openRefPicker(): void;
  openFind(): void;
  pickImage(): void;
  /** Shuttle's note picker; resolves with the chosen note, or null if dismissed. */
  pickNote(options?: PickerOptions): Promise<NoteRef | null>;
  /** The same picker, going on to one of the note's blocks. Null if dismissed. */
  pickBlock(options?: PickerOptions): Promise<PickedBlock | null>;
}

/** What the open picker is for: a transclusion, or a host's pick awaiting its answer. */
type PickerState =
  | { kind: 'blockRef' }
  | { kind: 'note'; title: string; resolve: (note: NoteRef | null) => void }
  | { kind: 'block'; title: string; resolve: (picked: PickedBlock | null) => void };

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
  /**
   * The live editor, for host overlays (context menus, fragment overlays), and
   * controls for Shuttle's dialogs. Both are null on unmount.
   */
  onReady?: (editor: Editor | null, controls: ShuttleControls | null) => void;
  saveDebounceMs?: number;
  toolbar?: boolean;
  outline?: boolean;
  placeholder?: string;
  twitchParent?: string;
  /** False stops pasted Twitch links from becoming embeds. Defaults to true. */
  twitch?: boolean;
  /**
   * Palette for code highlighting. `auto` (the default) follows the system's
   * `prefers-color-scheme`; pass `light` or `dark` to match your app's theme.
   */
  colorScheme?: 'light' | 'dark' | 'auto';
  /** The browser's spell checking on the document. Omitted, the browser decides. */
  spellCheck?: boolean;
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
    docKey, doc, mode, host, toolbar = true, outline = false, placeholder, twitch = true, colorScheme = 'auto', className, children,
  } = props;
  const twitchParent = props.twitchParent
    ?? (typeof window !== 'undefined' ? window.location.hostname || 'localhost' : 'localhost');

  const [legacy, setLegacy] = useState(false);
  const [picker, setPickerState] = useState<PickerState | null>(null);
  const [math, setMath] = useState<MathEditRequest | null>(null);
  const [find, setFind] = useState(false);
  const [toc, setToc] = useState<TableOfContentData>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  // Latest-value refs: the editor's callbacks are created once.
  const latest = useRef(props);
  latest.current = props;
  const legacyRef = useRef(false);

  // A host's pick that is replaced, dismissed or cut short by a document
  // switch resolves with null, so nothing waits forever.
  const pickerRef = useRef<PickerState | null>(null);
  const setPicker = useCallback((next: PickerState | null): void => {
    const current = pickerRef.current;
    if (current && current.kind !== 'blockRef') current.resolve(null);
    pickerRef.current = next;
    setPickerState(next);
  }, []);
  const settlePicker = useCallback((): void => {
    pickerRef.current = null;
    setPickerState(null);
  }, []);

  const events = useMemo<ShuttleUiEvents>(() => ({
    openRefPicker: () => setPicker({ kind: 'blockRef' }),
    editMath: (req) => setMath(req),
    openFind: () => setFind(true),
    pickImage: () => fileInput.current?.click(),
  }), [setPicker]);

  const controls = useMemo<ShuttleControls>(() => ({
    openRefPicker: events.openRefPicker,
    openFind: events.openFind,
    pickImage: events.pickImage,
    pickNote: (options) => new Promise((resolve) => {
      setPicker({ kind: 'note', title: options?.title ?? 'Pick a note', resolve });
    }),
    pickBlock: (options) => new Promise((resolve) => {
      setPicker({ kind: 'block', title: options?.title ?? 'Pick a block', resolve });
    }),
  }), [events, setPicker]);

  // Every host call goes through the guard, so a throwing host cannot abort
  // a transaction or skip a save.
  const safeHost = useMemo(() => guardHost(host), [host]);
  const ctxRef = useRef<ShuttleContextRef['current']>({ host: safeHost, events, docKey });
  ctxRef.current = { host: safeHost, events, docKey };
  const ctx = useMemo<ShuttleContextRef>(() => ({ get current() { return ctxRef.current; } }), []);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The unsaved edit, keyed by the document it was made in. */
  const pending = useRef<{ key: string; doc: JSONContent } | null>(null);
  const mentions = useRef<Set<string>>(new Set());
  const fragments = useRef<Set<string>>(new Set());

  // What the load effect last committed. Set only in the commit phase: during
  // render `docKey` may already name the next document, and StrictMode builds
  // a throwaway editor whose updates must never be saved.
  const loadedEditor = useRef<Editor | null>(null);
  const loadedKey = useRef<string | null>(null);
  /** Latest stored JSON of `loadedKey`, so a rebuilt editor resumes from it. */
  const lastDoc = useRef<JSONContent | null>(null);

  const flush = (): void => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    try {
      latest.current.onChange(p.key, p.doc);
    } catch (error) {
      ctx.current.host.log('error', 'Saving the document failed', { docKey: p.key, error: String(error) });
    }
  };

  const reportStats = (editor: Editor): void => {
    const onStats = latest.current.onStats;
    if (!onStats) return;
    const counter = editor.storage.characterCount;
    onStats({ words: counter.words(), characters: counter.characters() });
  };

  const extensions = useMemo(() => buildExtensions(mode, ctx, {
    reactViews: true,
    twitchParent,
    twitch,
    ...(placeholder ? { placeholder } : {}),
    onOutline: (items) => setToc(items),
  }), [mode, twitchParent, twitch, placeholder]); // eslint-disable-line react-hooks/exhaustive-deps

  const editor = useEditor({
    immediatelyRender: true,
    extensions,
    content: EMPTY_DOC,
    onUpdate: ({ editor: ed }) => {
      const key = loadedKey.current;
      if (ed !== loadedEditor.current || key === null || legacyRef.current) return;
      const currentHost = ctx.current.host;

      // Schedule the save first: nothing a host callback does can cost the edit.
      const saved = toSaved(ed);
      lastDoc.current = saved;
      pending.current = { key, doc: saved };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(flush, latest.current.saveDebounceMs ?? DEFAULT_DEBOUNCE_MS);

      const nextMentions = collectMentionTargets(ed.state.doc);
      const linkDiff = diffSets(mentions.current, nextMentions);
      mentions.current = nextMentions;
      if (linkDiff.added.length > 0 || linkDiff.removed.length > 0) currentHost.onLinksChanged(key, linkDiff);

      const nextFragments = collectFragmentLinkIds(ed.state.doc);
      const removedFragments = diffSets(fragments.current, nextFragments).removed;
      fragments.current = nextFragments;
      if (removedFragments.length > 0) currentHost.onFragmentLinksRemoved(key, removedFragments);

      reportStats(ed);
    },
  }, [mode, twitchParent, twitch, placeholder]);

  // Load the document for this key, after writing the previous key's edit.
  // The same key again means the editor was rebuilt (mode change, StrictMode),
  // not a switch: resume from the live document, not the stale `doc` prop.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    flush();
    const rebuilt = docKey === loadedKey.current;
    if (rebuilt && !legacyRef.current) {
      loadDocument(editor, lastDoc.current ?? doc ?? EMPTY_DOC);
      editor.setEditable(true, false);
    } else {
      const stored = doc ?? EMPTY_DOC;
      const valid = isValidDoc(editor.schema, stored);
      legacyRef.current = !valid;
      setLegacy(!valid);
      if (!valid && !rebuilt) {
        safeHost.log('warn', 'Document does not match the current schema; opened read-only', { docKey });
      }
      // A legacy note shows its text read-only; `lastDoc` stays null, so it is never saved.
      loadDocument(editor, valid ? stored : legacyPreview(stored));
      editor.setEditable(valid, false);
    }
    loadedEditor.current = editor;
    loadedKey.current = docKey;
    lastDoc.current = legacyRef.current ? null : toSaved(editor);
    mentions.current = collectMentionTargets(editor.state.doc);
    fragments.current = collectFragmentLinkIds(editor.state.doc);
    reportStats(editor);
    if (!rebuilt) {
      setPicker(null);
      setMath(null);
      setFind(false);
    }
  }, [docKey, editor]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tiptap hands editorProps to ProseMirror's setProps, where `attributes`
  // replaces the whole set, so keep the role Tiptap gives the surface.
  const { spellCheck } = props;
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const attributes: Record<string, string> = { role: 'textbox' };
    if (spellCheck !== undefined) attributes['spellcheck'] = String(spellCheck);
    editor.setOptions({ editorProps: { ...editor.options.editorProps, attributes } });
  }, [editor, spellCheck]);

  // A new host may carry a new note list; rebuild the views derived from it.
  const previousHost = useRef(host);
  useEffect(() => {
    if (previousHost.current === host) return;
    previousHost.current = host;
    if (!editor || editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr.setMeta(UNLINKED_REFRESH_META, true).setMeta('addToHistory', false));
  }, [host, editor]);

  useEffect(() => {
    latest.current.onReady?.(editor, editor ? controls : null);
    return () => latest.current.onReady?.(null, null);
  }, [editor, controls]);

  // A pick still open when the editor goes away answers null.
  useEffect(() => () => setPicker(null), [setPicker]);

  // Write, never drop, an edit still inside the debounce window.
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const editable = editor !== null && !legacy;

  return (
    <div
      className={`sh-root sh-mode-${mode}${className ? ` ${className}` : ''}`}
      data-sh-scheme={colorScheme === 'auto' ? undefined : colorScheme}
    >
      {legacy && (
        <div className="sh-legacy" role="status">
          This note uses an older format and is read-only.
        </div>
      )}
      {editor && editable && toolbar && <Toolbar editor={editor} ctx={ctx} />}
      <div className="sh-content">
        <EditorContent editor={editor} className="sh-prose" />
        {editor && editable && <SelectionBubble editor={editor} />}
        {editor && editable && <MathAlignToggle editor={editor} />}
        {editor && editable && mode === 'notepad' && <BlockGutter editor={editor} ctx={ctx} />}
        {children}
      </div>
      {editor && outline && <Outline items={toc} editor={editor} />}
      {editor && find && <FindBar editor={editor} onClose={() => setFind(false)} />}
      {editor && picker?.kind === 'blockRef' && (
        <RefPicker
          ctx={ctx}
          title="Insert block reference"
          onBlock={(block) => { editor.chain().focus().insertBlockRef(block.id, block.noteId).run(); setPicker(null); }}
          onClose={() => setPicker(null)}
        />
      )}
      {editor && picker?.kind === 'note' && (
        <RefPicker
          ctx={ctx}
          title={picker.title}
          onNote={(note) => { picker.resolve(note); settlePicker(); }}
          onBlock={() => {}}
          onClose={() => setPicker(null)}
        />
      )}
      {editor && picker?.kind === 'block' && (
        <RefPicker
          ctx={ctx}
          title={picker.title}
          onBlock={(block, note) => { picker.resolve({ note, block }); settlePicker(); }}
          onClose={() => setPicker(null)}
        />
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
