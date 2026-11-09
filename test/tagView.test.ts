import { describe, it, expect } from 'bun:test';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { guardHost } from '../src/guardHost';
import { createFakeHost } from '../src/testing/fakeHost';
import { noopEvents, type ShuttleContextRef } from '../src/context';
import { tagView } from '../src/custom/tagView/tagView';
import { blockRef } from '../src/custom/blockRef/blockRef';
import { filterSlashItems } from '../src/custom/slash/items';
import { BLOCK_TYPES } from '../src/extensions/blockTypes';

describe('tag view host callbacks', () => {
  it('stay missing when the host has none', () => {
    const host = guardHost(createFakeHost());
    expect(host.createTagView).toBeUndefined();
    expect(host.renderTagView).toBeUndefined();
  });

  it('are passed through, and a throwing render is caught and logged', async () => {
    const fake = createFakeHost({ tagViews: true });
    const host = guardHost(fake);
    expect(await host.createTagView!()).toBe('view-1');
    const el = document.createElement('div');
    const stop = host.renderTagView!(el, 'view-1', { remove() {} });
    expect(el.textContent).toBe('tag view view-1');
    stop();
    expect(el.textContent).toBe('');

    const broken = guardHost({ ...fake, renderTagView: () => { throw new Error('boom'); } });
    expect(() => broken.renderTagView!(el, 'x', { remove() {} })()).not.toThrow();
    expect(fake.calls.logs.some((l) => l.message === 'Host call failed')).toBe(true);
  });
});

function editorWith(html: string): Editor {
  const ctx: ShuttleContextRef = { current: { host: createFakeHost({ tagViews: true }), events: noopEvents, docKey: 'n1' } };
  return new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit, tagView(ctx, { reactViews: false }), blockRef(ctx, { reactViews: false })],
    content: html,
  });
}

describe('tagView node', () => {
  it('keeps only its view id', () => {
    const e = editorWith('<div data-tag-view data-view-id="view-1"></div>');
    expect(e.getJSON().content?.[0]).toEqual({ type: 'tagView', attrs: { viewId: 'view-1' } });
    e.destroy();
  });

  it('replaces an empty paragraph and leaves a paragraph after it', () => {
    const e = editorWith('<p></p>');
    e.commands.insertTagView('view-2');
    expect(e.getJSON().content?.map((n) => n.type)).toEqual(['tagView', 'paragraph']);
    e.destroy();
  });

  it('blockRef still inserts the same way', () => {
    const e = editorWith('<p>x</p>');
    e.commands.setTextSelection(2);
    e.commands.insertBlockRef('b1', 'n9');
    expect(e.getJSON().content?.map((n) => n.type)).toEqual(['paragraph', 'blockRef', 'paragraph']);
    e.destroy();
  });

  it('is a block that gets an id', () => {
    expect(BLOCK_TYPES).toContain('tagView');
  });

  it('is offered in the slash menu only when the host can create views', () => {
    expect(filterSlashItems('tag view', 'note').map((i) => i.title)).toEqual([]);
    const host = createFakeHost({ tagViews: true });
    expect(filterSlashItems('tag view', 'note', host).map((i) => i.title)).toEqual(['Tag view']);
  });
});
