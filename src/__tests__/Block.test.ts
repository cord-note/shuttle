import { describe, it, expect, afterEach } from 'bun:test';
import type { Editor } from '@tiptap/core';
import {
  makeNotepad, block, para, heading, bullets,
  blockTypes, blockTexts, blockIds, posInBlock, contentStart,
  caretAtEndOf, caretAtStartOf, press, type,
} from './blockEditor';

// Run with `bun test`. Needs a DOM (see domSetup) because the block keymap can
// only be reached through a real EditorView.
//
// Enter and Backspace are custom here out of necessity, not preference: the
// defaults would split or join a wrapper into holding two content nodes, which
// `block`'s content spec forbids — so ProseMirror refuses and the key silently
// does nothing. These tests exist to catch that failure mode returning.

let editor: Editor | null = null;

function notepad(...content: Parameters<typeof makeNotepad>): Editor {
  editor = makeNotepad(...content);
  return editor;
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

/** The trailing empty block the normalizer maintains. */
const TRAILING = '';

describe('Enter', () => {
  it('creates a new empty block at the end of a paragraph', () => {
    const e = notepad(block(para('first'), 'b1'));
    caretAtEndOf(e, 0);
    expect(press(e, 'Enter')).toBe(true);

    expect(blockTexts(e)).toEqual(['first', TRAILING]);
    expect(blockTypes(e)).toEqual(['paragraph', 'paragraph']);
  });

  it('leaves the caret in the new block', () => {
    const e = notepad(block(para('first'), 'b1'));
    caretAtEndOf(e, 0);
    press(e, 'Enter');
    type(e, 'second');
    expect(blockTexts(e)[1]).toBe('second');
  });

  it('splits a paragraph into two blocks when pressed mid-text', () => {
    const e = notepad(block(para('onetwo'), 'b1'));
    e.commands.setTextSelection(contentStart(e, 0) + 3);
    expect(press(e, 'Enter')).toBe(true);
    expect(blockTexts(e)).toEqual(['one', 'two', TRAILING]);
  });

  it('gives the split-off half its own id', () => {
    const e = notepad(block(para('onetwo'), 'b1'));
    e.commands.setTextSelection(contentStart(e, 0) + 3);
    press(e, 'Enter');

    const ids = blockIds(e);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => typeof id === 'string' && id!.length > 0)).toBe(true);
  });

  it('starts a paragraph after a heading, not another heading', () => {
    // Otherwise every Enter after a title produces another title.
    const e = notepad(block(heading(1, 'Title'), 'b1'));
    caretAtEndOf(e, 0);
    press(e, 'Enter');
    expect(blockTypes(e)).toEqual(['heading', 'paragraph']);
  });

  it('stays inside one block when pressed in a list', () => {
    // The list's own Enter handling makes a new item; the block must not split.
    const e = notepad(block(bullets('one'), 'b1'));
    const listEnd = contentStart(e, 0) + e.state.doc.child(0).firstChild!.content.size;
    e.commands.setTextSelection(listEnd);
    press(e, 'Enter');

    expect(e.state.doc.child(0).firstChild!.type.name).toBe('bulletList');
    expect(e.state.doc.child(0).firstChild!.childCount).toBe(2);
  });

  it('does not split a code block', () => {
    // Enter inside code inserts a newline rather than leaving the block.
    const e = notepad(block({ type: 'codeBlock', content: [{ type: 'text', text: 'x = 1' }] }, 'b1'));
    caretAtEndOf(e, 0);
    press(e, 'Enter');
    expect(blockTypes(e)[0]).toBe('codeBlock');
    expect(e.state.doc.child(0).firstChild!.type.name).toBe('codeBlock');
  });
});

describe('Backspace', () => {
  it('merges a block into the one above', () => {
    const e = notepad(block(para('one'), 'b1'), block(para('two'), 'b2'));
    caretAtStartOf(e, 1);
    expect(press(e, 'Backspace')).toBe(true);
    expect(blockTexts(e)).toEqual(['onetwo', TRAILING]);
  });

  it('produces a single well-formed block when merging', () => {
    const e = notepad(block(para('one'), 'b1'), block(para('two'), 'b2'));
    caretAtStartOf(e, 1);
    press(e, 'Backspace');
    // The merged wrapper must still hold exactly one content node.
    expect(e.state.doc.child(0).childCount).toBe(1);
    expect(() => e.state.doc.check()).not.toThrow();
  });

  it('keeps the id of the block merged into', () => {
    const e = notepad(block(para('one'), 'b1'), block(para('two'), 'b2'));
    caretAtStartOf(e, 1);
    press(e, 'Backspace');
    expect(blockIds(e)[0]).toBe('b1');
  });

  it('does nothing at the start of the first block', () => {
    const e = notepad(block(para('only'), 'b1'));
    caretAtStartOf(e, 0);
    expect(press(e, 'Backspace')).toBe(false);
    expect(blockTexts(e)[0]).toBe('only');
  });

  it('selects an atom above rather than merging into it', () => {
    // A divider has no text to merge into, so a first Backspace selects it and a
    // second deletes it. The document itself must not change on that first press.
    const e = notepad(block({ type: 'horizontalRule' }, 'b1'), block(para('after'), 'b2'));
    caretAtStartOf(e, 1);
    expect(press(e, 'Backspace')).toBe(true);

    expect(e.state.selection.constructor.name).toBe('NodeSelection');
    expect(blockTexts(e)).toEqual(['', 'after']);
    expect(blockTypes(e)).toEqual(['horizontalRule', 'paragraph']);
  });

  it('leaves a mid-text Backspace to the default handler', () => {
    const e = notepad(block(para('abc'), 'b1'));
    e.commands.setTextSelection(contentStart(e, 0) + 2);
    expect(press(e, 'Backspace')).toBe(false);
  });
});

describe('moveBlock', () => {
  it('moves a block up', () => {
    const e = notepad(block(para('one'), 'b1'), block(para('two'), 'b2'));
    e.commands.moveBlock(posInBlock(e, 1), -1);
    expect(blockTexts(e).slice(0, 2)).toEqual(['two', 'one']);
  });

  it('moves a block down', () => {
    // Downward moves are where the offset maths goes wrong if the insertion
    // point is not mapped through the deletion.
    const e = notepad(block(para('one'), 'b1'), block(para('two'), 'b2'), block(para('three'), 'b3'));
    e.commands.moveBlock(posInBlock(e, 0), 1);
    expect(blockTexts(e).slice(0, 3)).toEqual(['two', 'one', 'three']);
  });

  it('moves a block down by more than one position', () => {
    const e = notepad(block(para('a'), 'b1'), block(para('b'), 'b2'), block(para('c'), 'b3'));
    e.commands.moveBlock(posInBlock(e, 0), 2);
    expect(blockTexts(e).slice(0, 3)).toEqual(['b', 'c', 'a']);
  });

  it('carries the block id with the block', () => {
    const e = notepad(block(para('one'), 'b1'), block(para('two'), 'b2'));
    e.commands.moveBlock(posInBlock(e, 1), -1);
    expect(blockIds(e).slice(0, 2)).toEqual(['b2', 'b1']);
  });

  it('moves a whole list as one unit', () => {
    const e = notepad(block(para('before'), 'b1'), block(bullets('x', 'y'), 'b2'));
    e.commands.moveBlock(posInBlock(e, 1), -1);
    expect(blockTypes(e).slice(0, 2)).toEqual(['bulletList', 'paragraph']);
    expect(e.state.doc.child(0).firstChild!.childCount).toBe(2);
  });

  it('refuses to move past the start', () => {
    const e = notepad(block(para('one'), 'b1'), block(para('two'), 'b2'));
    expect(e.commands.moveBlock(posInBlock(e, 0), -1)).toBe(false);
    expect(blockTexts(e).slice(0, 2)).toEqual(['one', 'two']);
  });

  it('refuses to move past the end', () => {
    const e = notepad(block(para('one'), 'b1'));
    const last = e.state.doc.childCount - 1;
    expect(e.commands.moveBlock(posInBlock(e, last), 1)).toBe(false);
  });

  it('keeps the document valid', () => {
    const e = notepad(block(para('a'), 'b1'), block(heading(2, 'b'), 'b2'), block(bullets('c'), 'b3'));
    e.commands.moveBlock(posInBlock(e, 2), -2);
    expect(() => e.state.doc.check()).not.toThrow();
  });
});

describe('duplicateBlock', () => {
  it('inserts a copy directly below', () => {
    const e = notepad(block(para('copy me'), 'b1'));
    e.commands.duplicateBlock(posInBlock(e, 0));
    expect(blockTexts(e).slice(0, 2)).toEqual(['copy me', 'copy me']);
  });

  it('gives the copy a fresh id', () => {
    // Two blocks sharing an id would collide in the index and share fragment tags.
    const e = notepad(block(para('copy me'), 'b1'));
    e.commands.duplicateBlock(posInBlock(e, 0));

    const ids = blockIds(e);
    expect(ids[1]).not.toBe('b1');
    expect(ids[1]).toBeTruthy();
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('duplicates a whole list', () => {
    const e = notepad(block(bullets('x', 'y'), 'b1'));
    e.commands.duplicateBlock(posInBlock(e, 0));
    expect(blockTypes(e).slice(0, 2)).toEqual(['bulletList', 'bulletList']);
    expect(e.state.doc.child(1).firstChild!.childCount).toBe(2);
  });
});

describe('deleteBlock', () => {
  it('removes the block', () => {
    const e = notepad(block(para('one'), 'b1'), block(para('two'), 'b2'));
    e.commands.deleteBlock(posInBlock(e, 0));
    expect(blockTexts(e)).not.toContain('one');
    expect(blockTexts(e)).toContain('two');
  });

  it('leaves an empty block behind when deleting the only one', () => {
    // `doc → block+` cannot be satisfied by an empty document.
    const e = notepad(block(para('only'), 'b1'));
    e.commands.deleteBlock(posInBlock(e, 0));
    expect(e.state.doc.childCount).toBeGreaterThanOrEqual(1);
    expect(blockTexts(e).join('')).toBe('');
    expect(() => e.state.doc.check()).not.toThrow();
  });
});

describe('turnBlockInto', () => {
  it('carries text from a paragraph to a heading', () => {
    const e = notepad(block(para('Title text'), 'b1'));
    e.commands.turnBlockInto(posInBlock(e, 0), 'heading', { level: 2 });

    expect(blockTypes(e)[0]).toBe('heading');
    expect(blockTexts(e)[0]).toBe('Title text');
    expect(e.state.doc.child(0).firstChild!.attrs['level']).toBe(2);
  });

  it('keeps the block id through a conversion', () => {
    // Fragment tags and links are keyed by it, so retyping must not detach them.
    const e = notepad(block(para('text'), 'b1'));
    e.commands.turnBlockInto(posInBlock(e, 0), 'heading', { level: 1 });
    expect(blockIds(e)[0]).toBe('b1');
  });

  it('turns a paragraph into a one-item list', () => {
    const e = notepad(block(para('single'), 'b1'));
    e.commands.turnBlockInto(posInBlock(e, 0), 'bulletList');

    expect(blockTypes(e)[0]).toBe('bulletList');
    expect(e.state.doc.child(0).firstChild!.childCount).toBe(1);
    expect(blockTexts(e)[0]).toBe('single');
  });

  it('uses taskItem for a task list', () => {
    const e = notepad(block(para('todo'), 'b1'));
    e.commands.turnBlockInto(posInBlock(e, 0), 'taskList');

    const list = e.state.doc.child(0).firstChild!;
    expect(list.type.name).toBe('taskList');
    expect(list.firstChild!.type.name).toBe('taskItem');
    expect(list.firstChild!.attrs['checked']).toBe(false);
  });

  it('wraps the existing node for a blockquote', () => {
    const e = notepad(block(para('quoted'), 'b1'));
    e.commands.turnBlockInto(posInBlock(e, 0), 'blockquote');

    const quote = e.state.doc.child(0).firstChild!;
    expect(quote.type.name).toBe('blockquote');
    expect(quote.firstChild!.type.name).toBe('paragraph');
    expect(blockTexts(e)[0]).toBe('quoted');
  });

  it('converts a heading back to a paragraph', () => {
    const e = notepad(block(heading(1, 'was a heading'), 'b1'));
    e.commands.turnBlockInto(posInBlock(e, 0), 'paragraph');
    expect(blockTypes(e)[0]).toBe('paragraph');
    expect(blockTexts(e)[0]).toBe('was a heading');
  });

  it('discards text when the target cannot hold any', () => {
    const e = notepad(block(para('gone'), 'b1'));
    e.commands.turnBlockInto(posInBlock(e, 0), 'horizontalRule');
    expect(blockTypes(e)[0]).toBe('horizontalRule');
    expect(blockTexts(e)[0]).toBe('');
  });

  it('refuses to convert to the type it already is', () => {
    const e = notepad(block(para('text'), 'b1'));
    expect(e.commands.turnBlockInto(posInBlock(e, 0), 'paragraph')).toBe(false);
  });

  it('refuses an unknown node type', () => {
    const e = notepad(block(para('text'), 'b1'));
    expect(e.commands.turnBlockInto(posInBlock(e, 0), 'notARealNode')).toBe(false);
  });

  it('keeps the document valid across a chain of conversions', () => {
    const e = notepad(block(para('text'), 'b1'));
    for (const t of ['heading', 'bulletList', 'blockquote', 'codeBlock', 'paragraph']) {
      e.commands.turnBlockInto(posInBlock(e, 0), t, t === 'heading' ? { level: 3 } : undefined);
      expect(() => e.state.doc.check()).not.toThrow();
    }
  });
});

describe('replaceBlockWith', () => {
  it('replaces one block with several', () => {
    // How templates land: one wrapper per node, deterministically.
    const e = notepad(block(para(), 'b1'));
    e.commands.replaceBlockWith(posInBlock(e, 0), [
      heading(1, 'Lesson'),
      heading(2, 'Objectives'),
      para('notes'),
    ]);

    expect(blockTypes(e).slice(0, 3)).toEqual(['heading', 'heading', 'paragraph']);
    expect(blockTexts(e).slice(0, 3)).toEqual(['Lesson', 'Objectives', 'notes']);
  });

  it('wraps every inserted node in its own block', () => {
    const e = notepad(block(para(), 'b1'));
    e.commands.replaceBlockWith(posInBlock(e, 0), [para('a'), para('b')]);
    e.state.doc.forEach((node) => expect(node.type.name).toBe('notepadBlock'));
  });

  it('gives every inserted block an id', () => {
    const e = notepad(block(para(), 'b1'));
    e.commands.replaceBlockWith(posInBlock(e, 0), [para('a'), para('b'), para('c')]);

    const ids = blockIds(e);
    expect(ids.every((id) => typeof id === 'string' && id!.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('inserts a divider as its own block', () => {
    const e = notepad(block(para(), 'b1'));
    e.commands.replaceBlockWith(posInBlock(e, 0), [{ type: 'horizontalRule' }]);
    expect(blockTypes(e)[0]).toBe('horizontalRule');
    expect(() => e.state.doc.check()).not.toThrow();
  });

  it('inserts a transclusion as its own block', () => {
    const e = notepad(block(para(), 'b1'));
    e.commands.replaceBlockWith(posInBlock(e, 0), [
      { type: 'blockRef', attrs: { refBlockId: 'src', refNoteId: 'note' } },
    ]);

    expect(blockTypes(e)[0]).toBe('blockRef');
    expect(e.state.doc.child(0).firstChild!.attrs['refBlockId']).toBe('src');
  });

  it('rejects an empty list', () => {
    const e = notepad(block(para('keep'), 'b1'));
    expect(e.commands.replaceBlockWith(posInBlock(e, 0), [])).toBe(false);
    expect(blockTexts(e)[0]).toBe('keep');
  });

  it('rejects a node the schema does not know', () => {
    const e = notepad(block(para('keep'), 'b1'));
    expect(e.commands.replaceBlockWith(posInBlock(e, 0), [{ type: 'notARealNode' }])).toBe(false);
    expect(blockTexts(e)[0]).toBe('keep');
  });
});

describe('insertBlockAfter', () => {
  it('inserts an empty block below', () => {
    const e = notepad(block(para('first'), 'b1'));
    e.commands.insertBlockAfter(posInBlock(e, 0));
    expect(blockTexts(e)[1]).toBe('');
    expect(blockTypes(e)[1]).toBe('paragraph');
  });

  it('leaves the caret in the new block', () => {
    const e = notepad(block(para('first'), 'b1'));
    e.commands.insertBlockAfter(posInBlock(e, 0));
    type(e, 'typed here');
    expect(blockTexts(e)[1]).toBe('typed here');
  });
});

describe('markdown quicktype inside a block', () => {
  it('makes a heading from "# "', () => {
    const e = notepad(block(para(), 'b1'));
    caretAtStartOf(e, 0);
    type(e, '# Heading');

    expect(blockTypes(e)[0]).toBe('heading');
    expect(blockTexts(e)[0]).toBe('Heading');
    // The rule must not have escaped the block.
    expect(e.state.doc.child(0).type.name).toBe('notepadBlock');
  });

  it('makes a bullet list from "- "', () => {
    const e = notepad(block(para(), 'b1'));
    caretAtStartOf(e, 0);
    type(e, '- item');
    expect(blockTypes(e)[0]).toBe('bulletList');
    expect(blockTexts(e)[0]).toBe('item');
  });

  it('makes an ordered list from "1. "', () => {
    const e = notepad(block(para(), 'b1'));
    caretAtStartOf(e, 0);
    type(e, '1. item');
    expect(blockTypes(e)[0]).toBe('orderedList');
  });

  it('makes a blockquote from "> "', () => {
    const e = notepad(block(para(), 'b1'));
    caretAtStartOf(e, 0);
    type(e, '> quoted');
    expect(blockTypes(e)[0]).toBe('blockquote');
    expect(blockTexts(e)[0]).toBe('quoted');
  });

  it('makes a code block from a fence', () => {
    const e = notepad(block(para(), 'b1'));
    caretAtStartOf(e, 0);
    // The fence rule requires a terminator after the backticks.
    type(e, '``` ');
    expect(blockTypes(e)[0]).toBe('codeBlock');
  });

  it('wraps a divider produced by "---" back into a block', () => {
    // The rule emits a bare top-level node; the normalizer is what keeps the
    // document legal. This is the case that proves the wrapping approach works.
    const e = notepad(block(para(), 'b1'));
    caretAtStartOf(e, 0);
    type(e, '---');

    e.state.doc.forEach((node) => expect(node.type.name).toBe('notepadBlock'));
    expect(blockTypes(e)).toContain('horizontalRule');
    expect(() => e.state.doc.check()).not.toThrow();
  });

  it('leaves every block with an id after quicktype', () => {
    const e = notepad(block(para(), 'b1'));
    caretAtStartOf(e, 0);
    type(e, '---');
    expect(blockIds(e).every((id) => typeof id === 'string' && id!.length > 0)).toBe(true);
  });
});

describe('document invariants', () => {
  it('never allows content outside a block, whatever is inserted', () => {
    const e = notepad(block(para('start'), 'b1'));

    e.commands.insertContentAt(e.state.doc.content.size, { type: 'paragraph', content: [{ type: 'text', text: 'stray' }] });
    e.commands.insertContentAt(e.state.doc.content.size, { type: 'horizontalRule' });

    e.state.doc.forEach((node) => expect(node.type.name).toBe('notepadBlock'));
    expect(() => e.state.doc.check()).not.toThrow();
  });

  it('always ends in an empty block to type into', () => {
    const e = notepad(block(para('text'), 'b1'));
    e.commands.replaceBlockWith(posInBlock(e, 0), [{ type: 'horizontalRule' }]);

    const last = e.state.doc.lastChild!;
    expect(last.firstChild!.type.name).toBe('paragraph');
    expect(last.firstChild!.content.size).toBe(0);
  });
});
