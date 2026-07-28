import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PmNode } from '@tiptap/pm/model';
import { useNoteStore } from '../../store/notes';

const key = new PluginKey('unlinkedMentionDecos');

const MIN_TITLE_LEN = 3;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildDecorations(doc: PmNode): DecorationSet {
  const { notes, activeNoteId } = useNoteStore.getState();
  const decos: Decoration[] = [];

  const targets = notes
    .filter((n) => n.id !== activeNoteId && (n.title || '').trim().length >= MIN_TITLE_LEN)
    .map((n) => n.title.trim());

  if (targets.length === 0) return DecorationSet.empty;

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;

    for (const title of targets) {
      const re = new RegExp(`(?<![\\w])${escapeRe(title)}(?![\\w])`, 'gi');
      let m: RegExpExecArray | null;
      while ((m = re.exec(node.text)) !== null) {
        decos.push(
          Decoration.inline(pos + m.index, pos + m.index + m[0].length, {
            class: 'unlinked-mention',
            title: `"${title}" is mentioned but not linked`,
          }),
        );
      }
    }
  });

  return DecorationSet.create(doc, decos);
}

export const UnlinkedMentionDecorations = Extension.create({
  name: 'unlinkedMentionDecos',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        state: {
          init(_, state) { return buildDecorations(state.doc); },
          apply(tr, old)  { return tr.docChanged ? buildDecorations(tr.doc) : old; },
        },
        props: {
          decorations(state) { return key.getState(state); },
        },
      }),
    ];
  },
});
