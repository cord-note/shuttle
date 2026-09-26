import { Details } from '@tiptap/extension-details';
import type { JSONContent } from '@tiptap/core';

const DETAILS_BLOCK = /^:::details[ \t]*([^\n]*)\n([\s\S]*?)\n:::[ \t]*(?:\n|$)/;

const textOf = (node: JSONContent | undefined): string =>
  (node?.content ?? []).map((c) => c.text ?? textOf(c)).join('');

/**
 * Details (toggle) blocks with a markdown form:
 *
 *   :::details Summary text
 *   Body markdown
 *   :::
 */
export const ShuttleDetails = Details.extend({
  markdownTokenName: 'details',
  markdownTokenizer: {
    name: 'details',
    level: 'block',
    // Only interrupt a paragraph at a line-start `:::details` — a start of
    // `src.indexOf(':::details')` would wrongly cut a paragraph that merely
    // *mentions* it mid-line. marked calls `start` on `src.slice(1)`, so the
    // match is anchored on the preceding newline rather than `^`, and the
    // returned index is shifted back by the one character marked already
    // dropped.
    start: (src: string) => {
      const i = src.search(/\n:::details/);
      return i < 0 ? -1 : i + 1;
    },
    tokenize: (src: string, _tokens, lexer) => {
      const m = DETAILS_BLOCK.exec(src);
      if (!m) return undefined;
      return { type: 'details', raw: m[0], summary: (m[1] ?? '').trim(), tokens: lexer.blockTokens(m[2] ?? '') };
    },
  },
  parseMarkdown: (token, helpers) => {
    const summary = String(token['summary'] ?? '');
    const body = helpers.parseChildren(token['tokens'] ?? []);
    return helpers.createNode('details', {}, [
      helpers.createNode('detailsSummary', {}, summary ? [helpers.createTextNode(summary)] : []),
      helpers.createNode('detailsContent', {}, body.length > 0 ? body : [{ type: 'paragraph' }]),
    ]);
  },
  renderMarkdown: (node: JSONContent, helpers) => {
    const [summary, content] = node.content ?? [];
    const body = helpers.renderChildren(content?.content ?? [], '\n\n');
    return `:::details ${textOf(summary)}\n${body}\n:::`;
  },
}).configure({ persist: true, HTMLAttributes: { class: 'sh-details' } });
