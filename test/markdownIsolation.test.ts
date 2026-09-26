import { describe, it, expect, afterEach } from 'bun:test';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { marked } from 'marked';
import { makeEditor } from './helpers';
import { createFakeHost } from '../src/testing/fakeHost';
import { blockRef } from '../src/custom/blockRef/blockRef';
import { noopEvents, type ShuttleContextRef } from '../src/context';

// `@tiptap/markdown` registers every extension's tokenizer on whichever `marked`
// it is given — the module singleton by default. Each Shuttle editor must get
// its own, or one editor's tokenizers leak into every editor built after it.

const editors: Editor[] = [];
afterEach(() => { for (const e of editors.splice(0)) e.destroy(); });

const track = <T extends { editor: Editor }>(made: T): T => { editors.push(made.editor); return made; };

const singletonInlineTokenizers = (): number => marked.defaults.extensions?.inline?.length ?? 0;

describe('markdown parser isolation', () => {
  it('a full editor registers nothing on the shared marked singleton', () => {
    const before = singletonInlineTokenizers();
    track(makeEditor());
    expect(singletonInlineTokenizers()).toBe(before);
  });

  it("a full editor's wiki-link tokenizer does not reach a later, smaller editor", () => {
    track(makeEditor());

    const ctx: ShuttleContextRef = { current: { host: createFakeHost(), events: noopEvents, docKey: 'n-self' } };
    const small = new Editor({
      element: document.createElement('div'),
      extensions: [StarterKit, Markdown, blockRef(ctx, { reactViews: false })],
      content: '<p></p>',
    });
    editors.push(small);

    small.commands.setContent('a ![[n#b]]', { contentType: 'markdown' });
    expect(small.state.doc.childCount).toBe(1);
    expect(small.state.doc.child(0).type.name).toBe('paragraph');
    expect(small.state.doc.child(0).textContent).toBe('a ![[n#b]]');
  });

  it('two full editors each get their own parser, with one copy of each tokenizer', () => {
    const a = track(makeEditor({ host: createFakeHost({ notes: [{ id: 'n-alpha', title: 'Alpha' }] }) })).editor;
    const b = track(makeEditor({ host: createFakeHost({ notes: [{ id: 'n-other', title: 'Other' }] }) })).editor;

    const ia = a.markdown?.instance;
    const ib = b.markdown?.instance;
    expect(ia).toBeDefined();
    expect(ia).not.toBe(ib);
    expect(ia).not.toBe(marked);
    expect(ib?.defaults.extensions?.inline?.length).toBe(ia?.defaults.extensions?.inline?.length);
  });

  it("a destroyed editor's host is never consulted by a later editor", () => {
    const a = track(makeEditor({ host: createFakeHost({ notes: [{ id: 'n-alpha', title: 'Alpha' }] }) })).editor;
    a.destroy();
    editors.splice(editors.indexOf(a), 1);

    const b = track(makeEditor({ host: createFakeHost({ notes: [{ id: 'n-other', title: 'Other' }] }) })).editor;
    b.commands.setContent('[[Alpha]] and [[Other]]', { contentType: 'markdown' });

    const mentions: string[] = [];
    b.state.doc.descendants((n) => { if (n.type.name === 'mention') mentions.push(String(n.attrs['id'])); });
    expect(mentions).toEqual(['n-other']);
    expect(b.state.doc.textContent).toContain('[[Alpha]]');
  });
});
