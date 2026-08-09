import { describe, it, expect } from 'bun:test';
import './domSetup';
import { getSchema } from '@tiptap/core';
import { buildExtensions } from '../extensions';

// The other block tests stub out mathBlock and blockRef, so without this the real
// notepad schema would never be built until the app ran — and a schema error is a
// blank window, not a caught exception.
describe('real extension sets build a schema', () => {
  it('notepad', () => {
    const schema = getSchema(buildExtensions('notepad'));
    expect(schema.topNodeType.spec.content).toBe('notepadBlock+');
    for (const n of ['notepadBlock', 'blockRef', 'mathBlock', 'taskList', 'blockquote']) {
      expect(schema.nodes[n]).toBeDefined();
    }
    // The group collision must stay fixed: blockquote takes a paragraph.
    const p = schema.nodes['paragraph']!.createChecked(null, schema.text('x'));
    expect(() => schema.nodes['blockquote']!.createChecked(null, p)).not.toThrow();
  });

  it('note', () => {
    const schema = getSchema(buildExtensions('note'));
    expect(schema.topNodeType.spec.content).toBe('block+');
    // A plain note must NOT gain the wrapper — its documents stay as they were.
    expect(schema.nodes['notepadBlock']).toBeUndefined();
  });
});
