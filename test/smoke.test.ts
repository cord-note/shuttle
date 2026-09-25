import { describe, it, expect } from 'bun:test';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

describe('toolchain', () => {
  it('builds a Tiptap 3 editor under bun + happy-dom', () => {
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: [StarterKit],
      content: '<p>hello</p>',
    });
    expect(editor.getText()).toBe('hello');
    editor.destroy();
  });
});
