import { describe, it, expect, afterEach } from 'bun:test';
import * as Y from 'yjs';
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import type { Editor, JSONContent } from '@tiptap/core';
import { makeEditor, sleep } from './helpers';

// Editors bound to Y.Docs the way a host does it: one Y.Doc per editor, and
// updates passed between them as a sync engine would, tagged 'remote'.

const editors: Editor[] = [];
afterEach(() => { while (editors.length) editors.pop()!.destroy(); });

function bound(ydoc: Y.Doc): Editor {
  const { editor } = makeEditor({ build: { ydoc } });
  editors.push(editor);
  return editor;
}

/** Wires two docs together, each update going to the other once. */
function link(a: Y.Doc, b: Y.Doc): void {
  a.on('update', (u: Uint8Array, origin: unknown) => { if (origin !== 'remote') Y.applyUpdate(b, u, 'remote'); });
  b.on('update', (u: Uint8Array, origin: unknown) => { if (origin !== 'remote') Y.applyUpdate(a, u, 'remote'); });
}

const fragmentJson = (d: Y.Doc): JSONContent => yXmlFragmentToProsemirrorJSON(d.getXmlFragment('default'));
const tick = () => sleep(0);

describe('Shuttle on a Y.Doc', () => {
  it('writes what is typed into the Y.Doc', async () => {
    const ydoc = new Y.Doc();
    const editor = bound(ydoc);
    await tick();
    editor.commands.insertContent('hello');
    expect(JSON.stringify(fragmentJson(ydoc))).toContain('hello');
  });

  it('shows what arrives from elsewhere', async () => {
    const ydoc = new Y.Doc();
    const editor = bound(ydoc);
    await tick();
    const other = new Y.Doc();
    const writer = bound(other);
    await tick();
    writer.commands.insertContent('from afar');
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(other), 'remote');
    await tick();
    expect(editor.getText()).toContain('from afar');
  });

  it('two editors converge, block ids included', async () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    link(a, b);
    const ea = bound(a);
    const eb = bound(b);
    await tick();
    ea.commands.insertContent('<p>one</p><p>two</p>');
    eb.commands.focus('end');
    eb.commands.insertContent('<p>three</p>');
    await tick();
    expect(ea.getJSON()).toEqual(eb.getJSON());
    const ids = (ea.getJSON().content ?? []).map((n) => n.attrs?.['blockId']).filter(Boolean);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('undo takes back only this editor\'s edits', async () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    link(a, b);
    const ea = bound(a);
    const eb = bound(b);
    await tick();
    ea.commands.insertContent('mine ');
    await sleep(600); // y-undo groups edits made within 500 ms
    eb.commands.focus('end');
    eb.commands.insertContent('theirs');
    await tick();
    expect(ea.commands.undo()).toBe(true);
    await tick();
    expect(ea.getText()).not.toContain('mine');
    expect(ea.getText()).toContain('theirs');
  });

  it('does not mint ids on content that arrived without them', async () => {
    const ydoc = new Y.Doc();
    const editor = bound(ydoc);
    await tick();
    let localUpdates = 0;
    ydoc.on('update', (_u: Uint8Array, origin: unknown) => { if (origin !== 'remote') localUpdates++; });

    // A plain Y.Doc with a paragraph and no blockId, as an older writer might send.
    const plain = new Y.Doc();
    const p = new Y.XmlElement('paragraph');
    p.insert(0, [new Y.XmlText('bare')]);
    plain.getXmlFragment('default').insert(0, [p]);
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(plain), 'remote');
    await tick();

    expect(editor.getText()).toContain('bare');
    expect(localUpdates).toBe(0);
  });

  it('turns ProseMirror undo off so only Yjs undo runs', () => {
    const editor = bound(new Y.Doc());
    const names = editor.extensionManager.extensions.map((e) => e.name);
    expect(names).toContain('collaboration');
    expect(names).not.toContain('undoRedo');
  });
});
