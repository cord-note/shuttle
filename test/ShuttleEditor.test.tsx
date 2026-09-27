import { describe, it, expect, afterEach } from 'bun:test';
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Editor, JSONContent } from '@tiptap/core';
import { ShuttleEditor, type ShuttleControls, type ShuttleEditorProps } from '../src/ShuttleEditor';
import { createFakeHost } from '../src/testing/fakeHost';
import { sleep } from './helpers';

let root: Root | null = null;
let container: HTMLDivElement | null = null;
afterEach(() => { act(() => root?.unmount()); container?.remove(); root = null; container = null; });

const doc = (text: string): JSONContent => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

interface Harness {
  editor: () => Editor;
  saves: { key: string; doc: JSONContent }[];
  render: (props: Partial<ShuttleEditorProps>) => void;
  host: ReturnType<typeof createFakeHost>;
}

function mount(initial: Partial<ShuttleEditorProps>, options: { strict?: boolean } = {}): Harness {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const saves: Harness['saves'] = [];
  const host = createFakeHost();
  let current: Editor | null = null;
  let props: ShuttleEditorProps = {
    docKey: 'a', doc: doc('one'), mode: 'note', host, saveDebounceMs: 10, toolbar: false,
    onChange: (key, d) => saves.push({ key, doc: d }),
    onReady: (e) => { current = e; },
  };
  const render = (next: Partial<ShuttleEditorProps>) => {
    props = { ...props, ...next };
    const tree = <ShuttleEditor {...props} />;
    act(() => root!.render(options.strict ? <StrictMode>{tree}</StrictMode> : tree));
  };
  render(initial);
  return { editor: () => current!, saves, render, host };
}

describe('ShuttleEditor', () => {
  it('saves after the debounce', async () => {
    const h = mount({});
    act(() => { h.editor().commands.insertContent(' two'); });
    await act(async () => { await sleep(30); });
    expect(h.saves.at(-1)?.key).toBe('a');
    expect(JSON.stringify(h.saves.at(-1)?.doc)).toContain('one two');
  });

  it('flushes the pending edit to the old key when the document changes', () => {
    const h = mount({});
    act(() => { h.editor().commands.insertContent('!'); });
    h.render({ docKey: 'b', doc: doc('bee') });
    expect(h.saves.map((s) => s.key)).toEqual(['a']);
    expect(h.editor().getText()).toBe('bee');
  });

  it('flushes on unmount', () => {
    const h = mount({});
    act(() => { h.editor().commands.insertContent('!'); });
    act(() => root!.unmount());
    root = null;
    expect(h.saves.length).toBe(1);
  });

  it('opens v2 documents read-only and never saves them', async () => {
    const legacy: JSONContent = { type: 'doc', content: [{ type: 'notepadBlock', content: [{ type: 'paragraph' }] }] };
    const h = mount({ docKey: 'old', doc: legacy });
    expect(h.editor().isEditable).toBe(false);
    expect(container!.textContent).toContain('older format');
    expect(h.host.calls.logs.some((l) => l.level === 'warn')).toBe(true);
    act(() => { h.editor().commands.insertContent('x'); });
    await act(async () => { await sleep(30); });
    expect(h.saves).toEqual([]);
  });

  it('shows a legacy document\'s text read-only and never saves it', async () => {
    const legacy: JSONContent = {
      type: 'doc',
      content: [
        { type: 'notepadBlock', attrs: { blockId: 'b1' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First block' }] }] },
        { type: 'notepadBlock', attrs: { blockId: 'b2' }, content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Second block' }] }] },
      ],
    };
    const h = mount({ docKey: 'old', doc: legacy });
    expect(h.editor().isEditable).toBe(false);
    expect(h.editor().getJSON().content?.map((n) => n.type)).toEqual(['paragraph', 'paragraph']);
    expect(h.editor().getText()).toContain('First block');
    expect(h.editor().getText()).toContain('Second block');
    expect(container!.textContent).toContain('First block');
    act(() => { h.editor().commands.insertContent('x'); });
    await act(async () => { await sleep(30); });
    h.render({ docKey: 'b', doc: doc('bee') });
    act(() => root!.unmount());
    root = null;
    expect(h.saves).toEqual([]);
  });

  it('does not save a legacy document when switching away from it', () => {
    const legacy: JSONContent = { type: 'doc', content: [{ type: 'notepadBlock', content: [{ type: 'paragraph' }] }] };
    const h = mount({ docKey: 'old', doc: legacy });
    act(() => { h.editor().commands.insertContent('x'); });
    h.render({ docKey: 'b', doc: doc('bee') });
    expect(h.saves).toEqual([]);
    expect(h.editor().isEditable).toBe(true);
    expect(container!.textContent).not.toContain('older format');
  });

  it('reports added and removed wiki links with the document key', () => {
    const h = mount({});
    act(() => {
      h.editor().commands.insertContent({ type: 'mention', attrs: { id: 'n-alpha', label: 'Alpha', mentionSuggestionChar: '[[' } });
    });
    expect(h.host.calls.linksChanged.at(-1)).toEqual({ docKey: 'a', added: ['n-alpha'], removed: [] });
    act(() => { h.editor().commands.setContent(doc('none'), { emitUpdate: true }); });
    expect(h.host.calls.linksChanged.at(-1)).toEqual({ docKey: 'a', added: [], removed: ['n-alpha'] });
  });

  it('still saves when the host throws from onLinksChanged', async () => {
    const h = mount({});
    const host = createFakeHost();
    host.onLinksChanged = () => { throw new Error('boom'); };
    h.render({ host });
    act(() => {
      h.editor().commands.insertContent({ type: 'mention', attrs: { id: 'n-alpha', label: 'Alpha', mentionSuggestionChar: '[[' } });
    });
    await act(async () => { await sleep(30); });
    expect(JSON.stringify(h.saves.at(-1)?.doc)).toContain('n-alpha');
    expect(host.calls.logs.some((l) => l.level === 'error' && l.message === 'Host call failed')).toBe(true);
  });

  it('keeps typing and saving when the host throws from listNoteTitles', async () => {
    const host = createFakeHost();
    host.listNoteTitles = () => { throw new Error('boom'); };
    const h = mount({ host });
    act(() => { h.editor().chain().focus('end').insertContent(' Alpha').run(); });
    expect(h.editor().getText()).toBe('one Alpha');
    await act(async () => { await sleep(30); });
    expect(JSON.stringify(h.saves.at(-1)?.doc)).toContain('one Alpha');
    expect(host.calls.logs.some((l) => l.level === 'error')).toBe(true);
  });

  it('does not make loading undoable', () => {
    const h = mount({});
    expect(h.editor().can().undo()).toBe(false);
    act(() => { h.editor().commands.insertContent('!'); });
    expect(h.editor().getText()).toBe('one!');
    let undone = false;
    act(() => { undone = h.editor().commands.undo(); });
    expect(undone).toBe(true);
    expect(h.editor().getText()).toBe('one');

    h.render({ docKey: 'b', doc: doc('bee') });
    expect(h.editor().can().undo()).toBe(false);
  });

  it('keeps working after the load resets editor state', () => {
    const h = mount({});
    act(() => { h.editor().chain().focus('end').insertContent(' more').run(); });
    act(() => { h.editor().commands.toggleBold(); });
    act(() => { h.editor().commands.insertContent('x'); });
    expect(h.editor().getText()).toBe('one morex');
    expect(JSON.stringify(h.editor().getJSON())).toContain('bold');
  });

  it("does not bring back the previous note's content on undo after a switch", () => {
    const h = mount({});
    act(() => { h.editor().commands.insertContent(' typed in A'); });
    h.render({ docKey: 'b', doc: doc('bee') });
    // No history from note A survives the switch, not even remapped entries.
    expect(h.editor().can().undo()).toBe(false);
    act(() => { h.editor().commands.undo(); });
    expect(h.editor().getText()).toBe('bee');
  });

  it('saves headings without outline ids', async () => {
    const withHeading: JSONContent = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'body' }] },
      ],
    };
    const h = mount({ doc: withHeading });
    act(() => { h.editor().commands.insertContent('!'); });
    await act(async () => { await sleep(30); });
    const saved = h.saves.at(-1)?.doc;
    const heading = saved?.content?.find((n) => n.type === 'heading');
    expect(heading?.attrs?.['level']).toBe(2);
    expect(typeof heading?.attrs?.['blockId']).toBe('string');
    expect(heading?.attrs).not.toHaveProperty('id');
    expect(heading?.attrs).not.toHaveProperty('data-toc-id');
  });

  it('persists block ids minted on load', async () => {
    const h = mount({ doc: { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'first' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'second' }] },
    ] } });
    act(() => { h.editor().commands.insertContent('!'); });
    await act(async () => { await sleep(30); });
    const blocks = h.saves.at(-1)?.doc.content ?? [];
    expect(blocks.length).toBe(2);
    for (const b of blocks) expect(typeof b.attrs?.['blockId']).toBe('string');
  });

  it('refreshes unlinked mentions when the host changes', () => {
    const h = mount({ doc: doc('Gamma Ray here') });
    expect(container!.querySelectorAll('.unlinked-mention').length).toBe(1);
    h.render({ host: createFakeHost({ notes: [] }) });
    expect(container!.querySelectorAll('.unlinked-mention').length).toBe(0);
  });

  it('does not save anything from the editor StrictMode discards', async () => {
    const h = mount({}, { strict: true });
    await act(async () => { await sleep(50); });
    expect(h.saves).toEqual([]);
    act(() => { h.editor().commands.insertContent('!'); });
    await act(async () => { await sleep(30); });
    expect(h.saves.length).toBe(1);
    expect(h.saves[0]?.key).toBe('a');
    expect(JSON.stringify(h.saves[0]?.doc)).toContain('one!');
  });

  it('keeps unsaved edits when the mode changes', async () => {
    const h = mount({});
    act(() => { h.editor().commands.insertContent('!'); });
    h.render({ mode: 'notepad' });
    expect(h.editor().getText()).toBe('one!');
    act(() => { h.editor().commands.insertContent('?'); });
    await act(async () => { await sleep(30); });
    expect(h.saves.at(-1)?.key).toBe('a');
    expect(JSON.stringify(h.saves.at(-1)?.doc)).toContain('one!?');
  });

  it('logs instead of crashing when saving throws', () => {
    const h = mount({ onChange: () => { throw new Error('disk full'); } });
    act(() => { h.editor().commands.insertContent('!'); });
    h.render({ docKey: 'b', doc: doc('bee') });
    expect(container!.querySelector('.sh-root')).not.toBeNull();
    expect(h.editor().getText()).toBe('bee');
    const error = h.host.calls.logs.find((l) => l.level === 'error');
    expect(error?.message).toBe('Saving the document failed');
    expect(error?.data).toEqual({ docKey: 'a', error: 'Error: disk full' });
  });

  it('switches between legacy and valid documents', async () => {
    const legacy: JSONContent = { type: 'doc', content: [{ type: 'notepadBlock', content: [{ type: 'paragraph' }] }] };
    const h = mount({ docKey: 'old1', doc: legacy });
    expect(h.editor().isEditable).toBe(false);

    h.render({ docKey: 'b', doc: doc('bee') });
    expect(h.editor().isEditable).toBe(true);
    act(() => { h.editor().commands.insertContent('!'); });

    h.render({ docKey: 'old2', doc: legacy });
    expect(h.editor().isEditable).toBe(false);
    expect(container!.textContent).toContain('older format');
    act(() => { h.editor().commands.insertContent('x'); });
    await act(async () => { await sleep(30); });
    expect(h.saves.map((s) => s.key)).toEqual(['b']);
  });

  it('hands hosts controls for its dialogs through onReady', async () => {
    const calls: [Editor | null, ShuttleControls | null][] = [];
    mount({ onReady: (e, c) => { calls.push([e, c]); } });
    const controls = calls.at(-1)?.[1];
    expect(calls.at(-1)?.[0]).toBeTruthy();
    expect(typeof controls?.pickImage).toBe('function');
    act(() => { controls!.openFind(); });
    expect(container!.querySelector('input[placeholder="Find"]')).not.toBeNull();
    act(() => { controls!.openRefPicker(); });
    await act(async () => { await sleep(5); });
    expect(container!.querySelector('.sh-refpicker')).not.toBeNull();
    act(() => root!.unmount());
    root = null;
    expect(calls.at(-1)).toEqual([null, null]);
  });
});
