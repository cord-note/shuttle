import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { ShuttleContextRef } from '../context';
import type { NoteRef } from '../host';

const key = new PluginKey<DecorationSet>('unlinkedMentions');
const MIN_TITLE_LENGTH = 3;

/** Transaction meta that forces a rebuild, e.g. after the host's note list changed. */
export const UNLINKED_REFRESH_META = 'shuttle:refreshUnlinked';

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Letters, digits and underscore in any script: "Kot" is not a word inside "Kotów". */
const WORD = '[\\p{L}\\p{N}_]';

function compile(notes: NoteRef[], docKey: string): RegExp | null {
  const titles = notes
    .filter((n) => n.id !== docKey && n.title.trim().length >= MIN_TITLE_LENGTH)
    .map((n) => n.title.trim())
    // Longest first, so "Gamma Ray" wins over a "Gamma" note in the alternation.
    .sort((a, b) => b.length - a.length);
  if (titles.length === 0) return null;
  return new RegExp(`(?<!${WORD})(${titles.map(escapeRe).join('|')})(?!${WORD})`, 'giu');
}

/** Text already linked or shown as code is not a mention. */
const skipsText = (node: PMNode): boolean =>
  node.marks.some((m) => m.type.name === 'link' || m.type.spec.code === true);

/** Decorations for one textblock whose content starts at `start`. */
function scanTextblock(block: PMNode, start: number, pattern: RegExp, out: Decoration[]): void {
  if (block.type.spec.code) return;
  block.forEach((child, offset) => {
    if (!child.isText || !child.text || skipsText(child)) return;
    for (const m of child.text.matchAll(pattern)) {
      const from = start + offset + (m.index ?? 0);
      out.push(Decoration.inline(from, from + m[0].length, {
        class: 'unlinked-mention',
        title: `"${m[0]}" is mentioned but not linked`,
      }));
    }
  });
}

/** Scans every textblock overlapping [from, to]; returns their extents. */
function scanRange(doc: PMNode, from: number, to: number, pattern: RegExp, out: Decoration[]): [number, number][] {
  const touched: [number, number][] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.spec.code) return false;
    if (!node.isTextblock) return true;
    touched.push([pos, pos + node.nodeSize]);
    scanTextblock(node, pos + 1, pattern, out);
    return false;
  });
  return touched;
}

function buildAll(doc: PMNode, pattern: RegExp | null): DecorationSet {
  if (!pattern) return DecorationSet.empty;
  const decos: Decoration[] = [];
  scanRange(doc, 0, doc.content.size, pattern, decos);
  return DecorationSet.create(doc, decos);
}

/** Ranges of `tr.doc` that the transaction changed, in final coordinates. */
function changedRanges(tr: Transaction): [number, number][] {
  const ranges: [number, number][] = [];
  tr.mapping.maps.forEach((map, i) => {
    const rest = tr.mapping.slice(i + 1);
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      ranges.push([rest.map(newStart, -1), rest.map(newEnd, 1)]);
    });
  });
  return ranges;
}

/** Maps the old set and rescans only the textblocks the transaction touched. */
function update(old: DecorationSet, tr: Transaction, pattern: RegExp): DecorationSet {
  const doc = tr.doc;
  let set = old.map(tr.mapping, doc);
  const size = doc.content.size;
  for (const [a, b] of changedRanges(tr)) {
    // Widen by one so an edit exactly at a block boundary still finds the block.
    const from = Math.max(0, Math.min(a, b) - 1);
    const to = Math.min(size, Math.max(a, b) + 1);
    const fresh: Decoration[] = [];
    for (const [start, end] of scanRange(doc, from, to, pattern, fresh)) {
      set = set.remove(set.find(start, end));
    }
    set = set.add(doc, fresh);
  }
  return set;
}

/** Underlines note titles that appear in the text without a `[[link]]`. */
export function unlinkedMentions(ctx: ShuttleContextRef) {
  // The compiled pattern, reused until the host's title list or the document changes.
  let cachedNotes: NoteRef[] | null = null;
  let cachedDocKey: string | null = null;
  let cachedPattern: RegExp | null = null;

  /** Current pattern, and whether it was recompiled (making old decorations stale). */
  const pattern = (force: boolean): { re: RegExp | null; fresh: boolean } => {
    const notes = ctx.current.host.listNoteTitles();
    const docKey = ctx.current.docKey;
    if (!force && notes === cachedNotes && docKey === cachedDocKey) return { re: cachedPattern, fresh: false };
    cachedNotes = notes;
    cachedDocKey = docKey;
    cachedPattern = compile(notes, docKey);
    return { re: cachedPattern, fresh: true };
  };

  return Extension.create({
    name: 'unlinkedMentions',
    addProseMirrorPlugins() {
      return [
        new Plugin<DecorationSet>({
          key,
          state: {
            init: (_, state) => buildAll(state.doc, pattern(true).re),
            apply: (tr, old) => {
              const refresh = Boolean(tr.getMeta(UNLINKED_REFRESH_META));
              if (!tr.docChanged && !refresh) return old;
              const { re, fresh } = pattern(refresh);
              if (fresh || !re) return buildAll(tr.doc, re);
              return update(old, tr, re);
            },
          },
          props: {
            decorations: (state) => key.getState(state) ?? DecorationSet.empty,
          },
        }),
      ];
    },
  });
}
