import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import type { ShuttleContextRef } from '../context';
import type { BlockSummary, NoteRef } from '../host';

const TYPE_LABELS: Record<string, string> = {
  horizontalRule: 'Divider', blockMath: 'Math block', blockRef: 'Block reference', image: 'Image',
  youtube: 'YouTube', twitch: 'Twitch', table: 'Table', details: 'Toggle',
};

export interface RefPickerProps {
  ctx: ShuttleContextRef;
  /** Dialog label, e.g. "Insert block reference". */
  title: string;
  /** Given, picking a note finishes here; otherwise the picker goes on to its blocks. */
  onNote?: (note: NoteRef) => void;
  onBlock: (block: BlockSummary, note: NoteRef) => void;
  onClose: () => void;
}

/**
 * Picks a note, then (unless `onNote` is given) one of its blocks. Used for
 * transclusions and, through `ShuttleControls`, by hosts for their own links.
 * The note being edited is never offered.
 */
export function RefPicker({ ctx, title, onNote, onBlock, onClose }: RefPickerProps) {
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState<NoteRef[]>([]);
  const [note, setNote] = useState<NoteRef | null>(null);
  const [blocks, setBlocks] = useState<BlockSummary[] | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    ctx.current.host.searchNotes(query)
      .then((r) => { if (!cancelled) setNotes(r.filter((n) => n.id !== ctx.current.docKey).slice(0, 40)); })
      .catch((error: unknown) => {
        ctx.current.host.log('warn', 'Searching notes for the reference picker failed', { error: String(error) });
        if (!cancelled) setNotes([]);
      });
    return () => { cancelled = true; };
  }, [query, ctx]);

  useEffect(() => {
    if (!note) { setBlocks(null); return; }
    let cancelled = false;
    ctx.current.host.listBlocks(note.id)
      .then((r) => { if (!cancelled) setBlocks(r); })
      .catch((error: unknown) => {
        ctx.current.host.log('warn', 'Listing blocks for the reference picker failed', { noteId: note.id, error: String(error) });
        if (!cancelled) setBlocks([]);
      });
    return () => { cancelled = true; };
  }, [note, ctx]);

  useEffect(() => {
    // Escape from another overlay (e.g. the find bar's input) is that overlay's.
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      const target = e.target instanceof Node ? e.target : null;
      if (target === null || target === document.body || target === document.documentElement || panel.current?.contains(target)) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Synthetic ids (`note:index`) are positional and cannot be referenced.
  const referenceable = (blocks ?? []).filter((b) => !b.id.includes(':'));

  return (
    <div className="sh-refpicker" onClick={onClose}>
      <div className="sh-refpicker-panel" ref={panel} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        {note === null ? (
          <>
            <div className="sh-refpicker-search">
              <Search size={13} strokeWidth={1.75} />
              <input autoFocus placeholder="Which note?" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="sh-refpicker-list">
              {notes.length === 0 ? <p className="sh-refpicker-empty">No other notes</p> : notes.map((n) => (
                <button type="button" key={n.id} className="sh-refpicker-row" onClick={() => (onNote ? onNote(n) : setNote(n))}>{n.title || 'Untitled'}</button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="sh-refpicker-head">
              <button type="button" className="sh-refpicker-back" onClick={() => setNote(null)}><ArrowLeft size={13} strokeWidth={2} /> Notes</button>
              <span>{note.title || 'Untitled'}</span>
            </div>
            <div className="sh-refpicker-list">
              {blocks === null ? <p className="sh-refpicker-empty">Loading…</p>
                : referenceable.length === 0 ? <p className="sh-refpicker-empty">Nothing referenceable in this note.</p>
                : referenceable.map((b) => (
                  <button
                    type="button"
                    key={b.id}
                    className="sh-refpicker-row"
                    onClick={() => onBlock(b, note)}
                  >
                    <span>{b.text || TYPE_LABELS[b.type] || b.type}</span>
                    <span className="sh-refpicker-meta">{b.type === 'heading' ? `h${b.level ?? ''}` : b.type}</span>
                  </button>
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
