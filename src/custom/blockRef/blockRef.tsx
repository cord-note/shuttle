import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import type { ShuttleContextRef } from '../../context';
import type { ViewOptions } from '../links/wikiLink';
import { insertTopLevelAtom } from '../../doc/insertAtom';
import BlockRefView from './BlockRefView';

/** What a transclusion stores: the ids of the block it shows, never its content. */
export interface BlockRefAttrs {
  refBlockId: string;
  refNoteId: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockRef: {
      /** Insert a read-only transclusion of another note's block. */
      insertBlockRef: (refBlockId: string, refNoteId: string) => ReturnType;
    };
  }
}

// Leading spaces (up to 3, as markdown allows before a block marker) then the
// transclusion marker, ending the line — never matched mid-paragraph.
const MARKDOWN_REF = /^ {0,3}!\[\[([\w-]+)#([\w:-]+)\]\](?:\n|$)/;

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
      // Only a `![[` at the very start of a line (optionally indented up to
      // 3 spaces) can begin a transclusion — mid-paragraph text is never
      // interrupted by it.
      start: (src: string) => {
        const i = src.search(/\n {0,3}!\[\[/);
        return i < 0 ? -1 : i + 1;
      },
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
        /**
         * Always lands the ref at the top level, never nested inside a list
         * or other wrapper: an empty top-level paragraph at the selection is
         * replaced by the ref, otherwise the ref is inserted right after that
         * top-level block. A textblock is then guaranteed to follow (an empty
         * paragraph is inserted if the next top-level node isn't one), and
         * the caret is left there as a plain TextSelection, ready to type —
         * never a NodeSelection on the atom.
         */
        insertBlockRef:
          (refBlockId, refNoteId) =>
          ({ state, tr, dispatch }) => {
            const refType = state.schema.nodes['blockRef'];
            if (!refType) return false;
            return insertTopLevelAtom(state, tr, dispatch, refType.create({ refBlockId, refNoteId }));
          },
      };
    },
  });
}
