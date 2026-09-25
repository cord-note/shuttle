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
    host.onLinksChanged('n-self', { added: ['n-alpha'], removed: [] });
    host.openNote('n-beta', 'b1');
    expect(host.calls.linksChanged).toEqual([{ docKey: 'n-self', added: ['n-alpha'], removed: [] }]);
    expect(host.calls.opened).toEqual([{ noteId: 'n-beta', blockId: 'b1' }]);
  });

  it('fails uploads when asked to', async () => {
    const host = createFakeHost({ uploadFails: true });
    await expect(host.uploadFile(new File(['x'], 'a.png', { type: 'image/png' }))).rejects.toThrow();
  });

  it('resolves attachment srcs and passes other schemes through', () => {
    const host = createFakeHost();
    expect(host.resolveFileSrc('attachment:abc')).toBe('https://fake.local/abc');
    expect(host.resolveFileSrc('https://x.y/z.png')).toBe('https://x.y/z.png');
    expect(host.resolveFileSrc('blob:1')).toBe('blob:1');
  });

  it('numbers uploads', async () => {
    const host = createFakeHost();
    const first = await host.uploadFile(new File(['x'], 'a.png', { type: 'image/png' }));
    const second = await host.uploadFile(new File(['y'], 'b.png', { type: 'image/png' }));
    expect(first.src).toBe('attachment:up1');
    expect(second.src).toBe('attachment:up2');
    expect(host.calls.uploads.length).toBe(2);
  });
});
