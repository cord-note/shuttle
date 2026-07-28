import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PmNode } from '@tiptap/pm/model';
import { useNoteStore } from '../../store/notes';

const linkPillsKey = new PluginKey('linkPills');

const PILL_BLOCK_TYPES = new Set(['paragraph', 'heading', 'blockquote']);

function buildDecorations(doc: PmNode): DecorationSet {
  const { notes } = useNoteStore.getState();
  const decos: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (!PILL_BLOCK_TYPES.has(node.type.name)) return;

    const titles: string[] = [];

    node.forEach((child) => {
      if (child.type.name === 'wikiLink') {
        const note = notes.find((n) => n.id === child.attrs.id);
        titles.push(note?.title || child.attrs.label || 'note');
      }
      if (child.type.name === 'fragmentLinkNode' && child.attrs.toNoteId) {
        const note = notes.find((n) => n.id === child.attrs.toNoteId);
        titles.push(note?.title || 'note');
      }
    });

    if (titles.length === 0) return;

    const endPos = pos + node.nodeSize - 1;

    decos.push(
      Decoration.widget(
        endPos,
        () => {
          const el = document.createElement('span');
          el.className = 'link-pill';
          el.setAttribute('contenteditable', 'false');
          el.textContent = titles.join(' · ');
          return el;
        },
        { side: 1, key: `pill-${pos}` },
      ),
    );
  });

  return DecorationSet.create(doc, decos);
}

export const LinkPills = Extension.create({
  name: 'linkPills',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: linkPillsKey,
        state: {
          init(_, state) { return buildDecorations(state.doc); },
          apply(tr, old)  { return tr.docChanged ? buildDecorations(tr.doc) : old; },
        },
        props: {
          decorations(state) { return linkPillsKey.getState(state); },
        },
      }),
    ];
  },
});
