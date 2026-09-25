import type {
  BlockSummary, FragmentActionType, LogLevel, NoteRef, ResolvedBlock, ShuttleHost,
} from '../host';

export interface FakeHostCalls {
  linksChanged: { added: string[]; removed: string[] }[];
  fragmentLinksRemoved: string[][];
  fragmentActions: { type: FragmentActionType; blockId: string }[];
  opened: { noteId: string; blockId?: string }[];
  uploads: File[];
  logs: { level: LogLevel; message: string; data?: unknown }[];
}

export interface FakeHostOptions {
  notes?: NoteRef[];
  blocks?: BlockSummary[];
  resolved?: ResolvedBlock[];
  uploadFails?: boolean;
}

export type FakeHost = ShuttleHost & { calls: FakeHostCalls };

const DEFAULT_NOTES: NoteRef[] = [
  { id: 'n-alpha', title: 'Alpha' },
  { id: 'n-beta', title: 'Beta' },
  { id: 'n-gamma', title: 'Gamma Ray' },
];

/** In-memory host for tests and the playground. Records every side effect. */
export function createFakeHost(options: FakeHostOptions = {}): FakeHost {
  const notes = options.notes ?? DEFAULT_NOTES;
  const blocks = options.blocks ?? [];
  const resolved = options.resolved ?? [];
  let uploadCount = 0;

  const calls: FakeHostCalls = {
    linksChanged: [],
    fragmentLinksRemoved: [],
    fragmentActions: [],
    opened: [],
    uploads: [],
    logs: [],
  };

  return {
    calls,
    keybindings: {},

    async searchNotes(query) {
      const q = query.toLowerCase();
      return notes.filter((n) => n.title.toLowerCase().includes(q));
    },
    findNoteByTitle(title) {
      const t = title.trim().toLowerCase();
      return notes.find((n) => n.title.toLowerCase() === t) ?? null;
    },
    listNoteTitles() {
      return notes;
    },
    async listBlocks(noteId) {
      return blocks.filter((b) => b.noteId === noteId);
    },
    async resolveBlock(blockId) {
      return resolved.find((r) => r.blockId === blockId) ?? null;
    },
    resolveFileSrc(src) {
      return src.startsWith('attachment:') ? `https://fake.local/${src.slice('attachment:'.length)}` : src;
    },

    async uploadFile(file) {
      calls.uploads.push(file);
      if (options.uploadFails) throw new Error('upload failed');
      uploadCount += 1;
      return { src: `attachment:up${uploadCount}` };
    },
    onLinksChanged(diff) {
      calls.linksChanged.push(diff);
    },
    onFragmentLinksRemoved(linkIds) {
      calls.fragmentLinksRemoved.push(linkIds);
    },
    onFragmentAction(action) {
      calls.fragmentActions.push(action);
    },
    openNote(noteId, blockId) {
      calls.opened.push(blockId === undefined ? { noteId } : { noteId, blockId });
    },
    log(level, message, data) {
      calls.logs.push(data === undefined ? { level, message } : { level, message, data });
    },
  };
}
