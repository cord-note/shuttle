import type { EditorState } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import { BLOCK_NODE_NAME } from '@shared/constants';

/** Renderer-side event: open the block reference picker. */
export const OPEN_REF_PICKER_EVENT = 'cord:open-ref-picker';

/** Renderer-side event: open the block menu for a given block. */
export const OPEN_BLOCK_MENU_EVENT = 'cord:open-block-menu';

export interface BlockTarget {
  blockId: string | null;
  /** Position of the enclosing block, or of the textblock in a plain note. */
  pos: number;
  /** Content node — the block's child in a notepad, the node itself in a note. */
  node: PMNode;
}

/**
 * Locate the block containing a position, in either document shape.
 *
 * A notepad's id lives on the `block` wrapper; a plain note's lives on the
 * annotatable node itself. Every caller that needs "the current block" goes
 * through this, so the difference is stated once rather than at each call site.
 */
export function blockTargetAt(state: EditorState, pos?: number): BlockTarget | null {
  const $pos = state.doc.resolve(pos ?? state.selection.from);

  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (node.type.name === BLOCK_NODE_NAME) {
      return {
        blockId: (node.attrs['blockId'] as string | null) ?? null,
        pos: $pos.before(depth),
        node: node.firstChild ?? node,
      };
    }
  }

  // Plain note: the nearest ancestor that carries a blockId, else the parent.
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    const id = node.attrs['blockId'] as string | null | undefined;
    if (id) return { blockId: id, pos: $pos.before(depth), node };
  }

  return { blockId: null, pos: $pos.before($pos.depth), node: $pos.parent };
}

/** The current block's id, or null when the caret is not in an addressable one. */
export function blockIdAt(state: EditorState, pos?: number): string | null {
  return blockTargetAt(state, pos)?.blockId ?? null;
}
