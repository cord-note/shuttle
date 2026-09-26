import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { nanoid } from 'nanoid';
import { BLOCK_TYPES } from '../extensions/blockTypes';

interface Occurrence {
  node: PMNode;
  pos: number;
}

/**
 * Of several nodes sharing one id, the one that keeps it: the node whose
 * content is unchanged from the id's owner before this change; failing that,
 * the first non-empty one; failing that, the first.
 *
 * Content decides, not position, because splitting a block copies its attrs
 * onto both halves. Enter at the start of a block leaves an empty first half
 * and the text in the second — keeping the id on the first would move the
 * block's identity (and every tag, link and transclusion of it) onto the
 * empty line.
 */
function chooseKeeper(occurrences: Occurrence[], old: PMNode | undefined): Occurrence {
  const first = occurrences[0]!;
  return (old && occurrences.find((o) => o.node.content.eq(old.content)))
    ?? occurrences.find((o) => o.node.content.size > 0)
    ?? first;
}

/**
 * Guarantees `blockId` uniqueness across the whole document.
 *
 * UniqueID only de-duplicates within the changed range, and only strips ids
 * from content arriving through a real DOM paste — a programmatic insert of a
 * node carrying an existing id, or a loaded document with duplicates, keeps
 * them (and on load it may re-mint the *first* copy rather than the second).
 * The host indexes blocks by id, so a duplicate silently merges two blocks.
 *
 * On every document change this walks the document and, for each id held by
 * more than one node, keeps it on one of them (see `chooseKeeper`) and
 * re-mints the rest. Loaded duplicates have no previous owner, so the first
 * non-empty copy keeps the id. Its appendTransaction must run before
 * UniqueID's, so its priority (10100) sits above UniqueID's own 10000 —
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

    const collect = (doc: PMNode): Map<string, Occurrence[]> => {
      const byId = new Map<string, Occurrence[]>();
      doc.descendants((node, pos) => {
        if (!types.has(node.type.name)) return;
        const id = node.attrs['blockId'] as string | null | undefined;
        if (!id) return;
        const list = byId.get(id);
        if (list) list.push({ node, pos });
        else byId.set(id, [{ node, pos }]);
      });
      return byId;
    };

    return [
      new Plugin({
        key: new PluginKey('blockIdGuard'),
        appendTransaction: (transactions, oldState, newState) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          const current = collect(newState.doc);
          const duplicated = [...current].filter(([, list]) => list.length > 1);
          if (duplicated.length === 0) return null;

          // Only needed when there is something to resolve.
          const oldById = new Map<string, PMNode>();
          for (const [id, list] of collect(oldState.doc)) oldById.set(id, list[0]!.node);

          const { tr } = newState;
          for (const [id, list] of duplicated) {
            const keeper = chooseKeeper(list, oldById.get(id));
            for (const o of list) {
              if (o === keeper) continue;
              // setNodeMarkup never shifts positions, so `o.pos` stays valid.
              tr.setNodeMarkup(o.pos, undefined, { ...o.node.attrs, blockId: nanoid(10) });
            }
          }
          tr.setMeta('addToHistory', false);
          return tr;
        },
      }),
    ];
  },
});
