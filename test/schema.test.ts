import { describe, it, expect } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import { EVERYTHING, para, text } from './fixtures';
import { makeEditor, sleep } from './helpers';
import { BLOCK_TYPES } from '../src/extensions/blockTypes';

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

describe('blockId guard', () => {
  const p = (id: string | null, t: string): JSONContent => ({ type: 'paragraph', attrs: { blockId: id }, content: [text(t)] });
  const topIds = (doc: { forEach(f: (n: { attrs: Record<string, unknown> }) => void): void }): unknown[] => {
    const ids: unknown[] = [];
    doc.forEach((n) => ids.push(n.attrs['blockId']));
    return ids;
  };

  it('keeps the first of two loaded duplicates and re-mints the second', () => {
    const { editor } = makeEditor();
    editor.commands.setContent({ type: 'doc', content: [p('D', 'a'), p('D', 'b')] }, { emitUpdate: false });
    const ids = topIds(editor.state.doc);
    expect(ids[0]).toBe('D');
    expect(typeof ids[1]).toBe('string');
    expect(ids[1]).not.toBe('D');
    expect(new Set(ids).size).toBe(ids.length);
    editor.destroy();
  });

  it('re-mints a programmatically inserted duplicate, leaving the original alone', async () => {
    const { editor } = makeEditor({ content: { type: 'doc', content: [p('A', 'a')] } });
    await sleep(0);
    editor.commands.insertContentAt(editor.state.doc.content.size, p('A', 'b'));
    const ids = topIds(editor.state.doc);
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(editor.state.doc.firstChild?.attrs['blockId']).toBe('A');
    expect(editor.state.doc.firstChild?.textContent).toBe('a');
    editor.destroy();
  });

  it('gives id-less loaded blocks ids immediately, without waiting a tick', () => {
    const { editor } = makeEditor();
    editor.commands.setContent({ type: 'doc', content: [p(null, 'a'), p(null, 'b'), { type: 'horizontalRule' }, p(null, 'c')] }, { emitUpdate: false });
    const ids = topIds(editor.state.doc);
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    editor.destroy();
  });

  it('keeps loaded unique ids exactly', () => {
    const { editor } = makeEditor();
    editor.commands.setContent({ type: 'doc', content: [p('x1', 'a'), p('x2', 'b'), p('x3', 'c')] }, { emitUpdate: false });
    expect(topIds(editor.state.doc)).toEqual(['x1', 'x2', 'x3']);
    editor.destroy();
  });
});
