import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import BlockRefView from './BlockRefView';

declare module '@tiptap/core' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Commands<ReturnType> {
    blockRef: {
      /** Insert a transclusion of another note's block at the selection. */
      insertBlockRef: (refBlockId: string, refNoteId: string) => ReturnType;
    };
  }
}

/**
 * A read-only transclusion of a block belonging to another note.
 *
 * Stores only the target's ids — never a copy of its content. Content is
 * resolved at render time from the source note's body_json, so a transclusion
 * cannot go stale and editing the source is immediately reflected everywhere it
 * appears.
 *
 * The attribute shape is already what write-through editing would need, so
 * making transclusions editable later requires no schema change and therefore
 * no migration of existing documents.
 */
export const BlockRef = Node.create({
  name: 'blockRef',

  group: 'block',

  atom: true,

  selectable: true,

  draggable: false,

  addAttributes() {
    return {
      refBlockId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-ref-block-id'),
        renderHTML: (attrs) => ({ 'data-ref-block-id': attrs['refBlockId'] }),
      },
      refNoteId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-ref-note-id'),
        renderHTML: (attrs) => ({ 'data-ref-note-id': attrs['refNoteId'] }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-block-ref]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-block-ref': '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(BlockRefView);
  },

  addCommands() {
    return {
      insertBlockRef:
        (refBlockId, refNoteId) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { refBlockId, refNoteId },
          }),
    };
  },
});
