import { describe, it, expect, afterEach } from 'bun:test';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { createFakeHost } from '../src/testing/fakeHost';
import { noopEvents, type ShuttleContextRef } from '../src/context';
import { wikiLink, WIKI_TRIGGER } from '../src/custom/links/wikiLink';

let editor: Editor | null = null;
afterEach(() => { editor?.destroy(); editor = null; });

function make(): Editor {
  const ctx: ShuttleContextRef = { current: { host: createFakeHost(), events: noopEvents, docKey: 'n-self' } };
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit, wikiLink(ctx, { reactViews: false })],
    content: '<p></p>',
  });
  return editor;
}

function typeText(e: Editor, text: string): void {
  // Input rules run from handleTextInput, one character at a time.
  for (const ch of text) {
    const { from, to } = e.state.selection;
    const handled = e.view.someProp('handleTextInput', (f) => f(e.view, from, to, ch, () => e.state.tr.insertText(ch, from, to)));
    if (!handled) e.view.dispatch(e.state.tr.insertText(ch, from, to));
  }
}

const mentions = (e: Editor) => {
  const out: Record<string, unknown>[] = [];
  e.state.doc.descendants((n) => { if (n.type.name === 'mention') out.push(n.attrs); });
  return out;
};

describe('wiki links', () => {
  it('uses [[ as the suggestion trigger', () => {
    expect(WIKI_TRIGGER).toBe('[[');
  });

  it('converts a typed [[Title]] to a mention', () => {
    const e = make();
    typeText(e, 'see [[Alpha]]');
    expect(mentions(e)).toEqual([
      { id: 'n-alpha', label: 'Alpha', displayText: null, mentionSuggestionChar: '[[' },
    ]);
  });

  it('keeps an alias from [[Title|alias]]', () => {
    const e = make();
    typeText(e, '[[beta|the second]]');
    expect(mentions(e)[0]).toMatchObject({ id: 'n-beta', displayText: 'the second' });
  });

  it('leaves unknown titles as text', () => {
    const e = make();
    typeText(e, '[[Nope]]');
    expect(mentions(e)).toEqual([]);
    expect(e.getText()).toBe('[[Nope]]');
  });

  it('renders [[label|alias]] as plain text', () => {
    const e = make();
    typeText(e, '[[beta|the second]]');
    expect(e.getText()).toBe('[[Beta|the second]]');
  });
});
