import { describe, it, expect, afterEach } from 'bun:test';
import { Editor, type AnyExtension, type Content, type Range } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { createFakeHost } from '../src/testing/fakeHost';
import { noopEvents, type ShuttleContextRef } from '../src/context';
import { wikiLink, wikiLinkPluginKey } from '../src/custom/links/wikiLink';

let editor: Editor | null = null;
afterEach(() => { editor?.destroy(); editor = null; });

function make(content: Content = '<p></p>', extra: AnyExtension[] = []): Editor {
  const ctx: ShuttleContextRef = { current: { host: createFakeHost(), events: noopEvents, docKey: 'n-self' } };
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit, wikiLink(ctx, { reactViews: false }), ...extra],
    content,
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

function pressBackspace(e: Editor): boolean {
  const event = new KeyboardEvent('keydown', { key: 'Backspace' });
  return e.view.someProp('handleKeyDown', (f) => f(e.view, event)) ?? false;
}

const mentions = (e: Editor) => {
  const out: Record<string, unknown>[] = [];
  e.state.doc.descendants((n) => { if (n.type.name === 'mention') out.push(n.attrs); });
  return out;
};

describe('wiki links', () => {
  it('opens the link suggestion on [[ and not on @', () => {
    const e = make();
    typeText(e, ' @al');
    expect(wikiLinkPluginKey.getState(e.state)?.active).toBe(false);
    typeText(e, ' [[al');
    expect(wikiLinkPluginKey.getState(e.state)?.active).toBe(true);
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

  describe('Backspace', () => {
    it('right after the input rule, undoes the conversion', () => {
      const e = make();
      typeText(e, 'x [[Alpha]]');
      expect(mentions(e)).toHaveLength(1);
      expect(pressBackspace(e)).toBe(true);
      expect(mentions(e)).toEqual([]);
      expect(e.getText()).toBe('x [[Alpha]]');
    });

    it('otherwise deletes the whole link, leaving no trigger behind', () => {
      const e = make({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x ' }] }] });
      e.commands.setTextSelection(3);
      e.commands.insertContent({ type: 'mention', attrs: { id: 'n-alpha', label: 'Alpha', mentionSuggestionChar: '[[' } });
      expect(mentions(e)).toHaveLength(1);
      pressBackspace(e);
      expect(mentions(e)).toEqual([]);
      expect(e.getText()).toBe('x ');
    });
  });

  it('converts resolvable pasted links and leaves the rest as text', () => {
    const e = make();
    // A real paste (uiEvent 'paste'). `insertContent(..., { applyPasteRules: true })` is not
    // usable here: Tiptap 3.31 hands later paste-rule plugins a stale `to` once a rule
    // shortens the document, and they walk off its end.
    e.view.pasteText('see [[Alpha]] and [[Nope]]');
    expect(mentions(e)).toEqual([
      { id: 'n-alpha', label: 'Alpha', displayText: null, mentionSuggestionChar: '[[' },
    ]);
    expect(e.getText()).toBe('see [[Alpha]] and [[Nope]]');
  });

  it('does not double the space after a picked suggestion', () => {
    const e = make('<p>x [[Al rest</p>');
    const ext = e.extensionManager.extensions.find((x) => x.name === 'mention');
    const command = (ext?.options as { suggestion: { command: (a: { editor: Editor; range: Range; props: unknown }) => void } })
      .suggestion.command;
    command({ editor: e, range: { from: 3, to: 7 }, props: { id: 'n-alpha', title: 'Alpha' } });
    expect(mentions(e)).toHaveLength(1);
    expect(e.getText()).toBe('x [[Alpha]] rest');
  });

  it('parses and serialises markdown', () => {
    const e = make('<p></p>', [Markdown]);
    e.commands.setContent('see [[Alpha]] and [[beta|b2]] and [[Nope]]', { contentType: 'markdown' });
    expect(mentions(e)).toEqual([
      { id: 'n-alpha', label: 'Alpha', displayText: null, mentionSuggestionChar: '[[' },
      { id: 'n-beta', label: 'Beta', displayText: 'b2', mentionSuggestionChar: '[[' },
    ]);
    const md = e.getMarkdown();
    expect(md).toContain('[[Alpha]]');
    expect(md).toContain('[[Beta|b2]]');
  });

  it('round-trips through HTML', () => {
    const e = make();
    typeText(e, 'see [[Alpha]] and [[beta|the second]]');
    const before = mentions(e);
    expect(before).toHaveLength(2);
    e.commands.setContent(e.getHTML());
    expect(mentions(e)).toEqual(before);
  });
});
