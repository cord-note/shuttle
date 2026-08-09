import { Node, mergeAttributes } from '@tiptap/core';
import { TextSelection, NodeSelection } from '@tiptap/pm/state';
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';
import { canSplit } from '@tiptap/pm/transform';
import { BLOCK_CONTENT_TYPES, BLOCK_NODE_NAME } from '@shared/constants';

/**
 * A notepad's document: `doc → block+`.
 *
 * The "no content outside a block" rule is enforced by the schema itself, not by
 * application code, so there is no code path that can produce a stray paragraph.
 *
 * Declared here rather than extending StarterKit's Document, which is not
 * exported on its own — a top node is only a name and a content expression, and
 * this way there is no extra dependency to keep in step.
 */
export const NotepadDocument = Node.create({
  name: 'doc',
  topNode: true,
  content: `${BLOCK_NODE_NAME}+`,
});

/** Depth of a content node inside a notepad: doc(0) → block(1) → content(2). */
const CONTENT_DEPTH = 2;

/** The `block` ancestor of a position, or null if there is none. */
function blockDepthAt($pos: ResolvedPos): number | null {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name === BLOCK_NODE_NAME) return d;
  }
  return null;
}

export interface BlockCommandOptions {
  /** Document position anywhere inside the target block. */
  pos: number;
}

declare module '@tiptap/core' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Commands<ReturnType> {
    block: {
      /** Insert an empty paragraph block after the block at `pos`. */
      insertBlockAfter: (pos?: number) => ReturnType;
      /** Move the block at `pos` by `delta` positions among its siblings. */
      moveBlock: (pos: number, delta: number) => ReturnType;
      /** Duplicate the block at `pos`, new id minted by the normalizer. */
      duplicateBlock: (pos: number) => ReturnType;
      /** Delete the block at `pos`, keeping at least one block in the doc. */
      deleteBlock: (pos: number) => ReturnType;
      /** Replace the content node of the block at `pos` with another type. */
      turnBlockInto: (
        pos: number,
        type: string,
        attrs?: Record<string, unknown>,
      ) => ReturnType;
      /**
       * Replace the block at `pos` with one block per given content node.
       * How anything multi-block gets inserted — templates, dividers, math.
       */
      replaceBlockWith: (pos: number, contentNodes: JSONContent[]) => ReturnType;
    };
  }
}

/** Minimal shape of a serialised node, matching Tiptap's JSONContent. */
export interface JSONContent {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: JSONContent[];
  text?: string;
  marks?: unknown[];
}

/**
 * The notepad block wrapper — one addressable unit of a page.
 *
 * Holds exactly one content node, named explicitly rather than by group so that
 * no built-in node definition has to be altered to participate.
 */
export const Block = Node.create({
  name: BLOCK_NODE_NAME,

  group: 'blockContainer',

  content: BLOCK_CONTENT_TYPES.join(' | '),

  // Keeps the wrapper intact through lifts and replacements, so toggling a
  // paragraph to a list changes the content node without unwrapping the block.
  defining: true,

  addAttributes() {
    return {
      blockId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-block-id'),
        renderHTML: (attrs) =>
          attrs['blockId'] ? { 'data-block-id': attrs['blockId'] } : {},
      },
    };
  },

  parseHTML() {
    // Matches on `data-block`, not `data-block-id` — plain notes stamp
    // data-block-id onto paragraphs, and those must not parse as wrappers.
    return [{ tag: 'div[data-block]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-block': '' }), 0];
  },

  addCommands() {
    return {
      insertBlockAfter:
        (pos) =>
        ({ state, tr, dispatch }) => {
          const $pos = state.doc.resolve(pos ?? state.selection.from);
          const depth = blockDepthAt($pos);
          if (depth === null) return false;

          const after = $pos.after(depth);
          const block = state.schema.nodes[BLOCK_NODE_NAME]!.createAndFill();
          if (!block) return false;

          if (dispatch) {
            tr.insert(after, block);
            // Land the caret inside the new block, not after it.
            tr.setSelection(TextSelection.near(tr.doc.resolve(after + 1)));
            tr.scrollIntoView();
          }
          return true;
        },

      moveBlock:
        (pos, delta) =>
        ({ state, tr, dispatch }) => {
          const $pos = state.doc.resolve(pos);
          const depth = blockDepthAt($pos);
          if (depth === null) return false;

          const index = $pos.index(depth - 1);
          const parent = $pos.node(depth - 1);
          const target = index + delta;
          if (target < 0 || target >= parent.childCount) return false;

          const node = $pos.node(depth);
          const from = $pos.before(depth);

          if (dispatch) {
            // The insertion point is computed in *post-deletion* coordinates, by
            // summing the siblings that remain once the moved block is gone.
            //
            // Mapping a pre-deletion position through the delete instead does not
            // work for downward moves: the position being mapped is the boundary
            // the deletion collapses, so it maps straight back to where the block
            // started and the move silently does nothing.
            //
            // `start(depth - 1)`, not `before(depth - 1)`: for a top-level block
            // the parent is the document, and there is no position before the top
            // node — `before(0)` throws.
            const siblings: PMNode[] = [];
            parent.forEach((child) => siblings.push(child));
            const remaining = siblings.filter((_, i) => i !== index);

            let insertAt = $pos.start(depth - 1);
            for (let i = 0; i < target; i++) insertAt += remaining[i]!.nodeSize;

            tr.delete(from, from + node.nodeSize);
            tr.insert(insertAt, node);
            tr.setSelection(TextSelection.near(tr.doc.resolve(insertAt + 1)));
            tr.scrollIntoView();
          }
          return true;
        },

      duplicateBlock:
        (pos) =>
        ({ state, tr, dispatch }) => {
          const $pos = state.doc.resolve(pos);
          const depth = blockDepthAt($pos);
          if (depth === null) return false;

          const node = $pos.node(depth);
          const after = $pos.after(depth);

          if (dispatch) {
            // Strip the id so the normalizer mints a fresh one — two blocks
            // sharing an id would collide in the index and share fragment tags.
            const copy = node.type.create(
              { ...node.attrs, blockId: null },
              node.content,
              node.marks,
            );
            tr.insert(after, copy);
            tr.setSelection(TextSelection.near(tr.doc.resolve(after + 1)));
          }
          return true;
        },

      /**
       * Retype a block's content, carrying text across where the target can
       * hold it.
       *
       * Lists get one item per source line so that turning a paragraph into a
       * list does not bury its text in a single bullet. Types that hold no text
       * (divider, math) discard it — the caller warns before that happens.
       */
      turnBlockInto:
        (pos, type, attrs) =>
        ({ state, tr, dispatch, editor }) => {
          const $pos = state.doc.resolve(pos);
          const depth = blockDepthAt($pos);
          if (depth === null) return false;

          const target = state.schema.nodes[type];
          if (!target) return false;

          const block = $pos.node(depth);
          const current = block.firstChild;
          if (!current || current.type === target) return false;

          const contentStart = $pos.before(depth) + 1;
          const contentEnd = contentStart + current.nodeSize;
          const text = current.textContent;

          let replacement: PMNode | null = null;

          // `createChecked`, never `create`: plain `create` does not validate its
          // content, so an impossible conversion would build an invalid node and
          // corrupt the document instead of failing. Guarded, so an unconvertible
          // pair leaves the document untouched.
          try {
            if (target.spec['content']?.includes('listItem') || type === 'taskList') {
              const itemType = type === 'taskList'
                ? state.schema.nodes['taskItem']!
                : state.schema.nodes['listItem']!;
              const lines = text.split('\n').filter((l) => l.trim() !== '');
              const items = (lines.length > 0 ? lines : ['']).map((line) =>
                itemType.createAndFill(
                  type === 'taskList' ? { checked: false } : null,
                  state.schema.nodes['paragraph']!.create(
                    null,
                    line ? state.schema.text(line) : null,
                  ),
                )!,
              );
              replacement = target.createChecked(attrs ?? null, items);
            } else if (target.isTextblock) {
              replacement = target.createChecked(attrs ?? null, text ? state.schema.text(text) : null);
            } else if (target.spec['content']) {
              // Wrapping types (blockquote) take the existing node as their child.
              //
              // Not `createAndFill`: for a `block+` content spec it returns null
              // even when the child is perfectly valid, which silently turned
              // "Turn into → Quote" into a no-op.
              replacement = target.createChecked(attrs ?? null, current);
            } else {
              // Atoms — divider, math, transclusion. Text cannot survive.
              replacement = target.createChecked(attrs ?? null);
            }
          } catch {
            return false;
          }

          if (!replacement) return false;

          if (dispatch) {
            tr.replaceWith(contentStart, contentEnd, replacement);
            const landing = tr.doc.resolve(Math.min(contentStart + 1, tr.doc.content.size));
            tr.setSelection(TextSelection.near(landing));
            editor.view.focus();
          }
          return true;
        },

      /**
       * Swap one block for a run of blocks.
       *
       * Every multi-node insertion in a notepad goes through here rather than
       * through insertContent. insertContent would hand block-level nodes to
       * ProseMirror's fitting algorithm from inside a paragraph nested in a
       * block, and where they land depends on what happens to fit — templates
       * would come out subtly different depending on the caret's block. This is
       * explicit instead: the target block is replaced, one wrapper per node.
       */
      replaceBlockWith:
        (pos, contentNodes) =>
        ({ state, tr, dispatch }) => {
          if (contentNodes.length === 0) return false;

          const $pos = state.doc.resolve(pos);
          const depth = blockDepthAt($pos);
          if (depth === null) return false;

          const blockType = state.schema.nodes[BLOCK_NODE_NAME]!;
          let wrapped: PMNode[];
          try {
            // createChecked so a node that cannot legally sit inside a block is
            // rejected outright rather than producing an invalid document.
            wrapped = contentNodes.map((json) =>
              blockType.createChecked(null, state.schema.nodeFromJSON(json)),
            );
          } catch {
            return false;
          }

          const from = $pos.before(depth);
          const to = $pos.after(depth);

          if (dispatch) {
            tr.replaceWith(from, to, wrapped);
            // Land in the first inserted block so typing continues naturally.
            tr.setSelection(TextSelection.near(tr.doc.resolve(from + 1)));
            tr.scrollIntoView();
          }
          return true;
        },

      deleteBlock:
        (pos) =>
        ({ state, tr, dispatch }) => {
          const $pos = state.doc.resolve(pos);
          const depth = blockDepthAt($pos);
          if (depth === null) return false;

          // The normalizer would re-add an empty block, but deleting the only
          // block first would momentarily leave an invalid document.
          if (state.doc.childCount <= 1) {
            if (dispatch) {
              const empty = state.schema.nodes[BLOCK_NODE_NAME]!.createAndFill();
              if (empty) tr.replaceWith(0, state.doc.content.size, empty);
              tr.setSelection(TextSelection.near(tr.doc.resolve(1)));
            }
            return true;
          }

          const from = $pos.before(depth);
          const to = $pos.after(depth);
          if (dispatch) {
            tr.delete(from, to);
            tr.setSelection(TextSelection.near(tr.doc.resolve(Math.max(1, from)), -1));
          }
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      /**
       * Enter splits the wrapper as well as the textblock.
       *
       * The default splitBlock only splits the textblock, which would leave one
       * `block` holding two nodes — invalid against the content spec, so canSplit
       * refuses and Enter does nothing at all. Splitting at depth 2 produces two
       * well-formed blocks instead.
       */
      Enter: ({ editor }) => {
        const { state, view } = editor;
        const { selection } = state;
        if (!selection.empty) return false;

        const $from = selection.$from;
        // Only handle content sitting directly inside a block. Lists and quotes
        // are deeper, and their own Enter handling keeps the caret inside one
        // block, which is what we want.
        if ($from.depth !== CONTENT_DEPTH) return false;
        if (!$from.parent.isTextblock) return false;
        // Code blocks take a newline on Enter rather than splitting.
        if ($from.parent.type.name === 'codeBlock') return false;

        const atEnd = $from.parentOffset === $from.parent.content.size;
        const tr = state.tr;

        if (atEnd) {
          // A new block after a heading should be a paragraph, not another
          // heading — otherwise every Enter after a title makes another title.
          const block = state.schema.nodes[BLOCK_NODE_NAME]!.createAndFill();
          if (!block) return false;
          const after = $from.after(1);
          tr.insert(after, block);
          tr.setSelection(TextSelection.near(tr.doc.resolve(after + 1)));
          tr.scrollIntoView();
          view.dispatch(tr);
          return true;
        }

        if (!canSplit(state.doc, $from.pos, CONTENT_DEPTH)) return false;
        tr.split($from.pos, CONTENT_DEPTH);
        tr.scrollIntoView();
        view.dispatch(tr);
        return true;
      },

      /**
       * Backspace at the very start of a block merges it into the one above.
       *
       * joinBackward cannot do this: joining two wrappers would give one block
       * two content nodes. Deleting just the boundary tokens merges the two
       * content nodes into a single block instead.
       */
      Backspace: ({ editor }) => {
        const { state, view } = editor;
        const { selection } = state;
        if (!selection.empty) return false;

        const $from = selection.$from;
        if ($from.depth !== CONTENT_DEPTH) return false;
        if ($from.parentOffset !== 0) return false;

        const index = $from.index(0);
        if (index === 0) return false;

        const previous = state.doc.child(index - 1) as PMNode;
        const previousContent = previous.firstChild;
        const blockStart = $from.before(1);

        // An atom above (divider, math, block reference) has nothing to merge
        // into — select it so a second Backspace deletes it.
        if (!previousContent || !previousContent.isTextblock) {
          const tr = state.tr.setSelection(
            NodeSelection.create(state.doc, blockStart - previous.nodeSize),
          );
          view.dispatch(tr);
          return true;
        }

        // Four boundary tokens sit between the two content nodes: the previous
        // content's close, the previous block's close, this block's open, and
        // this content's open. Deleting exactly that range joins the two content
        // nodes inside a single wrapper.
        //
        //   …text</p></block><block><p>caret…
        //        ^from                  ^to
        const from = blockStart - 2;   // end of the previous block's content
        const to = $from.start();      // start of this block's content
        const tr = state.tr.delete(from, to);
        tr.setSelection(TextSelection.near(tr.doc.resolve(from), -1));
        view.dispatch(tr);
        return true;
      },
    };
  },
});
