import { describe, it, expect, afterEach } from 'bun:test';
import { Editor, type JSONContent } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import UniqueID from '@tiptap/extension-unique-id';
import { BlockCommands } from '../src/custom/notepad/commands';
import { topLevelAt, blockIdAt } from '../src/doc/topLevel';

const UNIQUE_ID_TYPES = [
  'paragraph', 'heading', 'bulletList', 'orderedList', 'taskList', 'blockquote', 'codeBlock', 'horizontalRule',
];

let editor: Editor | null = null;
afterEach(() => { editor?.destroy(); editor = null; });

const p = (text: string, blockId: string): JSONContent => ({
  type: 'paragraph', attrs: { blockId }, content: [{ type: 'text', text }],
});

/** A bulletList whose list items each wrap a paragraph carrying its own blockId. */
const bulletList = (items: Array<{ text: string; id: string }>, listId: string): JSONContent => ({
  type: 'bulletList',
  attrs: { blockId: listId },
  content: items.map((item) => ({
    type: 'listItem',
    content: [p(item.text, item.id)],
  })),
});

const codeBlockJson = (text: string, blockId: string, language: string | null = null): JSONContent => ({
  type: 'codeBlock',
  attrs: { blockId, language },
  content: text ? [{ type: 'text', text }] : [],
});

function make(
  content: JSONContent[],
  extraExtensions: unknown[] = [TaskList, TaskItem],
  options: { trailingNode?: false } = {},
): Editor {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [
      options.trailingNode === false ? StarterKit.configure({ trailingNode: false }) : StarterKit,
      ...(extraExtensions as never[]),
      UniqueID.configure({ attributeName: 'blockId', types: UNIQUE_ID_TYPES }),
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
const allBlockIds = (e: Editor): string[] => {
  const out: string[] = [];
  e.state.doc.descendants((n) => {
    const id = n.attrs['blockId'];
    if (typeof id === 'string' && id) out.push(id);
  });
  return out;
};

describe('topLevelAt', () => {
  it('finds the top-level node around a position', () => {
    const e = make([p('one', 'a'), p('two', 'b')]);
    expect(topLevelAt(e.state.doc, 7)?.index).toBe(1);
    expect(blockIdAt(e.state, 2)).toBe('a');
  });

  it('resolves positions at the very start and the very end', () => {
    const e = make([p('one', 'a'), p('two', 'b')]);
    expect(topLevelAt(e.state.doc, 0)?.index).toBe(0);
    expect(topLevelAt(e.state.doc, e.state.doc.content.size)?.index).toBe(1);
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

  it('leaves the document unchanged when moveBlock is refused', () => {
    // trailingNode disabled to isolate what we're actually asserting: that a
    // refused moveBlock leaves the doc untouched on its own terms. With
    // trailingNode on, the doc's last node being a horizontalRule (not a
    // paragraph) would let StarterKit's TrailingNode append an empty
    // paragraph on the transaction Tiptap dispatches after any command call
    // (even a refused one, per normal Tiptap command semantics) — a benign,
    // unrelated side effect this test isn't about.
    const e = make([p('one', 'a'), { type: 'horizontalRule' }], [TaskList, TaskItem], { trailingNode: false });
    const before = e.state.doc.toJSON();
    const top = topLevelAt(e.state.doc, e.state.doc.content.size)!; // the hr, already last

    expect(e.commands.moveBlock(top.from, 1)).toBe(false);
    expect(e.state.doc.toJSON()).toEqual(before);
  });

  it('does not lose other chained commands when moveBlock is refused', () => {
    // Block commands share one transaction with everything else in a chain
    // (and with first()'s fallback). A refusal must only make the *chain's*
    // overall run() return false — it must not discard work other commands
    // in the same chain already did, so refusing must not set
    // preventDispatch on the shared tr.
    const e = make([p('one', 'a'), p('two', 'b')]);
    const ranOk = e.chain().setTextSelection(3).insertContent('X').moveBlock(1, -1).run();
    expect(ranOk).toBe(false);
    expect(e.state.doc.textContent).toContain('X');
  });

  it('keeps a node selection on the moved atom', () => {
    // trailingNode disabled: once the hr becomes the last node, StarterKit's
    // TrailingNode would otherwise auto-append an empty paragraph after it,
    // which would make the hr no longer "last" for the second moveBlock call.
    const e = make([p('one', 'a'), { type: 'horizontalRule' }, p('two', 'b')], [TaskList, TaskItem], { trailingNode: false });
    const hrPos = e.state.doc.child(0).nodeSize; // position right before the hr
    e.view.dispatch(e.state.tr.setSelection(NodeSelection.create(e.state.doc, hrPos)));
    expect(e.state.selection.from).toBe(hrPos);

    expect(e.commands.moveBlock(e.state.selection.from, 1)).toBe(true);
    expect(e.state.doc.nodeAt(e.state.selection.from)?.type.name).toBe('horizontalRule');
    expect(topLevelAt(e.state.doc, e.state.selection.from)?.index).toBe(2);

    // It is now last, so a further move in the same direction is refused.
    expect(e.commands.moveBlock(e.state.selection.from, 1)).toBe(false);
  });

  it('preserves the caret offset inside a moved block', () => {
    const e = make([p('one', 'a'), p('two', 'b'), p('three', 'c')]);
    const top = topLevelAt(e.state.doc, e.state.doc.content.size)!; // "three"
    const caret = top.from + 1 + 3; // offset 3 inside "three"
    e.commands.setTextSelection(caret);

    expect(e.commands.moveBlock(e.state.selection.from, -1)).toBe(true);
    expect(texts(e).slice(0, 3)).toEqual(['one', 'three', 'two']);

    const newTop = topLevelAt(e.state.doc, e.state.selection.from)!;
    expect(newTop.node.textContent).toBe('three');
    expect(e.state.selection.from - newTop.from).toBe(4); // 1 (open) + offset 3
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

  it('strips every nested blockId when duplicating, not just the top one', () => {
    const e = make([bulletList([{ text: 'a', id: 'i1' }, { text: 'b', id: 'i2' }], 'list1')]);
    expect(e.commands.duplicateBlock(2)).toBe(true);

    const all = allBlockIds(e);
    expect(all).toContain('list1');
    expect(all).toContain('i1');
    expect(all).toContain('i2');
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBeGreaterThanOrEqual(6);
  });

  it('deletes a block but never empties the document', () => {
    const e = make([p('one', 'a'), p('two', 'b')]);
    e.commands.deleteBlock(2);
    expect(texts(e)[0]).toBe('two');
    e.commands.deleteBlock(2);
    expect(e.state.doc.childCount).toBeGreaterThanOrEqual(1);
    expect(e.state.doc.firstChild?.type.name).toBe('paragraph');
  });

  it('does nothing when deleting the only, already-empty paragraph', () => {
    const e = make([{ type: 'paragraph', attrs: { blockId: 'a' } }], [TaskList, TaskItem], { trailingNode: false });
    const before = e.state.doc.toJSON();
    expect(e.commands.deleteBlock(1)).toBe(false);
    expect(e.state.doc.toJSON()).toEqual(before);
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

  it('keeps the same blockId across paragraph -> heading -> bulletList -> paragraph', () => {
    const e = make([p('hello', 'a')]);
    e.commands.turnInto(2, 'heading', 2);
    expect(e.state.doc.firstChild?.attrs['blockId']).toBe('a');
    e.commands.turnInto(2, 'bulletList');
    expect(e.state.doc.firstChild?.attrs['blockId']).toBe('a');
    e.commands.turnInto(2, 'paragraph');
    expect(e.state.doc.firstChild?.attrs['blockId']).toBe('a');
  });

  it('leaves the selection untouched in a different block when converting another', () => {
    const e = make([p('one', 'a'), p('two', 'b')]);
    const secondTop = topLevelAt(e.state.doc, e.state.doc.content.size)!;
    const caret = secondTop.from + 1 + 1; // offset 1 inside "two"
    e.commands.setTextSelection(caret);

    expect(e.commands.turnInto(2, 'heading', 2)).toBe(true);
    expect(e.state.selection.empty).toBe(true);
    const top = topLevelAt(e.state.doc, e.state.selection.from)!;
    expect(top.node.textContent).toBe('two');
  });

  it('joins a list into a single codeBlock, keeping the id', () => {
    const e = make([bulletList([{ text: 'a', id: 'i1' }, { text: 'b', id: 'i2' }, { text: 'c', id: 'i3' }], 'list1')]);
    expect(e.commands.turnInto(2, 'codeBlock')).toBe(true);
    const block = e.state.doc.firstChild!;
    expect(block.type.name).toBe('codeBlock');
    expect(block.textContent).toBe('a\nb\nc');
    expect(block.attrs['blockId']).toBe('list1');
  });

  it('returns false when the target type is not in the schema', () => {
    const e = make([p('hello', 'a')], []); // no TaskList/TaskItem installed
    expect(e.commands.turnInto(2, 'taskList')).toBe(false);
  });

  it('keeps the caret inside a block converted to code, at the same text offset', () => {
    const e = make([p('hello', 'a')]);
    const top = topLevelAt(e.state.doc, 0)!;
    const caretPos = top.from + 1 + 3; // offset 3 inside "hello"
    e.commands.setTextSelection(caretPos);

    expect(e.commands.turnInto(2, 'codeBlock')).toBe(true);

    const newTop = topLevelAt(e.state.doc, e.state.selection.from)!;
    expect(newTop.node.type.name).toBe('codeBlock');
    expect(e.state.selection.from - newTop.from).toBe(4); // 1 (open) + offset 3
  });

  it('leaves an existing codeBlock untouched, keeping its language', () => {
    const e = make([codeBlockJson('let x = 1;', 'a', 'javascript')], [TaskList, TaskItem], { trailingNode: false });
    const before = e.state.doc.toJSON();

    expect(e.commands.turnInto(2, 'codeBlock')).toBe(false);
    expect(e.state.doc.toJSON()).toEqual(before);
  });

  it('does not mutate the document when only checking turnInto via can()', () => {
    const e = make([p('hello', 'a'), p('two', 'b')]);
    const before = e.state.doc.toJSON();

    expect(e.can().turnInto(2, 'heading', 2)).toBe(true);
    expect(e.state.doc.toJSON()).toEqual(before);

    expect(e.can().turnInto(2, 'codeBlock')).toBe(true);
    expect(e.state.doc.toJSON()).toEqual(before);
  });

  it('keeps ids unique after a split', () => {
    const e = make([p('hello world', 'a')]);
    e.commands.setTextSelection(6);
    e.commands.splitBlock();
    const all = ids(e);
    expect(new Set(all).size).toBe(all.length);
  });
});
