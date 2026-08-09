import { nanoid } from 'nanoid';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import { BLOCK_NODE_NAME } from '@shared/constants';

const normalizerKey = new PluginKey('blockNormalizer');

/** Length of a generated block id. Matches BlockId's, so ids look uniform. */
const BLOCK_ID_LENGTH = 10;

/**
 * Keeps a notepad document well-formed, so nothing else has to.
 *
 * This is the load-bearing piece of the notepad: because it repairs the document
 * after every change, features that produce a bare top-level node need no
 * notepad-specific handling at all. Markdown input rules, `---`, code fences,
 * pasted markdown and programmatic insertContent all emit plain nodes and get
 * wrapped here a tick later.
 *
 * On every doc change it:
 *   1. wraps any top-level node that is not a `block`,
 *   2. mints `blockId` for blocks that lack one,
 *   3. re-mints ids that duplicate an earlier block's,
 *   4. ensures the document ends in an empty paragraph block, so there is always
 *      somewhere to click and type below the last piece of content.
 *
 * Ids are deliberately assigned here rather than at insertion time: a single
 * place that guarantees the invariant beats every call site remembering to.
 *
 * Exposed as a plain plugin factory, not only as an extension, so it can be
 * driven through `EditorState.apply` in tests: an `EditorState` needs no DOM
 * while a Tiptap `Editor` does, and these invariants are too important to be
 * reachable only from a browser environment.
 */
export function blockNormalizerPlugin(): Plugin {
  return new Plugin({
    key: normalizerKey,

    appendTransaction: (transactions, _oldState, newState) => {
      if (!transactions.some((tr) => tr.docChanged)) return null;

      const blockType = newState.schema.nodes[BLOCK_NODE_NAME];
      const paragraphType = newState.schema.nodes['paragraph'];
      if (!blockType || !paragraphType) return null;

      const tr = newState.tr;
      let modified = false;

      const top: PMNode[] = [];
      newState.doc.forEach((node) => top.push(node));

      // Which ids are already spoken for, and by which block. Splitting a block
      // copies its attrs onto both halves, and pasting copied blocks brings their
      // ids along — so duplicates arrive through ordinary editing, not corruption.
      //
      // The earliest occurrence keeps the id: it holds the original position, so
      // its fragment tags and links stay where the user put them. Later ones are
      // new content and get new ids.
      const claimed = new Set<string>();
      const needsNewId = new Set<number>();
      for (let i = 0; i < top.length; i++) {
        const id = top[i]!.attrs['blockId'] as string | null;
        if (!id) continue;
        if (claimed.has(id)) needsNewId.add(i);
        else claimed.add(id);
      }

      // Walk the top level back to front: every edit is at a position after
      // the ones still to be visited, so earlier positions stay valid.
      let pos = newState.doc.content.size;
      for (let i = top.length - 1; i >= 0; i--) {
        const node = top[i]!;
        pos -= node.nodeSize;

        if (node.type !== blockType) {
          // A bare node at the top level — wrap it.
          const wrapped = blockType.create({ blockId: nanoid(BLOCK_ID_LENGTH) }, node);
          tr.replaceWith(tr.mapping.map(pos), tr.mapping.map(pos + node.nodeSize), wrapped);
          modified = true;
          continue;
        }

        if (!node.attrs['blockId'] || needsNewId.has(i)) {
          tr.setNodeMarkup(tr.mapping.map(pos), undefined, {
            ...node.attrs,
            blockId: nanoid(BLOCK_ID_LENGTH),
          });
          modified = true;
        }
      }

      // A trailing empty paragraph block gives the page somewhere to type
      // after a divider, code block or transclusion — without it those can
      // become impossible to escape with the keyboard alone.
      const last = newState.doc.lastChild;
      const lastIsEmptyParagraph =
        last?.type === blockType &&
        last.firstChild?.type === paragraphType &&
        last.firstChild.content.size === 0;

      if (!lastIsEmptyParagraph) {
        const filler = blockType.createAndFill({ blockId: nanoid(BLOCK_ID_LENGTH) });
        if (filler) {
          tr.insert(tr.mapping.map(newState.doc.content.size), filler);
          modified = true;
        }
      }

      if (!modified) return null;
      // Not an undo step of its own — repairs ride along with the edit that
      // caused them, so one Ctrl+Z undoes both.
      tr.setMeta('addToHistory', false);
      return tr;
    },
  });
}

export const BlockNormalizer = Extension.create({
  name: 'blockNormalizer',

  addProseMirrorPlugins() {
    return [blockNormalizerPlugin()];
  },
});

/**
 * Ids appearing on more than one top-level block.
 *
 * The normalizer repairs these by re-minting every occurrence after the first;
 * this reports them so tests can assert the document ends up clean.
 */
export function findDuplicateBlockIds(doc: PMNode): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  doc.forEach((node) => {
    const id = node.attrs['blockId'] as string | null;
    if (!id) return;
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  });
  return [...duplicates];
}
