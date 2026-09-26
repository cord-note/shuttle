import { describe, it, expect } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import { toStoredJson } from '../src/doc/persist';
import { makeEditor } from './helpers';

const mention: JSONContent = {
  type: 'mention',
  attrs: { id: 'n-alpha', label: 'Alpha', displayText: null, mentionSuggestionChar: '[[' },
};

describe('toStoredJson', () => {
  it('drops the outline ids TableOfContents writes into headings', () => {
    const out = toStoredJson({
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 2, blockId: 'h', id: 'toc-1', 'data-toc-id': 'toc-1' }, content: [{ type: 'text', text: 'T' }] }],
    });
    expect(out.content?.[0]?.attrs).toEqual({ level: 2, blockId: 'h' });
  });

  it("keeps a mention's id and every blockId", () => {
    const input: JSONContent = {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { blockId: 'p' }, content: [mention] }],
    };
    const out = toStoredJson(input);
    expect(out).toEqual(input);
    expect(out.content?.[0]?.content?.[0]?.attrs?.['id']).toBe('n-alpha');
  });

  it('does not mutate its input', () => {
    const input: JSONContent = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1, id: 'x', 'data-toc-id': 'x' } }] };
    toStoredJson(input);
    expect(input.content?.[0]?.attrs?.['id']).toBe('x');
  });

  it('a stored document survives load and re-save unchanged', () => {
    const stored: JSONContent = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1, blockId: 'b1' }, content: [{ type: 'text', text: 'Title' }] },
        { type: 'paragraph', attrs: { blockId: 'b2' }, content: [{ type: 'text', text: 'See ' }, mention] },
        { type: 'heading', attrs: { level: 2, blockId: 'b3' }, content: [{ type: 'text', text: 'Sub' }] },
        { type: 'paragraph', attrs: { blockId: 'b4' } },
      ],
    };
    const { editor } = makeEditor();
    editor.commands.setContent(stored, { emitUpdate: false });
    expect(toStoredJson(editor.getJSON())).toEqual(stored);
    editor.destroy();
  });
});
