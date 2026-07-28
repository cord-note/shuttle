import { useEffect, useState, useRef, useCallback } from 'react';
import type { Editor } from '@tiptap/core';
import { ArrowLeft, Tag as TagIcon, Link2, Plus, Copy, Scissors, Clipboard, FileText } from 'lucide-react';
import { useFragmentStore } from '../../store/fragments';
import { useTagStore } from '../../store/tags';
import { useNoteStore } from '../../store/notes';
import { useVaultStore } from '../../store/vaults';
import type { Note } from '@shared/types';
import styles from './EditorContextMenu.module.css';

type BlockEntry = {
  blockId: string;
  text: string;
  type: string;
  level?: number | undefined;
};

function nodeText(node: Record<string, unknown>): string {
  if (typeof node.text === 'string') return node.text;
  return ((node.content as Record<string, unknown>[] | undefined) ?? [])
    .map(nodeText)
    .join('');
}

function walk(node: Record<string, unknown>, result: BlockEntry[]) {
  const attrs = node.attrs as Record<string, unknown> | undefined;
  const type  = node.type as string | undefined;
  if (attrs?.blockId && type) {
    const t = nodeText(node).trim();
    if (t) {
      result.push({
        blockId: attrs.blockId as string,
        text:    t,
        type,
        level:   typeof attrs.level === 'number' ? attrs.level : undefined,
      });
    }
  }
  ((node.content as Record<string, unknown>[] | undefined) ?? []).forEach((n) => walk(n, result));
}

function extractBlocks(bodyJson: string): BlockEntry[] {
  try {
    const doc = JSON.parse(bodyJson);
    const result: BlockEntry[] = [];
    ((doc.content as Record<string, unknown>[] | undefined) ?? []).forEach((n) => walk(n, result));
    return result;
  } catch {
    return [];
  }
}

interface MenuState {
  x: number;
  y: number;
  blockId: string | null;
}

type SubView =
  | null
  | { kind: 'tag' }
  | { kind: 'noteLink' }
  | { kind: 'fragmentLink'; step: 1 }
  | { kind: 'fragmentLink'; step: 2; targetNote: Note };

interface Props {
  editor: Editor;
  noteId: string;
}

export function EditorContextMenu({ editor, noteId }: Props) {
  const { annotations, attachTag, createLink } = useFragmentStore();
  const { tags, createTag } = useTagStore();
  const { notes } = useNoteStore();
  const { activeVaultId } = useVaultStore();

  const [menu, setMenu]         = useState<MenuState | null>(null);
  const [sub, setSub]           = useState<SubView>(null);
  const [query, setQuery]       = useState('');
  const [listIndex, setListIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef  = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setMenu(null);
    setSub(null);
    setQuery('');
  }, []);

  useEffect(() => {
    const pm = editor?.view.dom as HTMLElement | undefined;
    if (!pm) return;

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      const blockEl = (e.target as HTMLElement).closest('[data-block-id]') as HTMLElement | null;
      setMenu({ x: e.clientX, y: e.clientY, blockId: blockEl?.getAttribute('data-block-id') ?? null });
      setSub(null);
      setQuery('');
    };

    pm.addEventListener('contextmenu', handleContextMenu);
    return () => pm.removeEventListener('contextmenu', handleContextMenu);
  }, [editor]);

  useEffect(() => {
    if (!menu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) close();
    };
    const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [menu, close]);

  useEffect(() => {
    setListIndex(0);
    if (sub) setTimeout(() => inputRef.current?.focus(), 30);
  }, [sub]);

  useEffect(() => { setListIndex(0); }, [query]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { type, blockId } = (e as CustomEvent<{ type: 'tag' | 'noteLink' | 'fragmentLink'; blockId: string }>).detail;
      const pm = editor?.view.dom as HTMLElement | undefined;
      const blockEl = pm?.querySelector(`[data-block-id="${blockId}"]`) as HTMLElement | null;
      const rect = blockEl?.getBoundingClientRect();
      const x = rect ? rect.left : 200;
      const y = rect ? rect.bottom + 4 : 200;
      setMenu({ x, y, blockId });
      setSub(type === 'tag' ? { kind: 'tag' } : type === 'noteLink' ? { kind: 'noteLink' } : { kind: 'fragmentLink', step: 1 });
      setQuery('');
    };
    window.addEventListener('corddb:fragment-action', handler);
    return () => window.removeEventListener('corddb:fragment-action', handler);
  }, [editor]);

  function execCopy()  { document.execCommand('copy');  close(); }
  function execCut()   { document.execCommand('cut');   close(); }
  async function execPaste() {
    try {
      const text = await navigator.clipboard.readText();
      editor.chain().focus().insertContent(text).run();
    } catch {
      document.execCommand('paste');
    }
    close();
  }

  const blockId = menu?.blockId ?? null;
  const annotation = blockId ? (annotations[blockId] ?? { tags: [], links: [], backlinks: [] }) : { tags: [], links: [], backlinks: [] };

  async function doAttachTag(tagId: string) {
    if (!blockId) return;
    await attachTag(blockId, noteId, activeVaultId ?? '', tagId);
    close();
  }

  async function doCreateTag() {
    if (!query.trim() || !activeVaultId) return;
    const tag = await createTag({ vaultId: activeVaultId, name: query.trim() });
    await doAttachTag(tag.id);
  }

  async function doLinkNote(toNoteId: string, noteTitle: string) {
    if (!blockId) return;
    const link = await createLink({ fromFragmentId: blockId, fromNoteId: noteId, vaultId: activeVaultId ?? '', toNoteId });
    editor.chain().focus().insertContent({
      type: 'fragmentLinkNode',
      attrs: { linkId: link.id, toNoteId, toFragmentId: null, label: noteTitle },
    }).run();
    close();
  }

  async function doLinkFragment(targetNote: Note, toFragmentId: string, fragmentText: string) {
    if (!blockId) return;
    const link = await createLink({
      fromFragmentId:   blockId,
      fromNoteId:       noteId,
      vaultId:          activeVaultId ?? '',
      toNoteId:         targetNote.id,
      toFragmentId,
      toFragmentNoteId: targetNote.id,
    });
    editor.chain().focus().insertContent({
      type: 'fragmentLinkNode',
      attrs: { linkId: link.id, toNoteId: targetNote.id, toFragmentId, label: fragmentText.slice(0, 30) },
    }).run();
    close();
  }

  const q = query.toLowerCase();
  const attachedTagIds = new Set(annotation.tags.map((t) => t.id));
  const filteredTags = tags.filter((t) => !attachedTagIds.has(t.id) && t.name.toLowerCase().includes(q));
  const tagExists = tags.some((t) => t.name.toLowerCase() === query.trim().toLowerCase());

  const linkedNoteIds = new Set(annotation.links.map((l) => l.toNoteId).filter(Boolean));
  const filteredNotes = notes.filter(
    (n) => n.id !== noteId && !linkedNoteIds.has(n.id) && (n.title || 'Untitled').toLowerCase().includes(q),
  );

  if (!menu) return null;

  const isFragStep2 = sub?.kind === 'fragmentLink' && sub.step === 2;
  const MENU_W = isFragStep2 ? 380 : 200;
  const MENU_H = isFragStep2 ? 460 : (sub ? 280 : 180);
  const left = Math.min(menu.x, window.innerWidth  - MENU_W - 8);
  const top  = Math.min(menu.y, window.innerHeight - MENU_H - 8);

  return (
    <div ref={menuRef} className={styles.menu} style={{ left, top }} onContextMenu={(e) => e.preventDefault()}>

      {!sub && (
        <>
          <button className={styles.item} onClick={execCopy}>
            <Copy size={13} strokeWidth={1.75} className={styles.itemIcon} />
            <span className={styles.itemLabel}>Copy</span>
            <span className={styles.itemKbd}>Ctrl+C</span>
          </button>
          <button className={styles.item} onClick={execCut}>
            <Scissors size={13} strokeWidth={1.75} className={styles.itemIcon} />
            <span className={styles.itemLabel}>Cut</span>
            <span className={styles.itemKbd}>Ctrl+X</span>
          </button>
          <button className={styles.item} onClick={execPaste}>
            <Clipboard size={13} strokeWidth={1.75} className={styles.itemIcon} />
            <span className={styles.itemLabel}>Paste</span>
            <span className={styles.itemKbd}>Ctrl+V</span>
          </button>

          {blockId && (
            <>
              <div className={styles.divider} />
              <button className={styles.item} onClick={() => { setSub({ kind: 'tag' }); setQuery(''); }}>
                <TagIcon size={13} strokeWidth={1.75} className={styles.itemIcon} />
                <span className={styles.itemLabel}>Add tag to block</span>
              </button>
              <button className={styles.item} onClick={() => { setSub({ kind: 'noteLink' }); setQuery(''); }}>
                <FileText size={13} strokeWidth={1.75} className={styles.itemIcon} />
                <span className={styles.itemLabel}>Link block → note</span>
              </button>
              <button className={styles.item} onClick={() => { setSub({ kind: 'fragmentLink', step: 1 }); setQuery(''); }}>
                <Link2 size={13} strokeWidth={1.75} className={styles.itemIcon} />
                <span className={styles.itemLabel}>Link block → fragment</span>
              </button>
            </>
          )}
        </>
      )}

      {sub?.kind === 'tag' && (
        <>
          <SubHeader label="Add tag" onBack={() => { setSub(null); setQuery(''); }} />
          <input
            ref={inputRef}
            className={styles.input}
            placeholder="Search or create tag…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setListIndex((i) => Math.min(i + 1, filteredTags.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setListIndex((i) => Math.max(i - 1, 0)); }
              else if (e.key === 'Enter') { if (filteredTags[listIndex]) doAttachTag(filteredTags[listIndex].id); else doCreateTag(); }
              else if (e.key === 'Escape') close();
            }}
          />
          <div className={styles.list}>
            {filteredTags.map((tag, i) => (
              <button key={tag.id} className={`${styles.item} ${i === listIndex ? styles.itemActive : ''}`} onClick={() => doAttachTag(tag.id)} onMouseEnter={() => setListIndex(i)}>
                <span className={styles.dot} style={{ background: tag.color ?? 'var(--text-muted)' }} />
                {tag.name}
              </button>
            ))}
            {query.trim() && !tagExists && (
              <button className={styles.itemAccent} onClick={doCreateTag}>
                <Plus size={11} strokeWidth={2} /> Create &quot;{query.trim()}&quot;
              </button>
            )}
            {filteredTags.length === 0 && !query.trim() && (
              <div className={styles.empty}>No tags yet</div>
            )}
          </div>
        </>
      )}

      {sub?.kind === 'noteLink' && (
        <>
          <SubHeader label="Link → note" onBack={() => { setSub(null); setQuery(''); }} />
          <input
            ref={inputRef}
            className={styles.input}
            placeholder="Search notes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setListIndex((i) => Math.min(i + 1, filteredNotes.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setListIndex((i) => Math.max(i - 1, 0)); }
              else if (e.key === 'Enter') { if (filteredNotes[listIndex]) doLinkNote(filteredNotes[listIndex].id, filteredNotes[listIndex].title || 'Untitled'); }
              else if (e.key === 'Escape') close();
            }}
          />
          <div className={styles.list}>
            {filteredNotes.map((note, i) => (
              <button key={note.id} className={`${styles.item} ${i === listIndex ? styles.itemActive : ''}`} onClick={() => doLinkNote(note.id, note.title || 'Untitled')} onMouseEnter={() => setListIndex(i)}>
                {note.title || 'Untitled'}
              </button>
            ))}
            {filteredNotes.length === 0 && <div className={styles.empty}>No notes found</div>}
          </div>
        </>
      )}

      {sub?.kind === 'fragmentLink' && sub.step === 1 && (
        <>
          <SubHeader label="Link → fragment (pick note)" onBack={() => { setSub(null); setQuery(''); }} />
          <input
            ref={inputRef}
            className={styles.input}
            placeholder="Search notes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setListIndex((i) => Math.min(i + 1, filteredNotes.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setListIndex((i) => Math.max(i - 1, 0)); }
              else if (e.key === 'Enter') { if (filteredNotes[listIndex]) { setSub({ kind: 'fragmentLink', step: 2, targetNote: filteredNotes[listIndex] }); setQuery(''); } }
              else if (e.key === 'Escape') close();
            }}
          />
          <div className={styles.list}>
            {filteredNotes.map((note, i) => (
              <button
                key={note.id}
                className={`${styles.item} ${i === listIndex ? styles.itemActive : ''}`}
                onClick={() => { setSub({ kind: 'fragmentLink', step: 2, targetNote: note }); setQuery(''); }}
                onMouseEnter={() => setListIndex(i)}
              >
                {note.title || 'Untitled'} →
              </button>
            ))}
            {filteredNotes.length === 0 && <div className={styles.empty}>No notes found</div>}
          </div>
        </>
      )}

      {sub?.kind === 'fragmentLink' && sub.step === 2 && (() => {
        const allBlocks = extractBlocks(sub.targetNote.bodyJson);
        const blocks = q
          ? allBlocks.filter((b) => b.text.toLowerCase().includes(q))
          : allBlocks;
        return (
          <>
            <SubHeader
              label={sub.targetNote.title || 'Untitled'}
              onBack={() => { setSub({ kind: 'fragmentLink', step: 1 }); setQuery(''); }}
            />
            <input
              ref={inputRef}
              className={styles.input}
              placeholder="Filter by text…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
            />
            <div className={styles.notePreview}>
              {blocks.length === 0 && <div className={styles.empty}>No blocks found</div>}
              {blocks.map((b) => (
                <button
                  key={b.blockId}
                  className={`${styles.previewBlock} ${styles[`previewBlock_${b.type}` as keyof typeof styles] ?? ''}`}
                  data-level={b.level}
                  onClick={() => doLinkFragment(sub.targetNote, b.blockId, b.text)}
                  title="Click to link to this block"
                >
                  {b.type === 'codeBlock'
                    ? <code className={styles.previewCode}>{b.text}</code>
                    : b.text}
                </button>
              ))}
            </div>
          </>
        );
      })()}
    </div>
  );
}

function SubHeader({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div className={styles.subHeader}>
      <button className={styles.backBtn} onClick={onBack}><ArrowLeft size={12} strokeWidth={2} /></button>
      <span>{label}</span>
    </div>
  );
}
