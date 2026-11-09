import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import type { ShuttleContextRef } from '../../context';
import type { ViewOptions } from '../links/wikiLink';
import { insertTopLevelAtom } from '../../doc/insertAtom';
import TagViewView from './TagViewView';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tagView: {
      /** Insert a live view of a tag, drawn by the host. */
      insertTagView: (viewId: string) => ReturnType;
    };
  }
}

/**
 * A table or board of a tag, drawn by the host into this block. The document
 * stores only `viewId`; the view's tag, filters and layout live in the host.
 */
export function tagView(ctx: ShuttleContextRef, view: ViewOptions) {
  return Node.create({
    name: 'tagView',
    group: 'block',
    atom: true,
    selectable: true,
    draggable: false,

    addOptions() {
      return { ctx };
    },

    addAttributes() {
      return {
        viewId: {
          default: null,
          parseHTML: (el: HTMLElement) => el.getAttribute('data-view-id'),
          renderHTML: (attrs: Record<string, unknown>) => ({ 'data-view-id': attrs['viewId'] }),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'div[data-tag-view]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ['div', mergeAttributes(HTMLAttributes, { 'data-tag-view': '' })];
    },

    // A view has no text of its own to copy as Markdown.
    renderMarkdown: () => '',

    // The host's table or board takes its own clicks and keys.
    ...(view.reactViews ? { addNodeView: () => ReactNodeViewRenderer(TagViewView, { stopEvent: () => true }) } : {}),

    addCommands() {
      return {
        insertTagView:
          (viewId) =>
          ({ state, tr, dispatch }) => {
            const type = state.schema.nodes['tagView'];
            if (!type) return false;
            return insertTopLevelAtom(state, tr, dispatch, type.create({ viewId }));
          },
      };
    },
  });
}
