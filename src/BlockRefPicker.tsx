import { useEffect, useMemo, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { ArrowLeft, Search } from 'lucide-react';
import { api } from '@renderer/ipc';
import { useNoteStore } from '../../store/notes';
import type { Block } from '@shared/types';
import styles from './BlockRefPicker.module.css';

interface Props {
  editor: Editor;
  /** Note doing the referencing — excluded, a note cannot transclude itself. */
  currentNoteId: string;
  onClose: () => void;
}

/** Types with no text of their own, labelled rather than shown blank. */
const TYPE_LABELS: Record<string, string> = {
  horizontalRule: 'Divider',
  mathBlock: 'Math block',
  blockRef: 'Block reference',
};

/**
 * Two-step picker: choose a note, then a block within it.
 *
 * Deliberately not a flat block search — a vault-wide block list is meaningless
 * without the note each block belongs to, and picking the note first is how
 * people actually remember where something was.
 */
export default function BlockRefPicker({ editor, currentNoteId, onClose }: Props) {
  const { notes } = useNoteStore();
  const [query, setQuery] = useState('');
  const [noteId, setNoteId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Block[] | null>(null);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes
      .filter((n) => n.id !== currentNoteId && n.deletedAt === null)
      .filter((n) => q === '' || (n.title || 'Untitled').toLowerCase().includes(q))
      .slice(0, 40);
  }, [notes, query, currentNoteId]);

  useEffect(() => {
    if (!noteId) { setBlocks(null); return; }
    let cancelled = false;
    api.blocks
      .listForNote(noteId)
      .then((rows) => { if (!cancelled) setBlocks(rows); })
      .catch(() => { if (!cancelled) setBlocks([]); });
    return () => { cancelled = true; };
  }, [noteId]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function choose(block: Block) {
    const pos = editor.state.selection.from;
    editor
      .chain()
      .focus()
      .command(({ commands }) =>
        commands.replaceBlockWith(pos, [
          { type: 'blockRef', attrs: { refBlockId: block.id, refNoteId: block.noteId } },
        ]),
      )
      .run();
    onClose();
  }

  // Blocks with a synthetic id cannot be referenced — their id is derived from
  // position, so it would point somewhere else as soon as the note is edited.
  const referenceable = (blocks ?? []).filter((b) => !b.id.includes(':'));

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        {noteId === null ? (
          <>
            <div className={styles.searchRow}>
              <Search size={13} strokeWidth={1.75} className={styles.searchIcon} />
              <input
                autoFocus
                className={styles.search}
                placeholder="Which note?"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className={styles.list}>
              {candidates.length === 0 ? (
                <p className={styles.empty}>No other notes</p>
              ) : (
                candidates.map((note) => (
                  <button key={note.id} className={styles.row} onClick={() => setNoteId(note.id)}>
                    <span className={styles.rowTitle}>{note.title || 'Untitled'}</span>
                    <span className={styles.rowMeta}>{note.kind}</span>
                  </button>
                ))
              )}
            </div>
          </>
        ) : (
          <>
            <div className={styles.header}>
              <button className={styles.back} onClick={() => setNoteId(null)}>
                <ArrowLeft size={13} strokeWidth={2} /> Notes
              </button>
              <span className={styles.headerTitle}>
                {notes.find((n) => n.id === noteId)?.title || 'Untitled'}
              </span>
            </div>
            <div className={styles.list}>
              {blocks === null ? (
                <p className={styles.empty}>Loading…</p>
              ) : referenceable.length === 0 ? (
                <p className={styles.empty}>
                  Nothing referenceable here. Only notepad blocks and annotated
                  paragraphs have stable ids.
                </p>
              ) : (
                referenceable.map((block) => (
                  <button key={block.id} className={styles.row} onClick={() => choose(block)}>
                    <span className={styles.rowTitle}>
                      {block.text || TYPE_LABELS[block.type] || block.type}
                    </span>
                    <span className={styles.rowMeta}>
                      {block.type === 'heading' ? `h${block.level}` : block.type}
                    </span>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
