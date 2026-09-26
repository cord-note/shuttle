import { describe, it, expect, afterEach } from 'bun:test';
import { Editor, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { DetailsContent, DetailsSummary } from '@tiptap/extension-details';
import { ShuttleDetails } from '../src/custom/markdown/details';

let editor: Editor | null = null;
afterEach(() => { editor?.destroy(); editor = null; });

function make(): Editor {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit, Markdown, ShuttleDetails, DetailsSummary, DetailsContent],
  });
  return editor;
}

/**
 * `Editor.getJSON()` is typed with a strict `NodeType | TextType` union for
 * `content` (so a text node's `.content` and a node's `.text` are typed as
 * absent), which is more precise than useful here. Widen to the general
 * `JSONContent` shape (which declares both as optional) so tests can freely
 * inspect `.content`/`.text`/`.marks` on arbitrary nodes.
 */
function toJSON(e: Editor): JSONContent {
  return e.getJSON();
}

describe(':::details markdown', () => {
  it('parses into a details node with summary and body', () => {
    const e = make();
    e.commands.setContent(':::details Summary\nBody text\n:::', { contentType: 'markdown' });
    const first = toJSON(e).content?.[0];
    expect(first?.type).toBe('details');
    expect(JSON.stringify(first)).toContain('Summary');
    expect(JSON.stringify(first)).toContain('Body text');
  });

  it('round-trips through getMarkdown', () => {
    const e = make();
    e.commands.setContent(':::details Summary\nBody text\n:::', { contentType: 'markdown' });
    const once = e.getJSON();
    e.commands.setContent(e.getMarkdown(), { contentType: 'markdown' });
    expect(e.getJSON()).toEqual(once);
  });

  it('does not split a paragraph that merely mentions :::details', () => {
    const e = make();
    e.commands.setContent('see :::details inline', { contentType: 'markdown' });
    const json = toJSON(e);
    expect(json.content?.length).toBe(1);
    expect(json.content?.[0]?.type).toBe('paragraph');
  });

  it('interrupts a paragraph at a line-start :::details', () => {
    const e = make();
    e.commands.setContent('intro\n:::details S\nbody\n:::', { contentType: 'markdown' });
    // StarterKit's TrailingNode appends an empty paragraph after any doc that
    // doesn't already end in a default textblock — the same happens after a
    // trailing codeBlock or blockquote — so it is expected here too.
    const types = (toJSON(e).content ?? []).map((n) => n.type);
    expect(types).toEqual(['paragraph', 'details', 'paragraph']);
  });

  it('nests a details block inside another without a stray ::: paragraph', () => {
    const e = make();
    e.commands.setContent(':::details Outer\n- one\n\n:::details Inner\ninner body\n:::\n:::', {
      contentType: 'markdown',
    });
    const outer = toJSON(e).content?.[0];
    expect(outer?.type).toBe('details');

    const outerContent = outer?.content?.[1]; // detailsContent
    expect(outerContent?.type).toBe('detailsContent');
    const childTypes = (outerContent?.content ?? []).map((n) => n.type);
    // Only the bulletList and the nested details — no stray ':::' paragraph.
    expect(childTypes).toEqual(['bulletList', 'details']);

    const inner = outerContent?.content?.[1];
    expect(inner?.type).toBe('details');
    expect(JSON.stringify(inner)).toContain('inner body');
  });

  it('round-trips a nested details block through getMarkdown', () => {
    const e = make();
    e.commands.setContent(':::details Outer\n- one\n\n:::details Inner\ninner body\n:::\n:::', {
      contentType: 'markdown',
    });
    const once = e.getJSON();
    e.commands.setContent(e.getMarkdown(), { contentType: 'markdown' });
    expect(e.getJSON()).toEqual(once);
  });

  it('keeps a ::: line inside a fenced code block from closing the details early', () => {
    const e = make();
    e.commands.setContent(':::details F\n```\nsome ::: text\n```\nafter\n:::', { contentType: 'markdown' });
    const outer = toJSON(e).content?.[0];
    expect(outer?.type).toBe('details');
    const content = outer?.content?.[1];
    const childTypes = (content?.content ?? []).map((n) => n.type);
    expect(childTypes).toEqual(['codeBlock', 'paragraph']);
    expect(JSON.stringify(content)).toContain('some ::: text');
  });

  it('treats ~~~ as a fence too, so a ::: line inside it does not close the details', () => {
    const e = make();
    e.commands.setContent(':::details S\n~~~\n:::\n~~~\n:::', { contentType: 'markdown' });
    const outer = toJSON(e).content?.[0];
    expect(outer?.type).toBe('details');
    const content = outer?.content?.[1];
    const childTypes = (content?.content ?? []).map((n) => n.type);
    expect(childTypes).toEqual(['codeBlock']);
    expect(content?.content?.[0]?.content?.map((n) => n.text).join('')).toBe(':::');
  });

  it('parses marks in the summary and round-trips them', () => {
    const e = make();
    e.commands.setContent(':::details S **b**\nx\n:::', { contentType: 'markdown' });
    const summary = toJSON(e).content?.[0]?.content?.[0];
    expect(summary?.type).toBe('detailsSummary');
    const hasBold = (summary?.content ?? []).some((n) => n.marks?.some((m) => m.type === 'bold'));
    expect(hasBold).toBe(true);

    const once = e.getJSON();
    e.commands.setContent(e.getMarkdown(), { contentType: 'markdown' });
    expect(e.getJSON()).toEqual(once);
  });
});
