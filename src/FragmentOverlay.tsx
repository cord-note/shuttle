import { useEffect, useState, useCallback } from 'react';
import type { Editor } from '@tiptap/core';
import { X } from 'lucide-react';
import { useFragmentStore } from '../../store/fragments';
import { useNoteStore } from '../../store/notes';
import styles from './FragmentOverlay.module.css';

interface Props {
  editor: Editor;
  noteId: string;
  contentEl: HTMLElement | null;
}

export function FragmentOverlay({ editor, noteId: _noteId, contentEl }: Props) {
  const { annotations, detachTag, deleteLink } = useFragmentStore();
  const notes = useNoteStore((s) => s.notes);

  const removeLinkFromEditor = useCallback((linkId: string) => {
    const { state, view } = editor;
    let range: { from: number; to: number } | null = null;
    state.doc.descendants((node, pos) => {
      if (node.type.name === 'fragmentLinkNode' && node.attrs.linkId === linkId) {
        range = { from: pos, to: pos + node.nodeSize };
        return false;
      }
    });
    if (range) {
      view.dispatch(state.tr.delete((range as { from: number; to: number }).from, (range as { from: number; to: number }).to));
    } else {
      deleteLink(linkId);
    }
  }, [editor, deleteLink]);

  const [positions, setPositions]             = useState<Record<string, number>>({});
  const [gutterLeft, setGutterLeft]           = useState<number | null>(null);
  const [highlightedBlockId, setHighlightedBlockId] = useState<string | null>(null);

  const measure = useCallback(() => {
    requestAnimationFrame(() => {
      if (!contentEl || !editor || editor.isDestroyed) return;

      const pm = editor.view.dom as HTMLElement;
      const containerRect = contentEl.getBoundingClientRect();
      const pmRect = pm.getBoundingClientRect();

      setGutterLeft(pmRect.right - containerRect.left + 12);

      const newPos: Record<string, number> = {};
      for (const blockId of Object.keys(annotations)) {
        const el = pm.querySelector(`[data-block-id="${blockId}"]`) as HTMLElement | null;
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        newPos[blockId] = rect.top - containerRect.top + contentEl.scrollTop;
      }
      setPositions(newPos);
    });
  }, [contentEl, editor, annotations]);

  useEffect(() => {
    if (!editor || !contentEl) return;
    editor.on('update', measure);
    editor.on('selectionUpdate', measure);
    const ro = new ResizeObserver(measure);
    ro.observe(contentEl);
    ro.observe(editor.view.dom as HTMLElement);
    contentEl.addEventListener('scroll', measure, { passive: true });
    measure();
    return () => {
      editor.off('update', measure);
      editor.off('selectionUpdate', measure);
      ro.disconnect();
      contentEl.removeEventListener('scroll', measure);
    };
  }, [editor, contentEl, measure]);

  useEffect(() => {
    const pm = editor?.view.dom;
    if (!pm) return;
    pm.querySelectorAll('.fragment-highlight').forEach((el) => el.classList.remove('fragment-highlight'));
    if (highlightedBlockId) {
      pm.querySelector(`[data-block-id="${highlightedBlockId}"]`)?.classList.add('fragment-highlight');
    }
  }, [highlightedBlockId, editor]);

  if (gutterLeft === null) return null;

  return (
    <div className={styles.overlay} style={{ left: gutterLeft }}>
      {Object.entries(annotations).map(([blockId, annotation]) => {
        const top = positions[blockId];
        if (top === undefined) return null;

        return (
          <div key={blockId} className={styles.row} style={{ top }}>
            {annotation.backlinks.map((link) => {
              const srcNote = link.fromFragmentId
                ? notes.find((n) => n.id !== _noteId)
                : null;
              return (
                <span
                  key={`bl-${link.id}`}
                  className={styles.backlinkChip}
                  onMouseEnter={() => setHighlightedBlockId(link.fromFragmentId)}
                  onMouseLeave={() => setHighlightedBlockId(null)}
                  title={`← linked from fragment${srcNote ? ` in ${srcNote.title}` : ''}`}
                >
                  ← {link.fromFragmentId.slice(0, 6)}
                </span>
              );
            })}

            {annotation.tags.map((tag) => (
              <span
                key={tag.id}
                className={styles.tagChip}
                style={{ borderColor: tag.color ?? 'var(--text-muted)' }}
                onMouseEnter={() => setHighlightedBlockId(blockId)}
                onMouseLeave={() => setHighlightedBlockId(null)}
              >
                <span className={styles.dot} style={{ background: tag.color ?? 'var(--text-muted)' }} />
                {tag.name}
                <button
                  className={styles.chipRemove}
                  onClick={() => detachTag(blockId, tag.id)}
                  title="Remove tag"
                >
                  <X size={9} strokeWidth={2.5} />
                </button>
              </span>
            ))}

            {annotation.links.map((link) => (
              <span
                key={link.id}
                className={styles.linkChip}
                onMouseEnter={() => setHighlightedBlockId(link.toFragmentId ?? null)}
                onMouseLeave={() => setHighlightedBlockId(null)}
                title={link.toFragmentId ? `→ fragment` : `→ note`}
              >
                {link.toFragmentId ? '§' : '→'} {link.toFragmentId ? 'fragment' : 'note'}
                <button
                  className={styles.chipRemove}
                  onClick={() => removeLinkFromEditor(link.id)}
                  title="Remove link"
                >
                  <X size={9} strokeWidth={2.5} />
                </button>
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}
