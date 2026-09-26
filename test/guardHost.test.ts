import { describe, it, expect } from 'bun:test';
import { guardHost, EMPTY_TITLES } from '../src/guardHost';
import { createFakeHost, type FakeHost } from '../src/testing/fakeHost';

const boom = (): never => { throw new Error('boom'); };

function failing(): FakeHost {
  const host = createFakeHost();
  host.findNoteByTitle = boom;
  host.listNoteTitles = boom;
  host.resolveFileSrc = boom;
  host.onLinksChanged = boom;
  host.onFragmentLinksRemoved = boom;
  host.onFragmentAction = boom;
  host.openNote = boom;
  host.searchNotes = boom;
  host.listBlocks = boom;
  host.resolveBlock = boom;
  host.uploadFile = boom;
  return host;
}

const errorsFor = (host: FakeHost, method: string) =>
  host.calls.logs.filter((l) =>
    l.level === 'error' && l.message === 'Host call failed'
    && (l.data as { method: string }).method === method
    && (l.data as { error: string }).error.includes('boom'));

describe('guardHost', () => {
  it('returns each synchronous method\'s fallback and logs the failure', () => {
    const host = failing();
    const safe = guardHost(host);
    expect(safe.findNoteByTitle('x')).toBeNull();
    expect(errorsFor(host, 'findNoteByTitle').length).toBe(1);
    expect(safe.listNoteTitles()).toBe(EMPTY_TITLES);
    expect(safe.listNoteTitles()).toBe(EMPTY_TITLES);
    expect(errorsFor(host, 'listNoteTitles').length).toBe(2);
    expect(safe.resolveFileSrc('attachment:a')).toBe('attachment:a');
    expect(errorsFor(host, 'resolveFileSrc').length).toBe(1);
    expect(() => safe.onLinksChanged('k', { added: [], removed: [] })).not.toThrow();
    expect(errorsFor(host, 'onLinksChanged').length).toBe(1);
    expect(() => safe.onFragmentLinksRemoved('k', ['l'])).not.toThrow();
    expect(errorsFor(host, 'onFragmentLinksRemoved').length).toBe(1);
    expect(() => safe.onFragmentAction({ docKey: 'k', type: 'tag', blockId: 'b' })).not.toThrow();
    expect(errorsFor(host, 'onFragmentAction').length).toBe(1);
    expect(() => safe.openNote('n')).not.toThrow();
    expect(errorsFor(host, 'openNote').length).toBe(1);
  });

  it('turns a synchronous throw from an async method into a rejection', async () => {
    const safe = guardHost(failing());
    await expect(safe.searchNotes('a')).rejects.toThrow('boom');
    await expect(safe.listBlocks('n')).rejects.toThrow('boom');
    await expect(safe.resolveBlock('b')).rejects.toThrow('boom');
    await expect(safe.uploadFile(new File(['x'], 'x.png'))).rejects.toThrow('boom');
  });

  it('passes results through, keeping the title array identity', async () => {
    const host = createFakeHost();
    const safe = guardHost(host);
    expect(safe.listNoteTitles()).toBe(host.listNoteTitles());
    expect(safe.listNoteTitles()).toBe(safe.listNoteTitles());
    expect(safe.findNoteByTitle('alpha')?.id).toBe('n-alpha');
    expect(safe.resolveFileSrc('attachment:a')).toBe('https://fake.local/a');
    expect((await safe.searchNotes('beta')).map((n) => n.id)).toEqual(['n-beta']);
    safe.openNote('n-alpha', 'b1');
    expect(host.calls.opened).toEqual([{ noteId: 'n-alpha', blockId: 'b1' }]);
    expect(host.calls.logs).toEqual([]);
  });

  it('never throws from log, and passes keybindings through', () => {
    const host = failing();
    host.log = boom;
    host.keybindings = { 'editor.bold': 'Mod+B' };
    const safe = guardHost(host);
    expect(() => safe.log('info', 'x')).not.toThrow();
    expect(safe.findNoteByTitle('x')).toBeNull();
    expect(safe.keybindings).toBe(host.keybindings);
  });
});
