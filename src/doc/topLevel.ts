import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorState } from '@tiptap/pm/state';

export interface TopLevel {
  /** Index among the document's children. */
  index: number;
  /** Position immediately before the node. */
  from: number;
  node: PMNode;
}

/**
 * The top-level node containing `pos` — a notepad block, or the paragraph /
 * list / table a plain note's caret is in. A position between two top-level
 * nodes resolves to the one after it (or the last one at the very end).
 */
export function topLevelAt(doc: PMNode, pos: number): TopLevel | null {
  if (doc.childCount === 0) return null;
  const clamped = Math.max(0, Math.min(pos, doc.content.size));
  const index = Math.min(doc.resolve(clamped).index(0), doc.childCount - 1);
  let from = 0;
  for (let i = 0; i < index; i++) from += doc.child(i).nodeSize;
  return { index, from, node: doc.child(index) };
}

/** The `blockId` of the top-level node at `pos` (default: the selection). */
export function blockIdAt(state: EditorState, pos?: number): string | null {
  const top = topLevelAt(state.doc, pos ?? state.selection.from);
  const id = top?.node.attrs['blockId'];
  return typeof id === 'string' ? id : null;
}
