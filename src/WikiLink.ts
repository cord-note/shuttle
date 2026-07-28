import { Node, mergeAttributes, InputRule } from '@tiptap/core';
import { ReactNodeViewRenderer, ReactRenderer } from '@tiptap/react';
import Suggestion from '@tiptap/suggestion';
import type { Editor } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';

const wikiLinkPluginKey = new PluginKey('wikiLink');
import type { Note } from '@shared/types';
import { useNoteStore } from '../../store/notes';
import { api } from '../../ipc';
import WikiLinkView from './WikiLinkView';
import WikiLinkList, { type WikiLinkListRef } from './WikiLinkList';

// ── Node definition ─────────────────────────────────────────────────────────

export const WikiLink = Node.create({
  name: 'wikiLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      id:          { default: null },
      label:       { default: null },
      displayText: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-wiki-link]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const display = HTMLAttributes.displayText || HTMLAttributes.label || '';
    return ['span', mergeAttributes({ 'data-wiki-link': '' }, HTMLAttributes), display];
  },

  addNodeView() {
    return ReactNodeViewRenderer(WikiLinkView);
  },

  addInputRules() {
    const persistLink = (fromNoteId: string | null, toNoteId: string) => {
      if (fromNoteId) {
        api.links.create(fromNoteId, toNoteId).catch(() => {});
      }
    };

    const withDisplay = new InputRule({
      find: /\[\[([^[\]|]+)\|([^[\]]*)\]\]$/,
      handler({ state, range, match }) {
        const noteTitle = (match[1] ?? '').trim();
        const displayText = (match[2] ?? '').trim();
        const { notes, activeNoteId } = useNoteStore.getState();
        const note = notes.find(
          (n) => (n.title || 'Untitled').toLowerCase() === noteTitle.toLowerCase(),
        );
        if (!note) return;

        const nodeType = state.schema.nodes.wikiLink;
        if (!nodeType) return;

        const { tr } = state;
        tr.replaceWith(
          range.from,
          range.to,
          nodeType.create({
            id: note.id,
            label: note.title || 'Untitled',
            displayText: displayText || null,
          }),
        );
        persistLink(activeNoteId, note.id);
      },
    });

    const noDisplay = new InputRule({
      find: /\[\[([^[\]|]+)\]\]$/,
      handler({ state, range, match }) {
        const noteTitle = (match[1] ?? '').trim();
        const { notes, activeNoteId } = useNoteStore.getState();
        const note = notes.find(
          (n) => (n.title || 'Untitled').toLowerCase() === noteTitle.toLowerCase(),
        );
        if (!note) return;

        const nodeType = state.schema.nodes.wikiLink;
        if (!nodeType) return;

        const { tr } = state;
        tr.replaceWith(
          range.from,
          range.to,
          nodeType.create({
            id: note.id,
            label: note.title || 'Untitled',
            displayText: null,
          }),
        );
        persistLink(activeNoteId, note.id);
      },
    });

    return [withDisplay, noDisplay];
  },

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      Suggestion({
        pluginKey: wikiLinkPluginKey,
        editor,
        char: '[[',
        allowSpaces: true,

        items: ({ query }: { query: string }) => {
          const { notes } = useNoteStore.getState();
          const q = query.toLowerCase();
          return notes
            .filter((n) => n.title.toLowerCase().includes(q))
            .slice(0, 8);
        },

        command: ({
          editor: ed,
          range,
          props,
        }: {
          editor: Editor;
          range: { from: number; to: number };
          props: Note;
        }) => {
          ed.chain()
            .focus()
            .deleteRange(range)
            .insertContent({
              type: 'wikiLink',
              attrs: {
                id: props.id,
                label: props.title || 'Untitled',
                displayText: null,
              },
            })
            .insertContent(' ')
            .run();

          const { activeNoteId: fromId } = useNoteStore.getState();
          if (fromId && props.id) {
            api.links.create(fromId, props.id).catch(() => {});
          }
        },

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        render: (): Record<string, (props: any) => any> => {
          let component: ReactRenderer<WikiLinkListRef> | null = null;
          let wrapper: HTMLDivElement | null = null;

          function position(clientRect: (() => DOMRect | null) | null | undefined) {
            if (!wrapper || !clientRect) return;
            const rect = clientRect();
            if (!rect) return;
            const vpH = window.innerHeight;
            const menuH = 280;
            const top =
              rect.bottom + 4 + menuH > vpH ? rect.top - menuH - 4 : rect.bottom + 4;
            wrapper.style.top  = `${top}px`;
            wrapper.style.left = `${rect.left}px`;
          }

          return {
            onStart(props) {
              component = new ReactRenderer(WikiLinkList, {
                props,
                editor: props.editor as Editor,
              });
              wrapper = document.createElement('div');
              wrapper.style.cssText = 'position:fixed;z-index:9999;';
              wrapper.appendChild(component.element);
              document.body.appendChild(wrapper);
              position(props.clientRect);
            },
            onUpdate(props) {
              component?.updateProps(props);
              position(props.clientRect);
            },
            onKeyDown(props): boolean {
              if (props.event.key === 'Escape') {
                wrapper?.remove();
                component?.destroy();
                return true;
              }
              return (
                (component?.ref as WikiLinkListRef | null)?.onKeyDown(props) ?? false
              );
            },
            onExit() {
              wrapper?.remove();
              component?.destroy();
              wrapper = null;
              component = null;
            },
          };
        },
      }),
    ];
  },
});
