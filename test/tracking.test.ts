import { describe, it, expect } from 'bun:test';
import { makeEditor } from './helpers';
import { collectFragmentLinkIds, collectMentionTargets, diffSets } from '../src/doc/tracking';
import { EMPTY_DOC, isValidDoc } from '../src/doc/validate';

describe('tracking', () => {
  it('collects mention targets and fragment link ids', () => {
    const { editor } = makeEditor({
      content: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [
            { type: 'mention', attrs: { id: 'n-alpha', label: 'Alpha' } },
            { type: 'mention', attrs: { id: 'n-alpha', label: 'Alpha' } },
            { type: 'fragmentLink', attrs: { linkId: 'l1', toNoteId: 'n-beta' } },
          ],
        }],
      },
    });
    expect([...collectMentionTargets(editor.state.doc)]).toEqual(['n-alpha']);
    expect([...collectFragmentLinkIds(editor.state.doc)]).toEqual(['l1']);
    editor.destroy();
  });

  it('diffs sets', () => {
    expect(diffSets(new Set(['a', 'b']), new Set(['b', 'c']))).toEqual({ added: ['c'], removed: ['a'] });
  });

  it('diffs identical sets to empty added/removed', () => {
    expect(diffSets(new Set(['a', 'b']), new Set(['a', 'b']))).toEqual({ added: [], removed: [] });
  });
});

describe('isValidDoc', () => {
  it('accepts current documents and rejects v2 notepad wrappers', () => {
    const { editor } = makeEditor();
    expect(isValidDoc(editor.schema, EMPTY_DOC)).toBe(true);
    expect(isValidDoc(editor.schema, {
      type: 'doc',
      content: [{ type: 'notepadBlock', attrs: { blockId: 'x' }, content: [{ type: 'paragraph' }] }],
    })).toBe(false);
    expect(isValidDoc(editor.schema, { type: 'doc', content: [{ type: 'mathInline' }] })).toBe(false);
    editor.destroy();
  });

  it('rejects a non-doc root', () => {
    const { editor } = makeEditor();
    expect(isValidDoc(editor.schema, { type: 'paragraph' })).toBe(false);
    editor.destroy();
  });

  it('rejects a doc violating content rules', () => {
    const { editor } = makeEditor();
    expect(isValidDoc(editor.schema, { type: 'doc', content: [{ type: 'text', text: 'x' }] })).toBe(false);
    editor.destroy();
  });
});
