import type { Node as PMNode } from '@tiptap/pm/model';
import { TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { topLevelAt } from './topLevel';

/**
 * Put a leaf block at the top level, never inside a list or other wrapper. An
 * empty top-level paragraph at the selection is replaced by it; otherwise it
 * goes right after that top-level block. A paragraph or heading always follows,
 * and the caret is left there as a plain TextSelection, ready to type.
 */
export function insertTopLevelAtom(
  state: EditorState, tr: Transaction, dispatch: ((tr: Transaction) => void) | undefined, node: PMNode,
): boolean {
  const top = topLevelAt(state.doc, state.selection.from);
  if (!top) return false;
  if (!dispatch) return true;

  const isEmptyParagraph = top.node.type.name === 'paragraph' && top.node.content.size === 0;
  let insertPos = top.from;
  if (isEmptyParagraph) {
    tr.replaceWith(insertPos, insertPos + top.node.nodeSize, node);
  } else {
    insertPos = top.from + top.node.nodeSize;
    tr.insert(insertPos, node);
  }

  const after = insertPos + node.nodeSize;
  const next = tr.doc.resolve(after).nodeAfter;
  if (!next || (next.type.name !== 'paragraph' && next.type.name !== 'heading')) {
    const paragraph = state.schema.nodes['paragraph'];
    if (paragraph) tr.insert(after, paragraph.create());
  }
  tr.setSelection(TextSelection.create(tr.doc, after + 1));
  dispatch(tr.scrollIntoView());
  return true;
}
