import { describe, it, expect, afterEach } from 'bun:test';
import type { Editor } from '@tiptap/core';
import { makeEditor } from './helpers';

let editor: Editor | null = null;
afterEach(() => { editor?.destroy(); editor = null; });

const mathDom = (e: Editor): HTMLElement => {
  const el = e.view.dom.querySelector('[data-type="block-math"]');
  if (!(el instanceof HTMLElement)) throw new Error('no block math rendered');
  return el;
};

describe('block math alignment', () => {
  it('defaults to centre', () => {
    ({ editor } = makeEditor({ content: { type: 'doc', content: [{ type: 'blockMath', attrs: { latex: 'x' } }] } }));
    expect(editor.state.doc.firstChild?.attrs['align']).toBe('center');
    expect(mathDom(editor).dataset['align']).toBe('center');
  });

  it('setBlockMathAlign flips the attribute and the rendered block', () => {
    ({ editor } = makeEditor({ content: { type: 'doc', content: [{ type: 'blockMath', attrs: { latex: 'x' } }] } }));
    expect(editor.commands.setBlockMathAlign(0, 'left')).toBe(true);
    expect(editor.state.doc.firstChild?.attrs['align']).toBe('left');
    expect(mathDom(editor).dataset['align']).toBe('left');
    expect(editor.getJSON().content?.[0]?.attrs?.['align']).toBe('left');
    expect(editor.commands.setBlockMathAlign(0, 'center')).toBe(true);
    expect(mathDom(editor).dataset['align']).toBe('center');
  });

  it('refuses a position that is not block math', () => {
    ({ editor } = makeEditor({ content: '<p>a</p>' }));
    expect(editor.commands.setBlockMathAlign(0, 'left')).toBe(false);
  });

  it('keeps the alignment through HTML', () => {
    ({ editor } = makeEditor({ content: { type: 'doc', content: [{ type: 'blockMath', attrs: { latex: 'x', align: 'left' } }] } }));
    const html = editor.getHTML();
    expect(html).toContain('data-align="left"');
    const { editor: other } = makeEditor({ content: html });
    expect(other.state.doc.firstChild?.attrs['align']).toBe('left');
    other.destroy();
  });

  it('renders block math in KaTeX display mode', () => {
    // happy-dom documents are in quirks mode, where KaTeX refuses to render,
    // so this checks the configuration rather than the rendered output.
    ({ editor } = makeEditor());
    const ext = editor.extensionManager.extensions.find((x) => x.name === 'blockMath');
    const options = ext?.options as { katexOptions?: { displayMode?: boolean } } | undefined;
    expect(options?.katexOptions?.displayMode).toBe(true);
  });
});
