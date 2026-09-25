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
 * A `blockId` is a top-level block's permanent identity — tags, links and
 * transclusions key off it — so it must never be silently duplicated.
 * Strips `blockId` from `node` and every descendant that carries one, by
 * rebuilding from JSON with those attrs deleted. UniqueID then mints fresh
 * ids for all of them on the next transaction step.
 */
function stripBlockIds(json: Record<string, unknown>): Record<string, unknown> {
  let next = json;
  const attrs = next['attrs'];
  if (attrs && typeof attrs === 'object' && 'blockId' in attrs) {
    const rest = { ...(attrs as Record<string, unknown>) };
    delete rest['blockId'];
    next = { ...next, attrs: rest };
  }
  const content = next['content'];
  if (Array.isArray(content)) {
    next = { ...next, content: content.map((child) => stripBlockIds(child as Record<string, unknown>)) };
  }
  return next;
}

function withoutIds(node: PMNode): PMNode {
  return node.type.schema.nodeFromJSON(stripBlockIds(node.toJSON() as Record<string, unknown>));
}

/**
 * Block-level operations for notepad mode. Blocks are just the document's
 * top-level nodes, so these are thin wrappers around transactions and
 * Tiptap's built-in node commands — no wrapper node, no normaliser.
 *
 * `turnInto` policy when the source block contains more than one textblock
 * (e.g. a multi-item list):
 *  - Wrap targets (bulletList, orderedList, taskList, blockquote) regroup
 *    everything into a single resulting top-level node, which keeps the id.
 *  - paragraph / heading split into one top-level node per source textblock;
 *    only the first keeps the id, the rest are minted fresh ones.
 *  - codeBlock joins every source textblock's text with '\n' into a single
 *    code block, which keeps the id. Implemented directly (replaceWith)
 *    rather than via clearNodes + setCodeBlock, since a code block cannot
 *    represent the split any other way.
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

            // Preserve the caret's offset within the block when the
            // selection was inside it (not merely touching its boundary).
            const off = state.selection.from - top.from;
            const withinBlock = off > 0 && off < top.node.nodeSize;

            tr.delete(top.from, top.from + top.node.nodeSize);
            tr.insert(insertAt, top.node);
            const targetPos = withinBlock ? insertAt + off : insertAt;
            tr.setSelection(TextSelection.near(tr.doc.resolve(targetPos)));
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
            const copy = withoutIds(top.node);
            const after = top.from + top.node.nodeSize;
            tr.insert(after, copy);
            tr.setSelection(TextSelection.near(tr.doc.resolve(after)));
          }
          return true;
        },

      deleteBlock:
        (pos) =>
        ({ state, tr, dispatch }) => {
          const top = topLevelAt(state.doc, pos);
          if (!top) return false;

          const isOnlyEmptyParagraph =
            state.doc.childCount <= 1 &&
            top.node.type.name === 'paragraph' &&
            top.node.content.size === 0;
          if (isOnlyEmptyParagraph) return false;

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
        ({ state, tr, dispatch, chain }) => {
          const top = topLevelAt(state.doc, pos);
          // A `return false` from a raw command still gets its (possibly
          // no-op) `tr` auto-dispatched by Tiptap's CommandManager, which
          // would let plugins like StarterKit's TrailingNode append a
          // transaction on top of it. `preventDispatch` keeps a refusal an
          // actual no-op.
          const refuse = () => { tr.setMeta('preventDispatch', true); return false as const; };
          if (!top || top.node.isAtom) return refuse();
          if (!state.schema.nodes[type]) return refuse();
          // Already the target type: converting a codeBlock to a codeBlock
          // would silently drop its `language` attr, so treat it as a no-op.
          if (type === 'codeBlock' && top.node.type.name === 'codeBlock') return refuse();

          const id = top.node.attrs['blockId'];
          const restoreId = typeof id === 'string' && id ? id : null;
          const saved = state.selection.from;

          if (type === 'codeBlock') {
            const codeBlockType = state.schema.nodes['codeBlock'];
            if (!codeBlockType) return refuse();
            const texts: string[] = [];
            if (top.node.isTextblock) {
              texts.push(top.node.textContent);
            } else {
              top.node.descendants((node) => {
                if (node.isTextblock) texts.push(node.textContent);
              });
            }
            const joined = texts.join('\n');

            if (dispatch) {
              const node = codeBlockType.create(
                { blockId: restoreId },
                joined ? state.schema.text(joined) : null,
              );
              tr.replaceWith(top.from, top.from + top.node.nodeSize, node);

              // `replaceWith` maps a caret that was inside the replaced range
              // to the end of the range — i.e. into the *next* block — so a
              // caret that was inside the source block is repositioned by
              // text offset instead of via tr.mapping.
              const insideBlock = top.from < saved && saved < top.from + top.node.nodeSize;
              const caretPos = insideBlock
                ? top.from + 1 + Math.min(state.doc.textBetween(top.from, saved, '\n').length, joined.length)
                : tr.mapping.map(saved);
              tr.setSelection(TextSelection.near(tr.doc.resolve(caretPos)));
            }
            return true;
          }

          // Select the whole block, flatten it to paragraphs with the official
          // clearNodes, then apply the target type across the selection.
          const from = top.from + 1;
          const to = top.from + top.node.nodeSize - 1;
          tr.setSelection(TextSelection.between(tr.doc.resolve(from), tr.doc.resolve(to)));

          const finalize = ({ tr: t, dispatch: d }: { tr: typeof tr; dispatch?: typeof dispatch }): boolean => {
            if (d) {
              if (restoreId) t.setNodeAttribute(top.from, 'blockId', restoreId);
              t.setSelection(TextSelection.near(t.doc.resolve(t.mapping.map(saved))));
            }
            return true;
          };

          const c = chain().clearNodes();
          switch (type) {
            case 'paragraph':   return c.setParagraph().command(finalize).run();
            case 'heading':     return c.setHeading({ level: level ?? 1 }).command(finalize).run();
            case 'bulletList':  return c.toggleBulletList().command(finalize).run();
            case 'orderedList': return c.toggleOrderedList().command(finalize).run();
            case 'taskList':    return c.toggleTaskList().command(finalize).run();
            case 'blockquote':  return c.setBlockquote().command(finalize).run();
          }
        },
    };
  },
});
