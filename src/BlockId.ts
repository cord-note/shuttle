import { nanoid } from 'nanoid';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

// Re-exported so existing editor imports keep working; the list itself lives in
// shared constants because the sidecar needs it for note↔notepad conversion.
export { ANNOTATABLE_TYPES } from '@shared/constants';
import { ANNOTATABLE_TYPES } from '@shared/constants';

const blockIdKey = new PluginKey('blockId');

export const BlockId = Extension.create({
  name: 'blockId',

  addGlobalAttributes() {
    return [
      {
        types: [...ANNOTATABLE_TYPES],
        attributes: {
          blockId: {
            default: null,
            parseHTML:  (el) => el.getAttribute('data-block-id') ?? null,
            renderHTML: (attrs) => (attrs.blockId ? { 'data-block-id': attrs.blockId } : {}),
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: blockIdKey,
        appendTransaction(transactions, _old, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null;

          const tr = newState.tr;
          let modified = false;

          // Ids already in use in this document. Splitting or duplicating a node
          // copies its attrs, so assigning only when an id is *missing* left two
          // nodes sharing one — an ambiguous address for fragment tags and links,
          // and a primary-key collision in the block index.
          //
          // The first occurrence keeps the id, so existing annotations stay on the
          // node that holds the original position; later ones are new content and
          // get new ids.
          const seen = new Set<string>();

          newState.doc.descendants((node, pos) => {
            if (!ANNOTATABLE_TYPES.includes(node.type.name)) return;

            const id = node.attrs.blockId as string | null;
            if (id && !seen.has(id)) {
              seen.add(id);
              return;
            }

            const fresh = nanoid(10);
            seen.add(fresh);
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, blockId: fresh });
            modified = true;
          });

          if (!modified) return null;
          // Rides along with the edit that caused it, so one undo covers both.
          tr.setMeta('addToHistory', false);
          return tr;
        },
      }),
    ];
  },
});
