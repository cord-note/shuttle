import { describe, it, expect } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import { makeEditor, sleep } from './helpers';
import { BLOCK_TYPES } from '../src/extensions/blockTypes';

const text = (t: string, marks?: JSONContent['marks']): JSONContent => ({ type: 'text', text: t, ...(marks ? { marks } : {}) });
const para = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content });

const EVERYTHING: JSONContent = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [text('Title')] },
    para(
      text('b', [{ type: 'bold' }]), text('i', [{ type: 'italic' }]), text('u', [{ type: 'underline' }]),
      text('s', [{ type: 'strike' }]), text('c', [{ type: 'code' }]), text('h', [{ type: 'highlight' }]),
      text('sub', [{ type: 'subscript' }]), text('sup', [{ type: 'superscript' }]),
      text('link', [{ type: 'link', attrs: { href: 'https://example.com' } }]),
      { type: 'inlineMath', attrs: { latex: 'x^2' } },
      { type: 'mention', attrs: { id: 'n-alpha', label: 'Alpha', displayText: null, mentionSuggestionChar: '[[' } },
      { type: 'fragmentLink', attrs: { linkId: 'l1', toNoteId: 'n-beta', toFragmentId: null, label: 'Beta' } },
      { type: 'hardBreak' },
    ),
    { type: 'bulletList', content: [{ type: 'listItem', content: [para(text('a'))] }] },
    { type: 'orderedList', content: [{ type: 'listItem', content: [para(text('1'))] }] },
    { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [para(text('done'))] }] },
    { type: 'blockquote', content: [para(text('q'))] },
    { type: 'codeBlock', attrs: { language: 'ts' }, content: [text('const a = 1')] },
    { type: 'blockMath', attrs: { latex: '\\int x' } },
    { type: 'horizontalRule' },
    { type: 'image', attrs: { src: 'attachment:abc', alt: 'pic' } },
    { type: 'youtube', attrs: { src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } },
    { type: 'twitch', attrs: { src: 'https://www.twitch.tv/videos/1234567890' } },
    {
      type: 'table',
      content: [
        { type: 'tableRow', content: [{ type: 'tableHeader', content: [para(text('H'))] }] },
        { type: 'tableRow', content: [{ type: 'tableCell', content: [para(text('C'))] }] },
      ],
    },
    {
      type: 'details',
      content: [
        { type: 'detailsSummary', content: [text('More')] },
        { type: 'detailsContent', content: [para(text('hidden'))] },
      ],
    },
    { type: 'blockRef', attrs: { refBlockId: 'b1', refNoteId: 'n-beta' } },
    para(),
  ],
};

describe('schema', () => {
  for (const mode of ['note', 'notepad'] as const) {
    it(`loads a document using every node and mark (${mode})`, () => {
      const { editor } = makeEditor({ mode, content: EVERYTHING });
      expect(() => editor.state.doc.check()).not.toThrow();
      const types = new Set<string>();
      editor.state.doc.descendants((n) => { types.add(n.type.name); n.marks.forEach((m) => types.add(m.type.name)); });
      for (const t of ['inlineMath', 'blockMath', 'mention', 'fragmentLink', 'blockRef', 'image', 'youtube', 'twitch',
        'table', 'details', 'taskItem', 'highlight', 'subscript', 'superscript', 'underline', 'link']) {
        expect(types.has(t)).toBe(true);
      }
      editor.destroy();
    });
  }

  // Tiptap 3 emits `create` from a setTimeout, and UniqueID assigns the
  // initial ids in `onCreate` — so ids (and the trailing node, appended to
  // that transaction) exist only after a tick.
  it('gives every top-level block a unique blockId', async () => {
    const { editor } = makeEditor({ mode: 'notepad', content: EVERYTHING });
    await sleep(0);
    const ids: string[] = [];
    editor.state.doc.forEach((n) => {
      if (BLOCK_TYPES.includes(n.type.name)) ids.push(n.attrs['blockId'] as string);
    });
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    editor.destroy();
  });

  // UniqueID de-duplicates on paste: its `paste` DOM handler arms
  // `transformPasted`, which strips ids from the pasted slice so they are
  // minted fresh. A programmatic `insertContentAt` (or `view.pasteHTML`,
  // which skips the DOM handler) keeps the duplicate — so this simulates a
  // real paste event.
  it('re-mints ids on pasted duplicates', async () => {
    const { editor } = makeEditor({ content: { type: 'doc', content: [{ type: 'paragraph', attrs: { blockId: 'same' }, content: [{ type: 'text', text: 'a' }] }] } });
    await sleep(0);
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/html', '<p data-blockid="same">b</p><p data-blockid="same">c</p>');
    editor.view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
    const ids: string[] = [];
    editor.state.doc.forEach((n) => ids.push(n.attrs['blockId'] as string));
    expect(editor.getText()).toContain('c');
    expect(ids.length).toBeGreaterThan(1);
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    editor.destroy();
  });

  it('keeps a trailing paragraph after an atom block', async () => {
    const { editor } = makeEditor({ content: { type: 'doc', content: [{ type: 'horizontalRule' }] } });
    await sleep(0);
    expect(editor.state.doc.lastChild?.type.name).toBe('paragraph');
    editor.destroy();
  });
});
