import { describe, it, expect, afterEach } from 'bun:test';
import { Editor } from '@tiptap/core';
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

describe(':::details markdown', () => {
  it('parses into a details node with summary and body', () => {
    const e = make();
    e.commands.setContent(':::details Summary\nBody text\n:::', { contentType: 'markdown' });
    const first = e.getJSON().content?.[0];
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
    const json = e.getJSON();
    expect(json.content?.length).toBe(1);
    expect(json.content?.[0]?.type).toBe('paragraph');
  });

  it('interrupts a paragraph at a line-start :::details', () => {
    const e = make();
    e.commands.setContent('intro\n:::details S\nbody\n:::', { contentType: 'markdown' });
    // StarterKit's TrailingNode appends an empty paragraph after any doc that
    // doesn't already end in a default textblock — the same happens after a
    // trailing codeBlock or blockquote — so it is expected here too.
    const types = (e.getJSON().content ?? []).map((n) => n.type);
    expect(types).toEqual(['paragraph', 'details', 'paragraph']);
  });
});
