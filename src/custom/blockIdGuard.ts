import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { nanoid } from 'nanoid';
import { BLOCK_TYPES } from '../extensions/blockTypes';

/**
 * Guarantees `blockId` uniqueness across the whole document.
 *
 * UniqueID only de-duplicates within the changed range, and only strips ids
 * from content arriving through a real DOM paste — a programmatic insert of a
 * node carrying an existing id, or a loaded document with duplicates, keeps
 * them (and on load it may re-mint the *first* copy rather than the second).
 * The host indexes blocks by id, so a duplicate silently merges two blocks.
 *
 * On every document change this walks the document, keeps the FIRST node
 * with each id and re-mints later duplicates. Its appendTransaction must run
 * before UniqueID's, so its priority (10100) sits above UniqueID's own 10000 —
 * higher priority means earlier plugin order. UniqueID then only fills in
 * missing ids.
 *
 * Accepted UniqueID quirk: when an EMPTY node and a following id-less node
 * appear in the same change, UniqueID moves the empty node's id onto the next
 * node and gives the empty one a new id. That only matters for legacy
 * documents loaded with missing ids; ids already present and unique on load
 * are otherwise kept exactly.
 */
export const BlockIdGuard = Extension.create({
  name: 'blockIdGuard',
  priority: 10100,

  addProseMirrorPlugins() {
    const types = new Set(BLOCK_TYPES);
    return [
      new Plugin({
        key: new PluginKey('blockIdGuard'),
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          const seen = new Set<string>();
          const { tr } = newState;
          newState.doc.descendants((node, pos) => {
            if (!types.has(node.type.name)) return;
            const id = node.attrs['blockId'] as string | null | undefined;
            if (!id) return;
            if (!seen.has(id)) {
              seen.add(id);
              return;
            }
            const fresh = nanoid(10);
            seen.add(fresh);
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, blockId: fresh });
          });
          if (!tr.steps.length) return null;
          tr.setMeta('addToHistory', false);
          return tr;
        },
      }),
    ];
  },
});
