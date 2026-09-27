import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  nodeText, topLevelBlocks, wikiLinkTargets, fragmentLinkIds, findTopLevelBlock, BLOCK_TYPES, BLOCK_ID_ATTRIBUTE,
  type DocNode,
} from '../src/doc-core';

const t = (text: string, marks?: DocNode['marks']): DocNode => ({ type: 'text', text, ...(marks ? { marks } : {}) });
const p = (...content: DocNode[]): DocNode => ({ type: 'paragraph', content });
const mention = (id: string, label: string, displayText: string | null = null): DocNode =>
  ({ type: 'mention', attrs: { id, label, displayText } });

describe('nodeText', () => {
  it('concatenates inline pieces and reads atoms from their attributes', () => {
    const para = p(t('bo'), t('ld', [{ type: 'bold' }]), t(' '), mention('n1', 'Alpha'), t(' and '),
      { type: 'inlineMath', attrs: { latex: 'x^2' } });
    expect(nodeText(para)).toBe('bold Alpha and x^2');
  });

  it('prefers a mention\'s display text, and reads fragment links, images and breaks', () => {
    expect(nodeText(p(mention('n1', 'Alpha', 'alias')))).toBe('alias');
    expect(nodeText(p(t('see '), { type: 'fragmentLink', attrs: { linkId: 'l1', label: 'there' } }))).toBe('see there');
    expect(nodeText({ type: 'image', attrs: { src: 'x', alt: 'a cat' } })).toBe('a cat');
    expect(nodeText(p(t('a'), { type: 'hardBreak' }, t('b')))).toBe('a b');
    expect(nodeText({ type: 'blockMath', attrs: { latex: 'E=mc^2' } })).toBe('E=mc^2');
  });

  it('separates nested blocks with one space and collapses whitespace', () => {
    const list: DocNode = {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [p(t('one  '))] },
        { type: 'listItem', content: [p(t('two')), { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('three'))] }] }] },
      ],
    };
    expect(nodeText(list)).toBe('one two three');
    const table: DocNode = {
      type: 'table',
      content: [{ type: 'tableRow', content: [
        { type: 'tableHeader', content: [p(t('h1'))] },
        { type: 'tableCell', content: [p(t('c1'))] },
      ] }],
    };
    expect(nodeText(table)).toBe('h1 c1');
    const details: DocNode = {
      type: 'details',
      content: [{ type: 'detailsSummary', content: [t('Sum')] }, { type: 'detailsContent', content: [p(t('body'))] }],
    };
    expect(nodeText(details)).toBe('Sum body');
  });

  it('tolerates malformed input', () => {
    expect(nodeText(null)).toBe('');
    expect(nodeText('text')).toBe('');
    expect(nodeText({ type: 'paragraph' })).toBe('');
    expect(nodeText({ type: 'paragraph', content: [null, 3, t('ok')] })).toBe('ok');
  });
});

describe('document queries', () => {
  const doc: DocNode = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2, blockId: 'h' }, content: [t('Title')] },
      { type: 'paragraph', attrs: { blockId: '' }, content: [mention('b', 'B'), t(' '), mention('c', 'C'), t(' '), mention('b', 'B')] },
      { type: 'bulletList', attrs: { blockId: 'l' }, content: [{ type: 'listItem', content: [p(mention('d', 'D'),
        { type: 'fragmentLink', attrs: { linkId: 'f1', label: 'x' } })] }] },
      { type: 'paragraph', content: [{ type: 'fragmentLink', attrs: { linkId: 'f1' } }, { type: 'fragmentLink', attrs: { linkId: 'f2' } }] },
    ],
  };

  it('lists top-level blocks with their ids', () => {
    const blocks = topLevelBlocks(doc);
    expect(blocks.map((b) => [b.index, b.type, b.blockId])).toEqual([
      [0, 'heading', 'h'], [1, 'paragraph', null], [2, 'bulletList', 'l'], [3, 'paragraph', null],
    ]);
    expect(blocks[0]!.node).toBe(doc.content![0]!);
  });

  it('collects unique wiki-link targets and fragment link ids in document order', () => {
    expect(wikiLinkTargets(doc)).toEqual(['b', 'c', 'd']);
    expect(fragmentLinkIds(doc)).toEqual(['f1', 'f2']);
  });

  it('finds a top-level block by id', () => {
    expect(findTopLevelBlock(doc, 'l')).toBe(doc.content![2]!);
    expect(findTopLevelBlock(doc, 'missing')).toBeNull();
    expect(findTopLevelBlock(doc, '')).toBeNull();
  });

  it('tolerates malformed input', () => {
    for (const bad of [null, undefined, 42, 'doc', [], { type: 'doc' }, { type: 'doc', content: 'x' }]) {
      expect(topLevelBlocks(bad)).toEqual([]);
      expect(wikiLinkTargets(bad)).toEqual([]);
      expect(fragmentLinkIds(bad)).toEqual([]);
      expect(findTopLevelBlock(bad, 'x')).toBeNull();
    }
  });

  it('re-exports the block constants', () => {
    expect(BLOCK_TYPES).toContain('paragraph');
    expect(BLOCK_ID_ATTRIBUTE).toBe('data-blockid');
  });
});

describe('doc-core entry', () => {
  it('imports nothing but the block constants, so servers never load React or Tiptap', () => {
    const src = readFileSync('src/doc-core/index.ts', 'utf8');
    const imports = [...src.matchAll(/(?:^|\n)\s*(?:import|export)[^'"\n]*from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(imports).toEqual(['../extensions/blockTypes']);
  });
});
