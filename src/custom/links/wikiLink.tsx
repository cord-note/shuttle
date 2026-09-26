import { InputRule, PasteRule, mergeAttributes, type JSONContent } from '@tiptap/core';
import Mention from '@tiptap/extension-mention';
import { ReactNodeViewRenderer } from '@tiptap/react';
import type { ShuttleContextRef } from '../../context';
import type { NoteRef } from '../../host';
import { createSuggestionList } from '../../ui/SuggestionList';
import { suggestionPopup } from '../../ui/suggestionPopup';
import { wikiLinkPluginKey } from '../pluginKeys';
import WikiLinkView from './WikiLinkView';

export { wikiLinkPluginKey };
export const WIKI_TRIGGER = '[[';

const TYPED_LINK = /\[\[([^[\]|]+)(?:\|([^[\]]*))?\]\]$/;
const MARKDOWN_LINK = /^\[\[([^[\]|]+)(?:\|([^[\]]*))?\]\]/;
const PASTED_LINK = /\[\[([^[\]|]+)(?:\|([^[\]]*))?\]\]/g;

export interface ViewOptions {
  /** False in tests: React node views need a mounted EditorContent. */
  reactViews: boolean;
}

/** Attributes of a wiki-link mention, as stored in the document. */
export function wikiAttrs(note: NoteRef, displayText: string | null): Record<string, unknown> {
  return { id: note.id, label: note.title || 'Untitled', displayText, mentionSuggestionChar: WIKI_TRIGGER };
}

const renderLinkText = (attrs: Record<string, unknown>): string => {
  const label = (attrs['label'] as string | null) ?? '';
  const alias = attrs['displayText'] as string | null;
  return `[[${label}${alias ? `|${alias}` : ''}]]`;
};

const NoteList = createSuggestionList<NoteRef>({
  itemKey: (n) => n.id,
  renderItem: (n) => (<><span className="sh-popup-icon">[[</span><span>{n.title || 'Untitled'}</span></>),
  header: <div className="sh-popup-header">Link to note <span className="sh-popup-hint">[[title|alias]]</span></div>,
  empty: 'No matching notes',
});

/**
 * `[[Note]]` links: the official Mention node with a `[[` trigger, an alias
 * attribute, typed-link input rules, a React view and markdown support.
 * Stored as `{ type: 'mention', attrs: { id, label, displayText, mentionSuggestionChar } }`.
 */
export function wikiLink(ctx: ShuttleContextRef, view: ViewOptions) {
  return Mention.extend({
    addOptions() {
      return { ...this.parent!(), ctx };
    },

    addAttributes() {
      return {
        ...this.parent?.(),
        displayText: {
          default: null,
          parseHTML: (el: HTMLElement) => el.getAttribute('data-display-text'),
          renderHTML: (attrs: Record<string, unknown>) =>
            attrs['displayText'] ? { 'data-display-text': attrs['displayText'] } : {},
        },
      };
    },

    ...(view.reactViews ? { addNodeView: () => ReactNodeViewRenderer(WikiLinkView, { as: 'span' }) } : {}),

    addInputRules() {
      return [
        new InputRule({
          find: TYPED_LINK,
          handler: ({ state, range, match }) => {
            const note = ctx.current.host.findNoteByTitle((match[1] ?? '').trim());
            if (!note) return null;
            const alias = (match[2] ?? '').trim() || null;
            state.tr.replaceWith(range.from, range.to, this.type.create(wikiAttrs(note, alias)));
          },
        }),
      ];
    },

    addPasteRules() {
      return [
        new PasteRule({
          find: PASTED_LINK,
          handler: ({ state, range, match }) => {
            const note = ctx.current.host.findNoteByTitle((match[1] ?? '').trim());
            // Not `null`: a null from any match vetoes the whole rule, links included.
            if (!note) return;
            const alias = (match[2] ?? '').trim() || null;
            state.tr.replaceWith(range.from, range.to, this.type.create(wikiAttrs(note, alias)));
          },
        }),
      ];
    },

    /**
     * Backspace right after a typed `[[Title]]` converted undoes the
     * conversion; otherwise it removes the whole link. Mention's own shortcut
     * would turn the link back into its `[[` trigger text instead.
     */
    addKeyboardShortcuts() {
      return {
        Backspace: () => this.editor.commands.first(({ commands }) => [
          () => commands.undoInputRule(),
          () => commands.command(({ tr, state }) => {
            const { empty, $from } = state.selection;
            const before = $from.nodeBefore;
            if (!empty || before?.type !== this.type) return false;
            tr.delete($from.pos - before.nodeSize, $from.pos);
            return true;
          }),
        ]),
      };
    },

    markdownTokenName: 'wikiLink',
    markdownTokenizer: {
      name: 'wikiLink',
      level: 'inline',
      start: (src: string) => src.indexOf('[['),
      tokenize: (src: string) => {
        const m = MARKDOWN_LINK.exec(src);
        if (!m) return undefined;
        return { type: 'wikiLink', raw: m[0], title: (m[1] ?? '').trim(), alias: (m[2] ?? '').trim() || null };
      },
    },
    parseMarkdown: (token, helpers) => {
      const note = ctx.current.host.findNoteByTitle(String(token['title'] ?? ''));
      if (!note) return helpers.createTextNode(String(token.raw ?? ''));
      return helpers.createNode('mention', wikiAttrs(note, (token['alias'] as string | null) ?? null));
    },
    renderMarkdown: (node: JSONContent) => renderLinkText(node.attrs ?? {}),
  }).configure({
    renderText: ({ node }) => renderLinkText(node.attrs),
    renderHTML: ({ options, node }) => [
      'span',
      mergeAttributes({ 'data-type': 'mention' }, options.HTMLAttributes),
      (node.attrs['displayText'] as string | null) ?? (node.attrs['label'] as string | null) ?? '',
    ],
    suggestion: {
      char: WIKI_TRIGGER,
      pluginKey: wikiLinkPluginKey,
      allowSpaces: true,
      items: async ({ query }: { query: string }) => (await ctx.current.host.searchNotes(query))
        .filter((n) => n.id !== ctx.current.docKey)
        .slice(0, 8),
      command: ({ editor, range, props }) => {
        const note = props as unknown as NoteRef;
        // Swallow an existing space after the query so the link is followed by exactly one.
        const after = editor.state.doc.textBetween(range.to, Math.min(range.to + 1, editor.state.doc.content.size));
        const target = after === ' ' ? { from: range.from, to: range.to + 1 } : range;
        editor.chain().focus().insertContentAt(target, [
          { type: 'mention', attrs: wikiAttrs(note, null) },
          { type: 'text', text: ' ' },
        ]).run();
      },
      render: suggestionPopup(NoteList, { maxHeight: 280, maxWidth: 280 }),
    },
  });
}
