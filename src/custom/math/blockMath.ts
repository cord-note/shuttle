import { BlockMath } from '@tiptap/extension-mathematics';
import type { NodeViewRenderer } from '@tiptap/core';

export type BlockMathAlign = 'left' | 'center';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    shuttleBlockMath: {
      /** Aligns the block math node at `pos`. Fails when `pos` is not block math. */
      setBlockMathAlign: (pos: number, align: BlockMathAlign) => ReturnType;
    };
  }
}

const parseAlign = (value: unknown): BlockMathAlign => (value === 'left' ? 'left' : 'center');

/**
 * The official block math node plus an `align` attribute (left or centre,
 * default centre). The official node view ignores extra attributes and has no
 * `update()`, so ProseMirror recreates it on every attribute change; wrapping
 * it to stamp `data-align` on its DOM is therefore enough to keep the
 * rendered alignment current, with the parent's KaTeX render and click
 * handling untouched.
 */
export const shuttleBlockMath = BlockMath.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: 'center',
        parseHTML: (element: HTMLElement): BlockMathAlign => parseAlign(element.getAttribute('data-align')),
        renderHTML: (attributes: Record<string, unknown>) => ({ 'data-align': parseAlign(attributes['align']) }),
      },
    };
  },

  addNodeView() {
    const parent = this.parent?.();
    if (!parent) return null;
    const renderer: NodeViewRenderer = (props) => {
      const view = parent(props);
      if (view.dom instanceof HTMLElement) view.dom.dataset['align'] = parseAlign(props.node.attrs['align']);
      return view;
    };
    return renderer;
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setBlockMathAlign:
        (pos: number, align: BlockMathAlign) =>
        ({ tr, dispatch }) => {
          const node = tr.doc.nodeAt(pos);
          if (!node || node.type !== this.type) return false;
          if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, align });
          return true;
        },
    };
  },
});
