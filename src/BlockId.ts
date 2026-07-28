import { nanoid } from 'nanoid';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export const ANNOTATABLE_TYPES = ['paragraph', 'heading', 'blockquote', 'codeBlock'];

const blockIdKey = new PluginKey('blockId');

export const BlockId = Extension.create({
  name: 'blockId',

  addGlobalAttributes() {
    return [
      {
        types: ANNOTATABLE_TYPES,
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

          newState.doc.descendants((node, pos) => {
            if (!ANNOTATABLE_TYPES.includes(node.type.name)) return;
            if (node.attrs.blockId) return;
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, blockId: nanoid(10) });
            modified = true;
          });

          return modified ? tr : null;
        },
      }),
    ];
  },
});
