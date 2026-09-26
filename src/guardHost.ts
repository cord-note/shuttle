import type { LogLevel, NoteRef, ShuttleHost } from './host';

/**
 * The fallback for a failing `listNoteTitles`. One frozen instance, so the
 * unlinked-mention matcher (cached by array identity) is not rebuilt on every
 * failed call.
 */
export const EMPTY_TITLES: NoteRef[] = Object.freeze([]) as unknown as NoteRef[];

/**
 * Wraps a host so that none of its methods can throw into the editor.
 *
 * Synchronous methods are called from input rules, decoration plugins and
 * `onUpdate`; an exception there would abort the transaction or skip the save.
 * They are caught, logged through the host's own `log`, and replaced by a safe
 * fallback. Promise-returning methods turn a synchronous throw into a
 * rejection, which their callers already handle.
 */
export function guardHost(host: ShuttleHost): ShuttleHost {
  const log = (level: LogLevel, message: string, data?: unknown): void => {
    try {
      host.log(level, message, data);
    } catch {
      // Logging is the last resort; a failing logger has nowhere to report to.
    }
  };

  const fail = (method: string, error: unknown): void => {
    log('error', 'Host call failed', { method, error: String(error) });
  };

  function sync<A extends unknown[], R>(method: string, call: (...args: A) => R, fallback: (...args: A) => R) {
    return (...args: A): R => {
      try {
        return call(...args);
      } catch (error) {
        fail(method, error);
        return fallback(...args);
      }
    };
  }

  function async<A extends unknown[], R>(call: (...args: A) => Promise<R>) {
    return (...args: A): Promise<R> => {
      try {
        return call(...args);
      } catch (error) {
        return Promise.reject(error);
      }
    };
  }

  const noop = (): void => {};

  return {
    searchNotes: async((query: string) => host.searchNotes(query)),
    findNoteByTitle: sync('findNoteByTitle', (title: string) => host.findNoteByTitle(title), () => null),
    listNoteTitles: sync('listNoteTitles', () => host.listNoteTitles(), () => EMPTY_TITLES),
    listBlocks: async((noteId: string) => host.listBlocks(noteId)),
    resolveBlock: async((blockId: string) => host.resolveBlock(blockId)),
    resolveFileSrc: sync('resolveFileSrc', (src: string) => host.resolveFileSrc(src), (src: string) => src),
    uploadFile: async((file: File) => host.uploadFile(file)),
    onLinksChanged: sync('onLinksChanged', (docKey: string, diff: { added: string[]; removed: string[] }) => host.onLinksChanged(docKey, diff), noop),
    onFragmentLinksRemoved: sync(
      'onFragmentLinksRemoved', (docKey: string, linkIds: string[]) => host.onFragmentLinksRemoved(docKey, linkIds), noop,
    ),
    onFragmentAction: sync('onFragmentAction', (action: Parameters<ShuttleHost['onFragmentAction']>[0]) => host.onFragmentAction(action), noop),
    openNote: sync('openNote', (noteId: string, blockId?: string) => host.openNote(noteId, blockId), noop),
    log,
    get keybindings() { return host.keybindings; },
  };
}
