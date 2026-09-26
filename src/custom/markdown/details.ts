import { Details } from '@tiptap/extension-details';
import type { JSONContent, MarkdownToken } from '@tiptap/core';

const FIRST_LINE = /^:::details\b[ \t]*([^\n]*)(\n|$)/;

/**
 * Scans a details block starting at `:::details` on the first line of `src`,
 * tracking nesting depth so an inner `:::details ... :::` doesn't close the
 * outer block early, and ignoring `:::`-shaped lines inside fenced code
 * blocks. Returns `undefined` when the block is never closed.
 */
// A fenced-code-block delimiter: up to 3 leading spaces then 3+ backticks or
// tildes. Checked against the UNtrimmed line, so a 4-space-indented fence
// (itself just an indented code block in commonmark, not a fence) doesn't
// toggle fence state, and lines inside the fence — including ':::'-shaped
// ones — are never mistaken for details markers.
const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})/;

function scanDetailsBlock(src: string): { raw: string; summary: string; bodySrc: string } | undefined {
  const first = FIRST_LINE.exec(src);
  if (!first) return undefined;
  const summary = (first[1] ?? '').trim();
  const bodyStart = first[0].length;

  let depth = 1;
  let inFence = false;
  let pos = bodyStart;

  while (pos <= src.length) {
    const nlIndex = src.indexOf('\n', pos);
    const lineEnd = nlIndex === -1 ? src.length : nlIndex;
    const rawLine = src.slice(pos, lineEnd);
    const line = rawLine.trim();

    if (!inFence && FENCE_LINE.test(rawLine)) {
      inFence = true;
    } else if (inFence) {
      if (FENCE_LINE.test(rawLine)) inFence = false;
    } else if (/^:::details\b/.test(line)) {
      depth += 1;
    } else if (line === ':::') {
      depth -= 1;
      if (depth === 0) {
        const rawEnd = nlIndex === -1 ? src.length : nlIndex + 1;
        const bodyEnd = pos > bodyStart ? pos - 1 : bodyStart;
        return { raw: src.slice(0, rawEnd), summary, bodySrc: src.slice(bodyStart, bodyEnd) };
      }
    }

    if (nlIndex === -1) return undefined;
    pos = nlIndex + 1;
  }
  return undefined;
}

const textOf = (node: JSONContent | undefined): string =>
  (node?.content ?? []).map((c) => c.text ?? textOf(c)).join('');

/**
 * Details (toggle) blocks with a markdown form:
 *
 *   :::details Summary text
 *   Body markdown
 *   :::
 *
 * The `open`/`closed` toggle state is UI-only and is never represented in
 * markdown — round-tripping through markdown always yields a closed block.
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
      const found = scanDetailsBlock(src);
      if (!found) return undefined;
      const summaryTokens: MarkdownToken[] = found.summary ? lexer.inlineTokens(found.summary) : [];
      return {
        type: 'details',
        raw: found.raw,
        summary: found.summary,
        summaryTokens,
        tokens: lexer.blockTokens(found.bodySrc),
      };
    },
  },
  parseMarkdown: (token, helpers) => {
    const summaryTokens = (token['summaryTokens'] as MarkdownToken[] | undefined) ?? [];
    const summary = helpers.parseInline(summaryTokens);
    const body = helpers.parseChildren(token['tokens'] ?? []);
    return helpers.createNode('details', {}, [
      helpers.createNode('detailsSummary', {}, summary),
      helpers.createNode('detailsContent', {}, body.length > 0 ? body : [{ type: 'paragraph' }]),
    ]);
  },
  renderMarkdown: (node: JSONContent, helpers) => {
    const [summary, content] = node.content ?? [];
    const summaryText = helpers.renderChildren(summary?.content ?? []) || textOf(summary);
    const body = helpers.renderChildren(content?.content ?? [], '\n\n');
    return `:::details ${summaryText}\n${body}\n:::`;
  },
}).configure({ persist: true, HTMLAttributes: { class: 'sh-details' } });
