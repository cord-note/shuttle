import { describe, it, expect, afterEach } from 'bun:test';
import './domSetup';
import { Editor, Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Block, NotepadDocument } from '../Block';
import { BlockNormalizer } from '../BlockNormalizer';
import { SlashCommand, slashCommandPluginKey } from '../SlashCommand';

// The `＋` gutter button inserts a "/" programmatically rather than simulating a
// keystroke. Suggestion menus that key off text-input events would never open
// that way, so this asserts the menu genuinely activates.

const MathBlockStub = Node.create({ name: 'mathBlock', group: 'block', atom: true, renderHTML: () => ['div', {}] });
const BlockRefStub = Node.create({ name: 'blockRef', group: 'block', atom: true, renderHTML: () => ['div', {}] });

let editor: Editor | null = null;
afterEach(() => { editor?.destroy(); editor = null; });

function notepad(): Editor {
  editor = new Editor({
    extensions: [
      StarterKit.configure({ document: false }),
      NotepadDocument, Block, BlockNormalizer,
      TaskList, TaskItem, MathBlockStub, BlockRefStub,
      SlashCommand.configure({ mode: 'notepad' }),
    ],
    content: {
      type: 'doc',
      content: [{ type: 'notepadBlock', attrs: { blockId: 'b1' }, content: [{ type: 'paragraph' }] }],
    },
  });
  return editor;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const suggestion = (e: Editor): any => slashCommandPluginKey.getState(e.state);

describe('slash menu', () => {
  it('opens when a "/" is inserted programmatically, as the ＋ button does', () => {
    const e = notepad();
    e.commands.focus();
    e.commands.insertContent('/');
    expect(suggestion(e)?.active).toBe(true);
  });

  it('opens for a typed "/" too', () => {
    const e = notepad();
    e.commands.focus();
    const { from } = e.state.selection;
    e.view.dispatch(e.state.tr.insertText('/', from));
    expect(suggestion(e)?.active).toBe(true);
  });

  it('narrows as the query is typed', () => {
    const e = notepad();
    e.commands.focus();
    e.commands.insertContent('/head');
    expect(suggestion(e)?.query).toBe('head');
  });

  it('closes once the "/" is removed', () => {
    const e = notepad();
    e.commands.focus();
    e.commands.insertContent('/');
    expect(suggestion(e)?.active).toBe(true);

    const { from } = e.state.selection;
    e.view.dispatch(e.state.tr.delete(from - 1, from));
    expect(suggestion(e)?.active).toBe(false);
  });
});
