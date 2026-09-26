import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import type { ShuttleContextRef } from '../../context';
import type { ViewOptions } from '../links/wikiLink';
import BlockRefView from './BlockRefView';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockRef: {
      /** Insert a read-only transclusion of another note's block. */
      insertBlockRef: (refBlockId: string, refNoteId: string) => ReturnType;
    };
  }
}

const MARKDOWN_REF = /^!\[\[([\w-]+)#([\w:-]+)\]\](?:\n|$)/;

/**
 * Transclusion by reference: stores `refBlockId` and `refNoteId`, never the
 * content, so it cannot go stale. Markdown form: `![[noteId#blockId]]`.
 */
export function blockRef(ctx: ShuttleContextRef, view: ViewOptions) {
  return Node.create({
    name: 'blockRef',
    group: 'block',
    atom: true,
    selectable: true,
    draggable: false,

    addOptions() {
      return { ctx };
    },

    addAttributes() {
      return {
        refBlockId: {
          default: null,
          parseHTML: (el: HTMLElement) => el.getAttribute('data-ref-block-id'),
          renderHTML: (attrs: Record<string, unknown>) => ({ 'data-ref-block-id': attrs['refBlockId'] }),
        },
        refNoteId: {
          default: null,
          parseHTML: (el: HTMLElement) => el.getAttribute('data-ref-note-id'),
          renderHTML: (attrs: Record<string, unknown>) => ({ 'data-ref-note-id': attrs['refNoteId'] }),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'div[data-block-ref]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ['div', mergeAttributes(HTMLAttributes, { 'data-block-ref': '' })];
    },

    markdownTokenName: 'blockRef',
    markdownTokenizer: {
      name: 'blockRef',
      level: 'block',
      start: (src: string) => src.indexOf('![['),
      tokenize: (src: string) => {
        const m = MARKDOWN_REF.exec(src);
        if (!m) return undefined;
        return { type: 'blockRef', raw: m[0], noteId: m[1], blockId: m[2] };
      },
    },
    parseMarkdown: (token, helpers) =>
      helpers.createNode('blockRef', { refNoteId: token['noteId'], refBlockId: token['blockId'] }),
    renderMarkdown: (node) => `![[${String(node.attrs?.['refNoteId'] ?? '')}#${String(node.attrs?.['refBlockId'] ?? '')}]]`,

    ...(view.reactViews ? { addNodeView: () => ReactNodeViewRenderer(BlockRefView) } : {}),

    addCommands() {
      return {
        insertBlockRef:
          (refBlockId, refNoteId) =>
          ({ commands }) =>
            commands.insertContent({ type: this.name, attrs: { refBlockId, refNoteId } }),
      };
    },
  });
}
