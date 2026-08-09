import { describe, expect, it } from 'bun:test';
import {
  parseDoc, flattenText, extractBlocks, findBlockContent,
  wrapInBlocks, unwrapBlocks, emptyNoteDoc, emptyNotepadDoc,
  type DocNode,
} from '../blockDoc';
import { ANNOTATABLE_TYPES } from '../constants';

// These helpers decide what lands in the `blocks` index and what survives a
// note↔notepad conversion, so their edge cases are the ones that quietly lose
// user data: a wrong id means fragment tags detach from their block.

const para = (text?: string, blockId?: string): DocNode => ({
  type: 'paragraph',
  ...(blockId ? { attrs: { blockId } } : {}),
  ...(text ? { content: [{ type: 'text', text }] } : {}),
});

const block = (inner: DocNode, blockId?: string): DocNode => ({
  type: 'notepadBlock',
  ...(blockId ? { attrs: { blockId } } : {}),
  content: [inner],
});

const doc = (...content: DocNode[]): DocNode => ({ type: 'doc', content });

describe('parseDoc', () => {
  it('falls back to an empty note doc for the "{}" column default', () => {
    expect(parseDoc('{}')).toEqual(emptyNoteDoc());
  });

  it('falls back to an empty notepad doc when the kind is notepad', () => {
    // A notepad cannot fall back to a bare paragraph — `doc → block+` forbids it,
    // and Tiptap would throw rather than render.
    expect(parseDoc('{}', 'notepad')).toEqual(emptyNotepadDoc());
  });

  it('falls back on malformed JSON', () => {
    expect(parseDoc('{not json')).toEqual(emptyNoteDoc());
  });

  it('falls back on JSON that parses but is not a document', () => {
    expect(parseDoc('{"type":"paragraph"}')).toEqual(emptyNoteDoc());
    expect(parseDoc('null')).toEqual(emptyNoteDoc());
    expect(parseDoc('[]')).toEqual(emptyNoteDoc());
  });

  it('rejects a doc with no content rather than handing back an empty shell', () => {
    expect(parseDoc('{"type":"doc","content":[]}')).toEqual(emptyNoteDoc());
  });

  it('keeps a valid document as-is', () => {
    const valid = doc(para('hello'));
    expect(parseDoc(JSON.stringify(valid))).toEqual(valid);
  });
});

describe('flattenText', () => {
  it('joins nested text', () => {
    expect(flattenText({
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [para('one')] },
        { type: 'listItem', content: [para('two')] },
      ],
    })).toBe('one two');
  });

  it('collapses whitespace and trims', () => {
    expect(flattenText(para('  spaced   out  '))).toBe('spaced out');
  });

  it('returns empty for a node with no text', () => {
    expect(flattenText({ type: 'horizontalRule' })).toBe('');
  });
});

describe('extractBlocks', () => {
  it('indexes a notepad by wrapper id, typed by its content node', () => {
    const blocks = extractBlocks(
      doc(
        block({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] }, 'b1'),
        block({ type: 'bulletList', content: [{ type: 'listItem', content: [para('item')] }] }, 'b2'),
      ),
      'note-1',
    );

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ id: 'b1', type: 'heading', level: 2, sort: 0, text: 'Title', synthetic: false });
    // A whole list is one block — a query for taskList/bulletList must match the
    // container, not each item.
    expect(blocks[1]).toMatchObject({ id: 'b2', type: 'bulletList', level: null, sort: 1, text: 'item' });
  });

  it('indexes a plain note off blockIds stamped on the nodes themselves', () => {
    const blocks = extractBlocks(doc(para('one', 'p1'), para('two', 'p2')), 'note-1');
    expect(blocks.map((b) => b.id)).toEqual(['p1', 'p2']);
    expect(blocks.every((b) => !b.synthetic)).toBe(true);
  });

  it('gives id-less nodes a deterministic synthetic id', () => {
    // Lists in a plain note carry no blockId, but still need to be searchable.
    const input = doc(para('one', 'p1'), { type: 'bulletList', content: [{ type: 'listItem', content: [para('x')] }] });
    const first = extractBlocks(input, 'note-1');
    const second = extractBlocks(input, 'note-1');

    expect(first[1]).toMatchObject({ id: 'note-1:1', synthetic: true });
    // Determinism is the whole point: a fresh id per reproject would churn
    // primary keys and orphan anything pointing at them.
    expect(second[1]!.id).toBe(first[1]!.id);
  });

  it('keeps the first of two nodes sharing an id, and synthesises for the rest', () => {
    // Real documents contain these: the original BlockId extension assigned an id
    // only when one was missing, so splitting a paragraph left both halves with
    // the same id. The index has a primary key on it, so a duplicate crashes the
    // reprojection — which happens during boot.
    const blocks = extractBlocks(
      doc(para('first', 'dup'), para('second', 'dup'), para('third', 'dup')),
      'note-1',
    );

    expect(blocks[0]).toMatchObject({ id: 'dup', synthetic: false });
    expect(blocks[1]).toMatchObject({ id: 'note-1:1', synthetic: true });
    expect(blocks[2]).toMatchObject({ id: 'note-1:2', synthetic: true });
  });

  it('always returns unique ids', () => {
    const blocks = extractBlocks(
      doc(para('a', 'x'), para('b', 'x'), para('c'), para('d', 'x')),
      'note-1',
    );
    const ids = blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('does not let a duplicate become a reference target', () => {
    // Its address is ambiguous, so resolving it could show either block.
    const source = doc(para('first', 'dup'), para('second', 'dup'));
    const blocks = extractBlocks(source, 'note-1');
    expect(blocks[1]!.synthetic).toBe(true);
    expect(findBlockContent(source, 'dup')).toEqual(para('first', 'dup'));
  });

  it('records a blockRef target', () => {
    const blocks = extractBlocks(
      doc(block({ type: 'blockRef', attrs: { refBlockId: 'src-1', refNoteId: 'note-2' } }, 'b1')),
      'note-1',
    );
    expect(blocks[0]).toMatchObject({ type: 'blockRef', refBlockId: 'src-1' });
  });

  it('leaves refBlockId null for everything else', () => {
    const blocks = extractBlocks(doc(block(para('x'), 'b1')), 'note-1');
    expect(blocks[0]!.refBlockId).toBeNull();
  });
});

describe('findBlockContent', () => {
  const source = doc(block(para('first'), 'b1'), block(para('second'), 'b2'));

  it('returns the content node of a real block', () => {
    expect(findBlockContent(source, 'b2')).toEqual(para('second'));
  });

  it('returns null for an unknown id', () => {
    expect(findBlockContent(source, 'nope')).toBeNull();
  });

  it('never resolves a synthetic id', () => {
    // Synthetic ids are positional, so honouring one as a ref target would make
    // the reference silently point at different content after any edit.
    const plain = doc({ type: 'bulletList', content: [{ type: 'listItem', content: [para('x')] }] });
    expect(findBlockContent(plain, ':0')).toBeNull();
  });
});

describe('wrapInBlocks', () => {
  it('wraps every top-level node', () => {
    const result = wrapInBlocks(doc(para('a'), para('b')));
    expect(result.content).toHaveLength(2);
    expect(result.content!.every((n) => n.type === 'notepadBlock')).toBe(true);
  });

  it('promotes an existing blockId onto the wrapper', () => {
    // Fragment tags and links are keyed by this id; losing it here would detach
    // every annotation the note already had.
    const result = wrapInBlocks(doc(para('a', 'p1')));
    expect(result.content![0]!.attrs).toEqual({ blockId: 'p1' });
  });

  it('leaves already-wrapped blocks alone', () => {
    const already = doc(block(para('a'), 'b1'));
    expect(wrapInBlocks(already)).toEqual(already);
  });

  it('produces a valid notepad doc from an empty document', () => {
    expect(wrapInBlocks({ type: 'doc', content: [] })).toEqual(emptyNotepadDoc());
  });
});

describe('unwrapBlocks', () => {
  it('unwraps blocks back to bare nodes', () => {
    const result = unwrapBlocks(doc(block(para('a'), 'b1'), block(para('b'), 'b2')), ANNOTATABLE_TYPES);
    expect(result.content!.map((n) => n.type)).toEqual(['paragraph', 'paragraph']);
  });

  it('pushes the wrapper id down onto annotatable nodes', () => {
    const result = unwrapBlocks(doc(block(para('a'), 'b1')), ANNOTATABLE_TYPES);
    expect(result.content![0]!.attrs).toMatchObject({ blockId: 'b1' });
  });

  it('drops the id for node types that cannot hold one', () => {
    const list = { type: 'bulletList', content: [{ type: 'listItem', content: [para('x')] }] };
    const result = unwrapBlocks(doc(block(list, 'b1')), ANNOTATABLE_TYPES);
    expect(result.content![0]!.attrs?.['blockId']).toBeUndefined();
  });

  it('drops blockRef nodes, which cannot exist outside a notepad', () => {
    const result = unwrapBlocks(
      doc(
        block(para('keep'), 'b1'),
        block({ type: 'blockRef', attrs: { refBlockId: 'x', refNoteId: 'y' } }, 'b2'),
      ),
      ANNOTATABLE_TYPES,
    );
    expect(result.content).toHaveLength(1);
    expect(flattenText(result)).toBe('keep');
  });

  it('returns an empty note doc when nothing survives', () => {
    const result = unwrapBlocks(
      doc(block({ type: 'blockRef', attrs: { refBlockId: 'x', refNoteId: 'y' } }, 'b1')),
      ANNOTATABLE_TYPES,
    );
    expect(result).toEqual(emptyNoteDoc());
  });
});

describe('note → notepad → note round trip', () => {
  it('preserves text and annotatable ids', () => {
    const original = doc(
      { type: 'heading', attrs: { level: 1, blockId: 'h1' }, content: [{ type: 'text', text: 'Title' }] },
      para('body', 'p1'),
    );

    const roundTripped = unwrapBlocks(wrapInBlocks(original), ANNOTATABLE_TYPES);

    expect(flattenText(roundTripped)).toBe(flattenText(original));
    expect(roundTripped.content!.map((n) => n.attrs?.['blockId'])).toEqual(['h1', 'p1']);
  });
});
