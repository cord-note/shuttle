import { describe, it, expect } from 'bun:test';
import { legacyPreview } from '../src/doc/legacyText';

const EMPTY = { type: 'doc', content: [{ type: 'paragraph' }] };

describe('legacyPreview', () => {
  it('returns an empty document for anything that is not an object', () => {
    expect(legacyPreview(null)).toEqual(EMPTY);
    expect(legacyPreview(undefined)).toEqual(EMPTY);
    expect(legacyPreview('text')).toEqual(EMPTY);
    expect(legacyPreview(42)).toEqual(EMPTY);
    expect(legacyPreview({ type: 'doc' })).toEqual(EMPTY);
    expect(legacyPreview({ content: 'nope' })).toEqual(EMPTY);
  });

  it('makes one paragraph per top-level child, skipping empty ones', () => {
    const v2 = {
      type: 'doc',
      content: [
        { type: 'notepadBlock', attrs: { blockId: 'a' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello ' }, { type: 'text', text: 'world', marks: [{ type: 'bold' }] }] }] },
        { type: 'notepadBlock', content: [{ type: 'paragraph' }] },
        { type: 'notepadBlock', content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }] }] }] }] },
      ],
    };
    expect(legacyPreview(v2)).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'onetwo' }] },
      ],
    });
  });

  it('does not throw on cycles or odd shapes', () => {
    const node: Record<string, unknown> = { type: 'x', text: 'loop' };
    node['self'] = node;
    expect(legacyPreview({ content: [node, 5, null, [{ text: 'arr' }]] })).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'loop' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'arr' }] },
      ],
    });
  });
});
