import { describe, it, expect } from 'bun:test';
import * as shuttle from '../src';

describe('public API', () => {
  it('exports the editor, contract helpers and catalogue', () => {
    for (const name of [
      'ShuttleEditor', 'buildExtensions', 'createFakeHost', 'SHUTTLE_KEYBINDINGS', 'KEYBINDING_GROUPS', 'keybindingDef',
      'eventToAccel', 'eventToAccels', 'formatAccel', 'resolveBindings', 'BLOCK_TYPES', 'isValidDoc', 'EMPTY_DOC',
      'topLevelAt', 'blockIdAt', 'toStoredJson', 'UNLINKED_REFRESH_META', 'BLOCK_ID_ATTRIBUTE',
    ]) {
      expect(shuttle).toHaveProperty(name);
    }
  });
});
