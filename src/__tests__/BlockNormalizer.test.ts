import { describe, it, expect } from 'bun:test';
import { Node, getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { EditorState } from '@tiptap/pm/state';
import type { Schema } from '@tiptap/pm/model';
import { Block, NotepadDocument } from '../Block';
import { blockNormalizerPlugin, findDuplicateBlockIds } from '../BlockNormalizer';

// Run with `bun test`. No DOM here: an EditorState needs none, so the document
// invariants are tested without a browser environment.
//
// The schema is assembled from stubs rather than from buildExtensions() because
// the real mathBlock and blockRef extensions pull in React views and CSS modules.
// Their node *names* are all this needs — `block`'s content expression lists
// them, and ProseMirror refuses to build a schema that references an unknown
// node type.

const MathBlockStub = Node.create({ name: 'mathBlock', group: 'block', atom: true });
const BlockRefStub = Node.create({ name: 'blockRef', group: 'block', atom: true });

const schema: Schema = getSchema([
  StarterKit.configure({ document: false }),
  NotepadDocument,
  Block,
  TaskList,
  TaskItem,
  MathBlockStub,
  BlockRefStub,
]);

/** A state whose plugin will normalise the doc on the next change. */
function stateOf(doc: ReturnType<Schema['nodeFromJSON']>): EditorState {
  return EditorState.create({ schema, doc, plugins: [blockNormalizerPlugin()] });
}

const para = (text?: string) => ({
  type: 'paragraph',
  ...(text ? { content: [{ type: 'text', text }] } : {}),
});

const block = (inner: Record<string, unknown>, blockId?: string) => ({
  type: 'notepadBlock',
  ...(blockId ? { attrs: { blockId } } : {}),
  content: [inner],
});

const docOf = (...content: Record<string, unknown>[]) =>
  schema.nodeFromJSON({ type: 'doc', content });

/** Apply a change so appendTransaction runs, and return the resulting doc. */
function normalise(state: EditorState, mutate: (tr: EditorState['tr']) => void): EditorState {
  const tr = state.tr;
  mutate(tr);
  return state.apply(tr);
}

function topLevelTypes(state: EditorState): string[] {
  const types: string[] = [];
  state.doc.forEach((node) => types.push(node.type.name));
  return types;
}

function blockIds(state: EditorState): (string | null)[] {
  const ids: (string | null)[] = [];
  state.doc.forEach((node) => ids.push(node.attrs['blockId'] as string | null));
  return ids;
}

describe('notepad schema', () => {
  it('makes the document a sequence of blocks', () => {
    expect(schema.topNodeType.name).toBe('doc');
    expect(schema.topNodeType.spec.content).toBe('notepadBlock+');
  });

  it('refuses a document with a bare paragraph at the top level', () => {
    // The invariant "no content outside a block" is enforced by the schema, so
    // it cannot be bypassed by any code path.
    expect(() => docOf(para('bare')).check()).toThrow();
  });

  it('accepts a document of blocks', () => {
    expect(() => docOf(block(para('ok'), 'b1')).check()).not.toThrow();
  });

  it('allows only one content node per block', () => {
    expect(() =>
      schema.nodeFromJSON({
        type: 'doc',
        content: [{ type: 'notepadBlock', attrs: { blockId: 'b1' }, content: [para('one'), para('two')] }],
      }).check(),
    ).toThrow();
  });
});

describe('BlockNormalizer', () => {
  it('wraps a bare node inserted at the top level', () => {
    // This is what makes markdown input rules, `---`, code fences and pasted
    // markdown work with no notepad-specific handling: they emit bare nodes.
    const state = stateOf(docOf(block(para('first'), 'b1')));
    const next = normalise(state, (tr) => {
      tr.insert(tr.doc.content.size, schema.nodes['horizontalRule']!.create());
    });

    expect(topLevelTypes(next).every((t) => t === 'notepadBlock')).toBe(true);
    const wrapped = next.doc.child(1);
    expect(wrapped.firstChild!.type.name).toBe('horizontalRule');
    expect(wrapped.attrs['blockId']).toBeTruthy();
  });

  it('mints an id for a block inserted without one', () => {
    const state = stateOf(docOf(block(para('first'), 'b1')));
    const next = normalise(state, (tr) => {
      tr.insert(tr.doc.content.size, schema.nodeFromJSON(block(para('new'))));
    });
    expect(blockIds(next).every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
  });

  it('mints distinct ids for several new blocks at once', () => {
    const state = stateOf(docOf(block(para('first'), 'b1')));
    const next = normalise(state, (tr) => {
      tr.insert(tr.doc.content.size, [
        schema.nodeFromJSON(block(para('a'))),
        schema.nodeFromJSON(block(para('b'))),
        schema.nodeFromJSON(block(para('c'))),
      ]);
    });

    const ids = blockIds(next);
    expect(new Set(ids).size).toBe(ids.length);
    expect(findDuplicateBlockIds(next.doc)).toEqual([]);
  });

  it('leaves existing ids alone', () => {
    const state = stateOf(docOf(block(para('first'), 'keep-me'), block(para(), 'trailing')));
    const next = normalise(state, (tr) => tr.insertText('more', 3));
    expect(blockIds(next)[0]).toBe('keep-me');
  });

  it('appends a trailing empty block so there is always somewhere to type', () => {
    // Without this, a document ending in a divider or transclusion can become
    // impossible to continue with the keyboard alone.
    const state = stateOf(docOf(block(para('text'), 'b1')));
    const next = normalise(state, (tr) => {
      tr.insert(tr.doc.content.size, schema.nodes['horizontalRule']!.create());
    });

    const last = next.doc.lastChild!;
    expect(last.type.name).toBe('notepadBlock');
    expect(last.firstChild!.type.name).toBe('paragraph');
    expect(last.firstChild!.content.size).toBe(0);
  });

  it('does not add a second trailing block when one already exists', () => {
    const state = stateOf(docOf(block(para('text'), 'b1'), block(para(), 'b2')));
    const next = normalise(state, (tr) => tr.insertText('!', 5));
    expect(next.doc.childCount).toBe(2);
  });

  it('makes no transaction when the document is already well-formed', () => {
    const state = stateOf(docOf(block(para('text'), 'b1'), block(para(), 'b2')));
    const before = state.doc.toJSON();
    // A selection-only transaction must not trigger repairs.
    const next = state.apply(state.tr.setMeta('noop', true));
    expect(next.doc.toJSON()).toEqual(before);
  });

  it('does not create its own undo step', () => {
    // Driven without the plugin installed, so the "after" state still needs
    // repair when appendTransaction is invoked by hand — inside a state that has
    // the plugin, apply() has already fixed everything and it returns null.
    const plugin = blockNormalizerPlugin();
    const bare = EditorState.create({ schema, doc: docOf(block(para('first'), 'b1')) });

    const tr = bare.tr;
    tr.insert(tr.doc.content.size, schema.nodes['horizontalRule']!.create());
    const appended = plugin.spec.appendTransaction!([tr], bare, bare.apply(tr));

    // Repairs ride along with the edit that caused them, so one Ctrl+Z undoes both.
    expect(appended).not.toBeNull();
    expect(appended!.getMeta('addToHistory')).toBe(false);
  });

  it('keeps ids stable across unrelated edits', () => {
    const state = stateOf(docOf(block(para('one'), 'b1'), block(para('two'), 'b2'), block(para(), 'b3')));
    let current = state;
    for (const text of ['a', 'b', 'c']) {
      current = normalise(current, (tr) => tr.insertText(text, 3));
    }
    expect(blockIds(current)).toEqual(['b1', 'b2', 'b3']);
  });
});

describe('findDuplicateBlockIds', () => {
  it('reports ids appearing more than once', () => {
    // Duplicates are reported, never auto-renamed: fragment tags and links are
    // keyed by block id, so guessing wrong would move a user's annotations.
    const doc = docOf(block(para('a'), 'same'), block(para('b'), 'same'));
    expect(findDuplicateBlockIds(doc)).toEqual(['same']);
  });

  it('returns empty for a clean document', () => {
    expect(findDuplicateBlockIds(docOf(block(para('a'), 'b1'), block(para('b'), 'b2')))).toEqual([]);
  });
});
