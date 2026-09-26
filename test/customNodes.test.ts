import { describe, it, expect, afterEach } from 'bun:test';
import { Editor, type AnyExtension, type Content } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { TextSelection } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import { createFakeHost } from '../src/testing/fakeHost';
import { noopEvents, type ShuttleContextRef } from '../src/context';
import { fragmentLink } from '../src/custom/links/fragmentLink';
import { blockRef } from '../src/custom/blockRef/blockRef';

let editor: Editor | null = null;
afterEach(() => { editor?.destroy(); editor = null; });

function make(): Editor {
  return makeWith('<p>x</p>');
}

function makeWith(content: Content, extra: AnyExtension[] = []): Editor {
  const ctx: ShuttleContextRef = { current: { host: createFakeHost(), events: noopEvents, docKey: 'n-self' } };
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit, fragmentLink(ctx, { reactViews: false }), blockRef(ctx, { reactViews: false }), ...extra],
    content,
  });
  return editor;
}

/** Position just inside the first text node matching `text` (top-level or nested). */
function posOfText(doc: PMNode, text: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found !== -1) return false;
    if (node.isText && node.text === text) { found = pos + 1; return false; }
    return true;
  });
  return found;
}

/** Position inside the first empty top-level paragraph, or -1. */
function emptyParagraphPos(doc: PMNode): number {
  let pos = -1;
  doc.forEach((node, offset) => {
    if (pos === -1 && node.type.name === 'paragraph' && node.content.size === 0) pos = offset + 1;
  });
  return pos;
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

  it('round-trips explicit data attributes through HTML', () => {
    const e = make();
    e.commands.setTextSelection(2);
    e.commands.insertFragmentLink({ linkId: '123', toNoteId: 'n-beta', toFragmentId: null, label: '2024' });
    const html = e.getHTML();
    expect(html).toContain('data-link-id="123"');
    expect(html).toContain('data-to-note-id="n-beta"');
    expect(html).not.toContain('data-to-fragment-id');
    expect(html).toContain('data-label="2024"');

    e.commands.setContent(html);
    const found: Record<string, unknown>[] = [];
    e.state.doc.descendants((n) => { if (n.type.name === 'fragmentLink') found.push(n.attrs); });
    expect(found).toEqual([{ linkId: '123', toNoteId: 'n-beta', toFragmentId: null, label: '2024' }]);
  });

  it('falls back to the rendered text for the label when data-label is absent', () => {
    const e = make();
    e.commands.setContent('<p><span data-fragment-link data-link-id="l9" data-to-note-id="n-beta">Beta note</span></p>');
    const found: Record<string, unknown>[] = [];
    e.state.doc.descendants((n) => { if (n.type.name === 'fragmentLink') found.push(n.attrs); });
    expect(found[0]?.['label']).toBe('Beta note');
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

describe('insertBlockRef placement', () => {
  it('replaces an empty top-level paragraph and lands the caret at the start of the following block', () => {
    const e = makeWith({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: 'b' }] },
      ],
    });
    const emptyPos = emptyParagraphPos(e.state.doc);
    expect(emptyPos).toBeGreaterThan(-1);
    e.commands.setTextSelection(emptyPos);
    e.commands.insertBlockRef('b1', 'n-beta');

    expect(e.state.doc.childCount).toBe(3);
    expect(e.state.doc.child(0).type.name).toBe('paragraph');
    expect(e.state.doc.child(0).textContent).toBe('a');
    expect(e.state.doc.child(1).type.name).toBe('blockRef');
    expect(e.state.doc.child(2).type.name).toBe('paragraph');
    expect(e.state.doc.child(2).textContent).toBe('b');

    const sel = e.state.selection;
    expect(sel).toBeInstanceOf(TextSelection);
    expect(sel.$from.parent.textContent).toBe('b');
    expect(sel.$from.parentOffset).toBe(0);
  });

  it('inserts after a non-empty paragraph and appends an empty paragraph when nothing follows', () => {
    const e = makeWith('<p>abcd</p>');
    const pos = posOfText(e.state.doc, 'abcd');
    e.commands.setTextSelection(pos + 2);
    e.commands.insertBlockRef('b2', 'n-beta');

    expect(e.state.doc.childCount).toBe(3);
    expect(e.state.doc.child(0).textContent).toBe('abcd');
    expect(e.state.doc.child(1).type.name).toBe('blockRef');
    expect(e.state.doc.child(2).type.name).toBe('paragraph');
    expect(e.state.doc.child(2).content.size).toBe(0);

    const sel = e.state.selection;
    expect(sel).toBeInstanceOf(TextSelection);
    expect(sel.$from.parent.type.name).toBe('paragraph');
    expect(sel.$from.parent.content.size).toBe(0);
  });

  it('places the ref top-level after a list, never nested inside it', () => {
    const e = makeWith({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] },
          ],
        },
      ],
    });
    const pos = posOfText(e.state.doc, 'x');
    e.commands.setTextSelection(pos);
    e.commands.insertBlockRef('b3', 'n-beta');

    expect(e.state.doc.child(0).type.name).toBe('bulletList');
    expect(e.state.doc.child(1).type.name).toBe('blockRef');
    expect(e.state.doc.child(2).type.name).toBe('paragraph');

    expect(e.state.selection).toBeInstanceOf(TextSelection);
  });
});

describe('blockRef markdown', () => {
  it('does not treat a mid-line ![[..]] as a transclusion', () => {
    const e = makeWith('<p></p>', [Markdown]);
    e.commands.setContent('see ![[n#b]] here', { contentType: 'markdown' });

    expect(e.state.doc.childCount).toBe(1);
    expect(e.state.doc.child(0).type.name).toBe('paragraph');
    expect(e.state.doc.child(0).textContent).toBe('see ![[n#b]] here');

    let refs = 0;
    e.state.doc.descendants((n) => { if (n.type.name === 'blockRef') refs += 1; });
    expect(refs).toBe(0);
  });

  it('parses a block-level ![[noteId#blockId]] between blank lines', () => {
    const e = makeWith('<p></p>', [Markdown]);
    e.commands.setContent('para\n\n![[N_1-x#Ab_c-9]]\n\nafter', { contentType: 'markdown' });

    const refs: Record<string, unknown>[] = [];
    e.state.doc.descendants((n) => { if (n.type.name === 'blockRef') refs.push(n.attrs); });
    expect(refs).toEqual([{ refNoteId: 'N_1-x', refBlockId: 'Ab_c-9' }]);
    expect(e.getMarkdown()).toContain('![[N_1-x#Ab_c-9]]');
  });
});
