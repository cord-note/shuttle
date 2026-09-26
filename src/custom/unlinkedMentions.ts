import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { ShuttleContextRef } from '../context';

const key = new PluginKey<DecorationSet>('unlinkedMentions');
const MIN_TITLE_LENGTH = 3;

/** Transaction meta that forces a rebuild, e.g. after the host's note list changed. */
export const UNLINKED_REFRESH_META = 'shuttle:refreshUnlinked';

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function build(doc: PMNode, ctx: ShuttleContextRef): DecorationSet {
  const titles = ctx.current.host.listNoteTitles()
    .filter((n) => n.id !== ctx.current.docKey && n.title.trim().length >= MIN_TITLE_LENGTH)
    .map((n) => n.title.trim())
    // Longest first, so "Gamma Ray" wins over a "Gamma" note in the alternation.
    .sort((a, b) => b.length - a.length);
  if (titles.length === 0) return DecorationSet.empty;

  const pattern = new RegExp(`(?<![\\w])(${titles.map(escapeRe).join('|')})(?![\\w])`, 'gi');
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    for (const m of node.text.matchAll(pattern)) {
      const from = pos + (m.index ?? 0);
      decos.push(Decoration.inline(from, from + m[0].length, {
        class: 'unlinked-mention',
        title: `"${m[0]}" is mentioned but not linked`,
      }));
    }
  });
  return DecorationSet.create(doc, decos);
}

/** Underlines note titles that appear in the text without a `[[link]]`. */
export function unlinkedMentions(ctx: ShuttleContextRef) {
  return Extension.create({
    name: 'unlinkedMentions',
    addProseMirrorPlugins() {
      return [
        new Plugin<DecorationSet>({
          key,
          state: {
            init: (_, state) => build(state.doc, ctx),
            apply: (tr, old) => (tr.docChanged || tr.getMeta(UNLINKED_REFRESH_META) ? build(tr.doc, ctx) : old),
          },
          props: {
            decorations: (state) => key.getState(state) ?? DecorationSet.empty,
          },
        }),
      ];
    },
  });
}
