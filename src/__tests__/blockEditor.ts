import './domSetup';
import { Editor, Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Block, NotepadDocument } from '../Block';
import { BlockNormalizer } from '../BlockNormalizer';

// Stubs for the two node types whose real extensions pull in React views and CSS
// modules. `block`'s content expression names them, and ProseMirror refuses to
// build a schema referencing an unknown node type — but nothing here depends on
// how they render.
const MathBlockStub = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  addAttributes() {
    return { latex: { default: '' } };
  },
  renderHTML() {
    return ['div', { 'data-math-block': '' }];
  },
});

const BlockRefStub = Node.create({
  name: 'blockRef',
  group: 'block',
  atom: true,
  addAttributes() {
    return { refBlockId: { default: null }, refNoteId: { default: null } };
  },
  renderHTML() {
    return ['div', { 'data-block-ref': '' }];
  },
});

export interface JsonNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: JsonNode[];
  text?: string;
}

export const para = (text?: string): JsonNode => ({
  type: 'paragraph',
  ...(text ? { content: [{ type: 'text', text }] } : {}),
});

export const heading = (level: number, text: string): JsonNode => ({
  type: 'heading',
  attrs: { level },
  content: [{ type: 'text', text }],
});

export const block = (inner: JsonNode, blockId?: string): JsonNode => ({
  type: 'notepadBlock',
  ...(blockId ? { attrs: { blockId } } : {}),
  content: [inner],
});

export const bullets = (...items: string[]): JsonNode => ({
  type: 'bulletList',
  content: items.map((t) => ({ type: 'listItem', content: [para(t)] })),
});

/** A notepad editor over the given blocks, with the normalizer active. */
export function makeNotepad(...content: JsonNode[]): Editor {
  return new Editor({
    extensions: [
      StarterKit.configure({ document: false }),
      NotepadDocument,
      Block,
      BlockNormalizer,
      TaskList,
      TaskItem,
      MathBlockStub,
      BlockRefStub,
    ],
    content: { type: 'doc', content: content.length > 0 ? content : [block(para())] },
  });
}

/** Top-level block content types, in order. */
export function blockTypes(editor: Editor): string[] {
  const types: string[] = [];
  editor.state.doc.forEach((node) => types.push(node.firstChild?.type.name ?? '(empty)'));
  return types;
}

/** Text of each top-level block, in order. */
export function blockTexts(editor: Editor): string[] {
  const texts: string[] = [];
  editor.state.doc.forEach((node) => texts.push(node.textContent));
  return texts;
}

export function blockIds(editor: Editor): (string | null)[] {
  const ids: (string | null)[] = [];
  editor.state.doc.forEach((node) => ids.push(node.attrs['blockId'] as string | null));
  return ids;
}

/** A position inside the nth top-level block. */
export function posInBlock(editor: Editor, index: number): number {
  let pos = 0;
  let found = 0;
  editor.state.doc.forEach((node, offset, i) => {
    if (i === index) { pos = offset + 1; found++; }
  });
  if (found === 0) throw new Error(`no block at index ${index}`);
  return pos;
}

/**
 * Start of the nth block's content.
 *
 * posInBlock lands just inside the wrapper, which is *before* the content node's
 * opening token — the text inside it starts one position further in.
 */
export function contentStart(editor: Editor, index: number): number {
  return posInBlock(editor, index) + 1;
}

/** Put the caret at the end of the nth block's content. */
export function caretAtEndOf(editor: Editor, index: number): void {
  const node = editor.state.doc.child(index);
  editor.commands.setTextSelection(
    contentStart(editor, index) + (node.firstChild?.content.size ?? 0),
  );
}

/** Put the caret at the start of the nth block's content. */
export function caretAtStartOf(editor: Editor, index: number): void {
  editor.commands.setTextSelection(contentStart(editor, index));
}

/**
 * Press a key, routing through the editor's real keymap handlers.
 *
 * Constructs a KeyboardEvent and hands it to ProseMirror's handleKeyDown, which
 * is how the block keymap is reached — calling the commands directly would skip
 * exactly the code under test.
 */
export function press(editor: Editor, key: string, mods: { alt?: boolean; ctrl?: boolean; shift?: boolean } = {}): boolean {
  const event = new KeyboardEvent('keydown', {
    key,
    altKey: mods.alt ?? false,
    ctrlKey: mods.ctrl ?? false,
    shiftKey: mods.shift ?? false,
    bubbles: true,
  });
  return editor.view.someProp('handleKeyDown', (f) => f(editor.view, event)) ?? false;
}

/**
 * Type text one character at a time through handleTextInput, so markdown input
 * rules fire the way they do for a real keystroke. insertContent would bypass
 * them entirely.
 */
export function type(editor: Editor, text: string): void {
  for (const char of text) {
    const { from, to } = editor.state.selection;
    // The 5th argument is ProseMirror's "what would have happened" fallback,
    // which input rules receive but none of ours use.
    const deflt = () => editor.state.tr.insertText(char, from, to);
    const handled = editor.view.someProp('handleTextInput', (f) =>
      f(editor.view, from, to, char, deflt),
    );
    if (!handled) editor.view.dispatch(deflt());
  }
}
