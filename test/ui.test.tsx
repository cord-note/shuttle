import { describe, it, expect, afterEach } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Editor, JSONContent } from '@tiptap/core';
import { ShuttleEditor, type ShuttleEditorProps } from '../src/ShuttleEditor';
import { createFakeHost } from '../src/testing/fakeHost';
import { MathEditor } from '../src/ui/MathEditor';
import { BlockMenu } from '../src/ui/BlockMenu';
import { makeEditor, sleep } from './helpers';

const roots: Root[] = [];
let root: Root | null = null;
afterEach(() => {
  act(() => { root?.unmount(); for (const r of roots) r.unmount(); });
  root = null;
  roots.length = 0;
  document.body.innerHTML = '';
});

function mount(mode: 'note' | 'notepad') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  let editor: Editor | null = null;
  const host = createFakeHost({
    blocks: [{ id: 'b1', noteId: 'n-beta', type: 'paragraph', text: 'beta block', level: null }],
  });
  const base: ShuttleEditorProps = {
    docKey: 'n-self', doc: null, mode, host, onChange: () => {}, onReady: (e) => { editor = e; },
  };
  const render = (next: Partial<ShuttleEditorProps> = {}): void => {
    act(() => root!.render(<ShuttleEditor {...base} {...next} />));
  };
  render();
  return { container, editor: () => editor!, host, render };
}

/** Render a standalone component into its own root. */
function renderAlone(node: React.ReactElement): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const r = createRoot(container);
  roots.push(r);
  act(() => r.render(node));
  return container;
}

const buttonByText = (container: ParentNode, text: string): HTMLButtonElement =>
  [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement;

const count = (doc: JSONContent, type: string): number =>
  (doc.type === type ? 1 : 0) + (doc.content ?? []).reduce((n, c) => n + count(c, type), 0);

describe('ui', () => {
  it('toolbar toggles bold', () => {
    const { container, editor } = mount('note');
    act(() => { editor().commands.insertContent('word'); editor().commands.selectAll(); });
    const bold = container.querySelector('button[title^="Bold"]') as HTMLButtonElement;
    act(() => { bold.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(editor().isActive('bold')).toBe(true);
  });

  it('toolbar inline math button inserts an inlineMath node and opens the editor on it', () => {
    const { container, editor } = mount('note');
    act(() => { editor().commands.insertContent('ab'); });
    const btn = container.querySelector('button[title="Math (inline)"]') as HTMLButtonElement;
    act(() => { btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(count(editor().getJSON(), 'inlineMath')).toBe(1);
    expect(container.querySelector('[aria-label="Edit formula"]')).toBeTruthy();
    // Cancelling the untouched formula removes it again.
    act(() => { buttonByText(container, 'Cancel').click(); });
    expect(count(editor().getJSON(), 'inlineMath')).toBe(0);
    expect(editor().getText()).toBe('ab');
  });

  it('toolbar inline math replaces a selected range', () => {
    const { container, editor } = mount('note');
    act(() => { editor().commands.insertContent('abcd'); editor().commands.setTextSelection({ from: 2, to: 4 }); });
    const btn = container.querySelector('button[title="Math (inline)"]') as HTMLButtonElement;
    act(() => { btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(count(editor().getJSON(), 'inlineMath')).toBe(1);
    const input = container.querySelector('.sh-math-input') as HTMLTextAreaElement;
    expect(input).toBeTruthy();
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(input, 'x');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => { buttonByText(container, 'Save').click(); });
    expect(JSON.stringify(editor().getJSON())).toContain('"latex":"x"');
  });

  it('find bar opens with Mod+F and highlights matches', async () => {
    const { container, editor } = mount('note');
    act(() => { editor().commands.insertContent('apple banana apple'); });
    act(() => {
      editor().view.someProp('handleKeyDown', (f) => f(editor().view, new KeyboardEvent('keydown', { key: 'f', ctrlKey: true })));
    });
    const input = container.querySelector('input[placeholder="Find"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    act(() => { editor().commands.setSearchTerm('apple'); });
    await act(async () => { await sleep(5); });
    expect(editor().storage.findAndReplace.results.length).toBe(2);
  });

  it('ref picker lists notes, then blocks, then inserts a reference', async () => {
    const { container, editor, host } = mount('notepad');
    host.keybindings = { 'block.insertRef': 'Mod+Shift+R' };
    act(() => {
      editor().view.someProp('handleKeyDown', (f) => f(editor().view, new KeyboardEvent('keydown', { key: 'r', ctrlKey: true, shiftKey: true })));
    });
    await act(async () => { await sleep(5); });
    const betaRow = [...container.querySelectorAll('.sh-refpicker-row')].find((b) => b.textContent?.includes('Beta')) as HTMLButtonElement;
    act(() => { betaRow.click(); });
    await act(async () => { await sleep(5); });
    const blockRow = container.querySelector('.sh-refpicker-row') as HTMLButtonElement;
    expect(blockRow.textContent).toContain('beta block');
    act(() => { blockRow.click(); });
    expect(JSON.stringify(editor().getJSON())).toContain('"refBlockId":"b1"');
  });

  describe('MathEditor', () => {
    const setup = (latex: string) => {
      const { editor } = makeEditor({ content: '<p>after</p>' });
      editor.commands.insertContentAt(0, { type: 'blockMath', attrs: { latex } });
      expect(editor.state.doc.nodeAt(0)?.type.name).toBe('blockMath');
      let closed = 0;
      const container = renderAlone(
        <MathEditor editor={editor} request={{ kind: 'block', latex, pos: 0 }} onClose={() => { closed += 1; }} />,
      );
      return { editor, container, closed: () => closed };
    };

    it('cancel deletes a formula that is still empty', () => {
      const { editor, container, closed } = setup('');
      act(() => { buttonByText(container, 'Cancel').click(); });
      expect(count(editor.getJSON(), 'blockMath')).toBe(0);
      expect(closed()).toBe(1);
    });

    it('escape deletes a formula that is still empty', () => {
      const { editor, container } = setup('');
      const input = container.querySelector('textarea') as HTMLTextAreaElement;
      act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
      expect(count(editor.getJSON(), 'blockMath')).toBe(0);
    });

    it('cancel leaves a non-empty formula unchanged', () => {
      const { editor, container } = setup('x');
      act(() => { buttonByText(container, 'Cancel').click(); });
      expect(editor.state.doc.nodeAt(0)?.attrs['latex']).toBe('x');
    });

    it('save writes the new latex, even over an empty formula', () => {
      const { editor, container } = setup('');
      const input = container.querySelector('textarea') as HTMLTextAreaElement;
      act(() => {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
        setter.call(input, 'E=mc^2');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      act(() => { buttonByText(container, 'Save').click(); });
      expect(editor.state.doc.nodeAt(0)?.attrs['latex']).toBe('E=mc^2');
    });

    it('save with empty input deletes the formula', () => {
      const { editor, container } = setup('x');
      const input = container.querySelector('textarea') as HTMLTextAreaElement;
      act(() => {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
        setter.call(input, '  ');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      act(() => { buttonByText(container, 'Save').click(); });
      expect(count(editor.getJSON(), 'blockMath')).toBe(0);
    });
  });

  describe('BlockMenu', () => {
    const setup = () => {
      const made = makeEditor({
        mode: 'notepad',
        content: {
          type: 'doc',
          content: [
            { type: 'paragraph', attrs: { blockId: 'p1' }, content: [{ type: 'text', text: 'first' }] },
            { type: 'paragraph', attrs: { blockId: 'p2' }, content: [{ type: 'text', text: 'second' }] },
          ],
        },
      });
      let closed = 0;
      const container = renderAlone(
        <BlockMenu editor={made.editor} ctx={made.ctx} pos={0} top={0} left={0} onClose={() => { closed += 1; }} />,
      );
      return { ...made, container, closed: () => closed };
    };

    it('duplicates the block', () => {
      const { editor, container, closed } = setup();
      act(() => { buttonByText(container, 'Duplicate').click(); });
      const texts: string[] = [];
      editor.state.doc.forEach((n) => { texts.push(n.textContent); });
      expect(texts).toEqual(['first', 'first', 'second']);
      expect(closed()).toBe(1);
    });

    it('asks the host to tag the block, with the doc key', () => {
      const { container, host } = setup();
      act(() => { buttonByText(container, 'Tag block').click(); });
      expect(host.calls.fragmentActions).toEqual([{ docKey: 'n-self', type: 'tag', blockId: 'p1' }]);
    });

    it('moves the block down', () => {
      const { editor, container } = setup();
      act(() => { buttonByText(container, 'Move down').click(); });
      const texts: string[] = [];
      editor.state.doc.forEach((n) => { texts.push(n.textContent); });
      expect(texts).toEqual(['second', 'first']);
    });

    it('turns the block into a heading', () => {
      const { editor, container } = setup();
      act(() => { buttonByText(container, 'Turn into').click(); });
      act(() => { buttonByText(container, 'Heading 2').click(); });
      const first = editor.getJSON().content?.[0];
      expect(first?.type).toBe('heading');
      expect(first?.attrs?.['level']).toBe(2);
      expect(first?.attrs?.['blockId']).toBe('p1');
    });
  });

  it('notepad mode survives document switches', () => {
    const { editor, render } = mount('notepad');
    const docOf = (text: string): JSONContent => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
    expect(() => {
      render({ docKey: 'n-2', doc: docOf('two') });
      render({ docKey: 'n-3', doc: docOf('three') });
    }).not.toThrow();
    expect(editor().getText()).toBe('three');
  });

  it('outline lists headings when enabled', async () => {
    const { container, render } = mount('note');
    render({
      outline: true,
      docKey: 'n-h',
      doc: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'One' }] },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Two' }] },
        ],
      },
    });
    await act(async () => { await sleep(5); });
    const items = [...container.querySelectorAll('.sh-outline-item')].map((b) => b.textContent);
    expect(items).toEqual(['One', 'Two']);
  });
});
