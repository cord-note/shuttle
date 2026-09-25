import { Extension } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import { topLevelAt } from '../../doc/topLevel';

export type TurnIntoType =
  | 'paragraph' | 'heading' | 'bulletList' | 'orderedList' | 'taskList' | 'blockquote' | 'codeBlock';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockCommands: {
      /** Move the top-level block at `pos` by `delta` places. */
      moveBlock: (pos: number, delta: number) => ReturnType;
      /** Insert a copy of the block after it; UniqueID gives the copy a new id. */
      duplicateBlock: (pos: number) => ReturnType;
      /** Delete the block, leaving an empty paragraph if it was the only one. */
      deleteBlock: (pos: number) => ReturnType;
      /** Convert the block using Tiptap's own commands. */
      turnInto: (pos: number, type: TurnIntoType, level?: 1 | 2 | 3) => ReturnType;
    };
  }
}

/**
 * Block-level operations for notepad mode. Blocks are just the document's
 * top-level nodes, so these are thin wrappers around transactions and
 * Tiptap's built-in node commands — no wrapper node, no normaliser.
 */
export const BlockCommands = Extension.create({
  name: 'blockCommands',

  addCommands() {
    return {
      moveBlock:
        (pos, delta) =>
        ({ state, tr, dispatch }) => {
          const top = topLevelAt(state.doc, pos);
          if (!top) return false;
          const target = top.index + delta;
          if (target < 0 || target >= state.doc.childCount) return false;

          if (dispatch) {
            // Insertion point in post-deletion coordinates: the sizes of the
            // siblings that remain before the target slot.
            const remaining: PMNode[] = [];
            state.doc.forEach((child, _offset, i) => { if (i !== top.index) remaining.push(child); });
            let insertAt = 0;
            for (let i = 0; i < target; i++) insertAt += remaining[i]!.nodeSize;

            tr.delete(top.from, top.from + top.node.nodeSize);
            tr.insert(insertAt, top.node);
            tr.setSelection(TextSelection.near(tr.doc.resolve(insertAt + 1)));
            tr.scrollIntoView();
          }
          return true;
        },

      duplicateBlock:
        (pos) =>
        ({ state, tr, dispatch }) => {
          const top = topLevelAt(state.doc, pos);
          if (!top) return false;
          if (dispatch) {
            const copy = top.node.type.create(
              { ...top.node.attrs, blockId: null },
              top.node.content,
              top.node.marks,
            );
            const after = top.from + top.node.nodeSize;
            tr.insert(after, copy);
            tr.setSelection(TextSelection.near(tr.doc.resolve(after + 1)));
          }
          return true;
        },

      deleteBlock:
        (pos) =>
        ({ state, tr, dispatch }) => {
          const top = topLevelAt(state.doc, pos);
          if (!top) return false;
          if (dispatch) {
            if (state.doc.childCount <= 1) {
              const empty = state.schema.nodes['paragraph']!.create();
              tr.replaceWith(0, state.doc.content.size, empty);
              tr.setSelection(TextSelection.near(tr.doc.resolve(1)));
            } else {
              tr.delete(top.from, top.from + top.node.nodeSize);
              tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(top.from, tr.doc.content.size)), -1));
            }
          }
          return true;
        },

      turnInto:
        (pos, type, level) =>
        ({ state, tr, chain }) => {
          const top = topLevelAt(state.doc, pos);
          if (!top || top.node.isAtom) return false;

          // Select the whole block, flatten it to paragraphs with the official
          // clearNodes, then apply the target type across the selection.
          const from = top.from + 1;
          const to = top.from + top.node.nodeSize - 1;
          tr.setSelection(TextSelection.between(tr.doc.resolve(from), tr.doc.resolve(to)));

          const c = chain().clearNodes();
          switch (type) {
            case 'paragraph':   return c.setParagraph().run();
            case 'heading':     return c.setHeading({ level: level ?? 1 }).run();
            case 'bulletList':  return c.toggleBulletList().run();
            case 'orderedList': return c.toggleOrderedList().run();
            case 'taskList':    return c.toggleTaskList().run();
            case 'blockquote':  return c.setBlockquote().run();
            case 'codeBlock':   return c.setCodeBlock().run();
          }
        },
    };
  },
});
