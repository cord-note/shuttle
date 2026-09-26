import { useCallback, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { DragHandle } from '@tiptap/extension-drag-handle-react';
import { GripVertical, Plus } from 'lucide-react';
import type { ShuttleContextRef } from '../context';
import { BlockMenu } from './BlockMenu';

/**
 * Notepad gutter on the official Drag Handle: drag to reorder, `+` to add a
 * block below (opens the slash menu), grip click for the block menu.
 * `nested` is off, so `onNodeChange` reports top-level block positions.
 */
export function BlockGutter({ editor, ctx }: { editor: Editor; ctx: ShuttleContextRef }) {
  const hovered = useRef<number>(-1);
  const [menu, setMenu] = useState<{ pos: number; top: number; left: number } | null>(null);
  const close = useCallback(() => setMenu(null), []);

  return (
    <>
      <DragHandle editor={editor} onNodeChange={({ node, pos }) => { hovered.current = node ? pos : -1; }}>
        <div className="sh-gutter" data-sh-gutter="">
          <button
            type="button"
            className="sh-gutter-btn"
            title="Add block below"
            onClick={() => {
              const pos = hovered.current;
              const node = pos >= 0 ? editor.state.doc.nodeAt(pos) : null;
              if (!node) return;
              const after = pos + node.nodeSize;
              editor.chain().focus()
                .insertContentAt(after, { type: 'paragraph', content: [{ type: 'text', text: '/' }] })
                .setTextSelection(after + 2)
                .run();
            }}
          >
            <Plus size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="sh-gutter-btn sh-gutter-grip"
            title="Drag to move · click for options"
            onClick={(e) => {
              if (hovered.current < 0) return;
              const rect = e.currentTarget.getBoundingClientRect();
              setMenu({ pos: hovered.current, top: rect.bottom + 4, left: rect.left });
            }}
          >
            <GripVertical size={14} strokeWidth={1.75} />
          </button>
        </div>
      </DragHandle>
      {menu && <BlockMenu editor={editor} ctx={ctx} pos={menu.pos} top={menu.top} left={menu.left} onClose={close} />}
    </>
  );
}
