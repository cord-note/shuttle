import { describe, it, expect } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import { EVERYTHING } from './fixtures';
import { makeEditor, stripIds } from './helpers';

/** Parse markdown, serialise it, parse again: the document must survive. */
function roundTrip(md: string) {
  const { editor } = makeEditor();
  editor.commands.setContent(md, { contentType: 'markdown' });
  const first = stripIds(editor.getJSON());
  const out = editor.getMarkdown();
  editor.commands.setContent(out, { contentType: 'markdown' });
  const second = stripIds(editor.getJSON());
  editor.destroy();
  return { first, second, out };
}

/** Every node and mark type used anywhere in a JSON document. */
function typesIn(node: JSONContent, into: Set<string> = new Set()): Set<string> {
  if (node.type) into.add(node.type);
  node.marks?.forEach((m) => into.add(m.type));
  node.content?.forEach((c) => typesIn(c, into));
  return into;
}

const CASES: [name: string, md: string, expected: string[]][] = [
  ['wiki links', 'Link to [[Alpha]] and [[Beta|the second]].', ['mention']],
  ['math', 'Inline $x^2$ here.\n\n$$\\int_0^1 x\\,dx$$', ['inlineMath', 'blockMath']],
  ['tables', '| a | b |\n| --- | --- |\n| 1 | 2 |', ['table', 'tableHeader', 'tableCell']],
  ['task lists', '- [ ] one\n- [x] two', ['taskList', 'taskItem']],
  ['highlight', 'some ==marked== text', ['highlight']],
  ['details', ':::details Summary\nBody text\n:::', ['details', 'detailsSummary', 'detailsContent']],
  ['block refs', '![[n-beta#b1]]', ['blockRef']],
];

describe('markdown', () => {
  it.each(CASES)('round-trips %s', (_name, md, expected) => {
    const { first, second } = roundTrip(md);
    // Guard against a vacuous pass: a round trip of plain paragraphs proves nothing.
    const types = typesIn(first);
    for (const t of expected) expect(types.has(t)).toBe(true);
    expect(second).toEqual(first);
  });

  it('parses wiki links into mentions', () => {
    const { first } = roundTrip('See [[Alpha]]');
    expect(JSON.stringify(first)).toContain('"type":"mention"');
    expect(JSON.stringify(first)).toContain('"id":"n-alpha"');
  });

  it('parses details into a details node', () => {
    const { first } = roundTrip(':::details Summary\nBody text\n:::');
    expect(first.content?.[0]?.type).toBe('details');
  });
});

/**
 * Markdown is input UX; these are knowingly not representable, so a trip
 * through `getMarkdown()` drops them. Anything else going missing is a bug.
 */
const MARKDOWN_LOSSY: readonly string[] = ['fragmentLink', 'subscript', 'superscript'];

describe('markdown lossiness', () => {
  it('loses only the allowlisted node and mark types', () => {
    const { editor } = makeEditor({ content: EVERYTHING });
    const before = typesIn(editor.getJSON());
    const md = editor.getMarkdown();
    editor.commands.setContent(md, { contentType: 'markdown' });
    const after = typesIn(editor.getJSON());
    editor.destroy();
    const lost = [...before].filter((t) => !after.has(t)).sort();
    expect(lost).toEqual([...MARKDOWN_LOSSY].sort());
  });
});
