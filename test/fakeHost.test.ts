import { describe, it, expect } from 'bun:test';
import { createFakeHost } from '../src/testing/fakeHost';

describe('fake host', () => {
  it('searches notes case-insensitively and finds by exact title', async () => {
    const host = createFakeHost();
    const hits = await host.searchNotes('alp');
    expect(hits.map((n) => n.title)).toEqual(['Alpha']);
    expect(host.findNoteByTitle('beta')?.id).toBe('n-beta');
    expect(host.findNoteByTitle('missing')).toBeNull();
  });

  it('records side effects', () => {
    const host = createFakeHost();
    host.onLinksChanged({ added: ['n-alpha'], removed: [] });
    host.openNote('n-beta', 'b1');
    expect(host.calls.linksChanged).toEqual([{ added: ['n-alpha'], removed: [] }]);
    expect(host.calls.opened).toEqual([{ noteId: 'n-beta', blockId: 'b1' }]);
  });

  it('fails uploads when asked to', async () => {
    const host = createFakeHost({ uploadFails: true });
    await expect(host.uploadFile(new File(['x'], 'a.png', { type: 'image/png' }))).rejects.toThrow();
  });
});
