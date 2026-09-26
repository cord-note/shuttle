import type { Editor } from '@tiptap/core';
import type { TableOfContentData } from '@tiptap/extension-table-of-contents';

/** Heading outline from the official TableOfContents extension. */
export function Outline({ items, editor }: { items: TableOfContentData; editor: Editor }) {
  if (items.length < 2) return null;
  return (
    <nav className="sh-outline" aria-label="Outline">
      {items.map((item) => (
        <button
          type="button"
          key={item.id}
          className={`sh-outline-item level-${item.level}${item.isActive ? ' is-active' : ''}`}
          onClick={() => {
            editor.chain().focus().setTextSelection(item.pos + 1).run();
            item.dom.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
          }}
        >
          {item.textContent || 'Untitled'}
        </button>
      ))}
    </nav>
  );
}
