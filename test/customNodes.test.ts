import { describe, it, expect, afterEach } from 'bun:test';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { createFakeHost } from '../src/testing/fakeHost';
import { noopEvents, type ShuttleContextRef } from '../src/context';
import { fragmentLink } from '../src/custom/links/fragmentLink';
import { blockRef } from '../src/custom/blockRef/blockRef';

let editor: Editor | null = null;
afterEach(() => { editor?.destroy(); editor = null; });

function make(): Editor {
  const ctx: ShuttleContextRef = { current: { host: createFakeHost(), events: noopEvents, docKey: 'n-self' } };
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit, fragmentLink(ctx, { reactViews: false }), blockRef(ctx, { reactViews: false })],
    content: '<p>x</p>',
  });
  return editor;
}

describe('fragment links', () => {
  it('inserts a fragment link with its attributes', () => {
    const e = make();
    e.commands.setTextSelection(2);
    e.commands.insertFragmentLink({ linkId: 'l1', toNoteId: 'n-beta', toFragmentId: 'b9', label: 'Beta §' });
    const json = JSON.stringify(e.getJSON());
    expect(json).toContain('"type":"fragmentLink"');
    expect(json).toContain('"linkId":"l1"');
  });
});

describe('block references', () => {
  it('inserts a transclusion that stores ids only', () => {
    const e = make();
    e.commands.insertBlockRef('b1', 'n-beta');
    const found: Record<string, unknown>[] = [];
    e.state.doc.descendants((n) => { if (n.type.name === 'blockRef') found.push(n.attrs); });
    expect(found).toEqual([{ refBlockId: 'b1', refNoteId: 'n-beta' }]);
  });

  it('renders its ids as data attributes', () => {
    const e = make();
    e.commands.insertBlockRef('b1', 'n-beta');
    expect(e.getHTML()).toContain('data-ref-block-id="b1"');
  });
});
