import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import type { ShuttleContextRef } from '../../context';
import type { ViewOptions } from './wikiLink';

export interface FragmentLinkAttrs {
  linkId: string;
  toNoteId: string;
  toFragmentId: string | null;
  label: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fragmentLink: {
      /** Insert a link to a note or to one of its blocks at the selection. */
      insertFragmentLink: (attrs: FragmentLinkAttrs) => ReturnType;
    };
  }
}

function FragmentLinkView({ node, extension }: NodeViewProps) {
  const ctx = (extension.options as { ctx: ShuttleContextRef }).ctx;
  const toNoteId = node.attrs['toNoteId'] as string | null;
  const toFragmentId = node.attrs['toFragmentId'] as string | null;
  const label = (node.attrs['label'] as string) || (toFragmentId ? 'fragment' : 'note');
  return (
    <NodeViewWrapper as="span" className="sh-fragment-link">
      <span
        role="link"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!toNoteId) return;
          if (toFragmentId) ctx.current.host.openNote(toNoteId, toFragmentId);
          else ctx.current.host.openNote(toNoteId);
        }}
      >
        {label}
      </span>
    </NodeViewWrapper>
  );
}

/**
 * A link to a note or a block of a note, created by the host's fragment UI.
 * Removal is reported to the host by `ShuttleEditor` via `linkId`.
 */
export function fragmentLink(ctx: ShuttleContextRef, view: ViewOptions) {
  return Node.create({
    name: 'fragmentLink',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,

    addOptions() {
      return { ctx };
    },

    addAttributes() {
      return {
        linkId: {
          default: null,
          parseHTML: (el: HTMLElement) => el.getAttribute('data-link-id'),
          renderHTML: (attrs: Record<string, unknown>) =>
            (attrs['linkId'] == null ? {} : { 'data-link-id': attrs['linkId'] }),
        },
        toNoteId: {
          default: null,
          parseHTML: (el: HTMLElement) => el.getAttribute('data-to-note-id'),
          renderHTML: (attrs: Record<string, unknown>) =>
            (attrs['toNoteId'] == null ? {} : { 'data-to-note-id': attrs['toNoteId'] }),
        },
        toFragmentId: {
          default: null,
          parseHTML: (el: HTMLElement) => el.getAttribute('data-to-fragment-id'),
          renderHTML: (attrs: Record<string, unknown>) =>
            (attrs['toFragmentId'] == null ? {} : { 'data-to-fragment-id': attrs['toFragmentId'] }),
        },
        label: {
          default: '',
          // Older or hand-authored HTML may carry the label only as text
          // content (e.g. pasted markup), so fall back to that.
          parseHTML: (el: HTMLElement) => el.getAttribute('data-label') ?? el.textContent ?? '',
          renderHTML: (attrs: Record<string, unknown>) =>
            (attrs['label'] == null ? {} : { 'data-label': attrs['label'] }),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'span[data-fragment-link]' }];
    },

    renderHTML({ HTMLAttributes, node }) {
      return ['span', mergeAttributes({ 'data-fragment-link': '' }, HTMLAttributes), String(node.attrs['label'] ?? '')];
    },

    renderText({ node }) {
      return String(node.attrs['label'] ?? '');
    },

    // Markdown output keeps only the label: markdown is input UX, and a
    // fragment link itself is not representable in markdown.
    renderMarkdown: (node) => String(node.attrs?.['label'] ?? ''),

    ...(view.reactViews ? { addNodeView: () => ReactNodeViewRenderer(FragmentLinkView, { as: 'span' }) } : {}),

    addCommands() {
      return {
        insertFragmentLink:
          (attrs) =>
          ({ commands }) =>
            commands.insertContent({ type: this.name, attrs: { ...attrs } }),
      };
    },
  });
}
