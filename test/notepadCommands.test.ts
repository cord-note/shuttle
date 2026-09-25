import { describe, it, expect, afterEach } from 'bun:test';
import { Editor, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import UniqueID from '@tiptap/extension-unique-id';
import { BlockCommands } from '../src/custom/notepad/commands';
import { topLevelAt, blockIdAt } from '../src/doc/topLevel';

let editor: Editor | null = null;
afterEach(() => { editor?.destroy(); editor = null; });

const p = (text: string, blockId: string): JSONContent => ({
  type: 'paragraph', attrs: { blockId }, content: [{ type: 'text', text }],
});

function make(content: JSONContent[]): Editor {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit, TaskList, TaskItem,
      UniqueID.configure({ attributeName: 'blockId', types: ['paragraph', 'heading', 'bulletList', 'taskList', 'blockquote'] }),
      BlockCommands,
    ],
    content: { type: 'doc', content },
  });
  return editor;
}

const texts = (e: Editor): string[] => {
  const out: string[] = [];
  e.state.doc.forEach((n) => out.push(n.textContent));
  return out;
};
const ids = (e: Editor): string[] => {
  const out: string[] = [];
  e.state.doc.forEach((n) => out.push(n.attrs['blockId'] as string));
  return out;
};

describe('topLevelAt', () => {
  it('finds the top-level node around a position', () => {
    const e = make([p('one', 'a'), p('two', 'b')]);
    expect(topLevelAt(e.state.doc, 7)?.index).toBe(1);
    expect(blockIdAt(e.state, 2)).toBe('a');
  });
});

describe('block commands', () => {
  it('moves a block down and up', () => {
    const e = make([p('one', 'a'), p('two', 'b'), p('three', 'c')]);
    expect(e.commands.moveBlock(2, 1)).toBe(true);
    expect(texts(e).slice(0, 3)).toEqual(['two', 'one', 'three']);
    // "one" is now the second block (positions 5–10); move it back up.
    expect(e.commands.moveBlock(7, -1)).toBe(true);
    expect(texts(e).slice(0, 3)).toEqual(['one', 'two', 'three']);
  });

  it('refuses to move past the ends', () => {
    const e = make([p('one', 'a'), p('two', 'b')]);
    expect(e.commands.moveBlock(2, -1)).toBe(false);
  });

  it('duplicates with a fresh id', () => {
    const e = make([p('one', 'a')]);
    e.commands.duplicateBlock(2);
    expect(texts(e).slice(0, 2)).toEqual(['one', 'one']);
    const [first, second] = ids(e);
    expect(first).toBe('a');
    expect(second).toBeTruthy();
    expect(second).not.toBe('a');
  });

  it('deletes a block but never empties the document', () => {
    const e = make([p('one', 'a'), p('two', 'b')]);
    e.commands.deleteBlock(2);
    expect(texts(e)[0]).toBe('two');
    e.commands.deleteBlock(2);
    expect(e.state.doc.childCount).toBeGreaterThanOrEqual(1);
    expect(e.state.doc.firstChild?.type.name).toBe('paragraph');
  });

  it('turns a paragraph into a heading and a list, and back', () => {
    const e = make([p('hello', 'a')]);
    e.commands.turnInto(2, 'heading', 2);
    expect(e.state.doc.firstChild?.type.name).toBe('heading');
    expect(e.state.doc.firstChild?.attrs['level']).toBe(2);
    e.commands.turnInto(2, 'bulletList');
    expect(e.state.doc.firstChild?.type.name).toBe('bulletList');
    e.commands.turnInto(2, 'paragraph');
    expect(e.state.doc.firstChild?.type.name).toBe('paragraph');
    expect(e.state.doc.firstChild?.textContent).toBe('hello');
  });

  it('keeps ids unique after a split', () => {
    const e = make([p('hello world', 'a')]);
    e.commands.setTextSelection(6);
    e.commands.splitBlock();
    const all = ids(e);
    expect(new Set(all).size).toBe(all.length);
  });
});
