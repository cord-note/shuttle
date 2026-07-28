import { useEffect, useState, useCallback } from 'react';
import type { Editor } from '@tiptap/core';
import { useNoteStore } from '../../store/notes';
import styles from './WikiLinkPills.module.css';

interface PillRow {
  y: number;
  titles: string[];
}

interface Props {
  editor: Editor;
  contentEl: HTMLElement | null;
}

export function WikiLinkPills({ editor, contentEl }: Props) {
  const [pills, setPills]         = useState<PillRow[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const notes = useNoteStore((s) => s.notes);

  const measure = useCallback(() => {
    requestAnimationFrame(() => {
      if (!contentEl || !editor || editor.isDestroyed) return;

      const pm            = editor.view.dom as HTMLElement;
      const containerRect = contentEl.getBoundingClientRect();
      const pmRect        = pm.getBoundingClientRect();

      setCollapsed(containerRect.right - pmRect.right < 130);

      const lineMap = new Map<number, string[]>();

      editor.state.doc.descendants((node, pos) => {
        let title: string | null = null;

        if (node.type.name === 'wikiLink') {
          const note = notes.find((n) => n.id === node.attrs.id);
          title = note?.title || node.attrs.label || 'note';
        } else if (node.type.name === 'fragmentLinkNode' && node.attrs.toNoteId) {
          const note = notes.find((n) => n.id === node.attrs.toNoteId);
          title = note?.title || 'note';
        }

        if (!title) return;

        const coords = editor.view.coordsAtPos(pos);
        const y = Math.round(coords.top - containerRect.top + contentEl.scrollTop);
        const key = Math.round(y / 6) * 6;

        if (!lineMap.has(key)) lineMap.set(key, []);
        const arr = lineMap.get(key)!;
        if (!arr.includes(title)) arr.push(title);
      });

      setPills(
        Array.from(lineMap.entries())
          .sort(([a], [b]) => a - b)
          .map(([y, titles]) => ({ y, titles })),
      );
    });
  }, [contentEl, editor, notes]);

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

  if (pills.length === 0) return null;

  return (
    <div className={styles.overlay}>
      {pills.map(({ y, titles }) =>
        collapsed ? (
          <span
            key={y}
            className={styles.dot}
            style={{ top: y }}
            title={titles.join(', ')}
          >
            {titles.length > 1 && <span className={styles.dotCount}>{titles.length}</span>}
          </span>
        ) : (
          <span
            key={y}
            className={styles.pill}
            style={{ top: y }}
          >
            {titles.join(' · ')}
          </span>
        )
      )}
    </div>
  );
}
