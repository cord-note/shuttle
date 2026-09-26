import type { JSONContent } from '@tiptap/core';
import type { KeybindingId } from './custom/keybindings/defs';

/** `note` is a plain document; `notepad` adds the block gutter and block menu. */
export type ShuttleMode = 'note' | 'notepad';

export interface NoteRef {
  id: string;
  title: string;
}

/** One row of the host's block index, as shown in the reference picker. */
export interface BlockSummary {
  id: string;
  noteId: string;
  type: string;
  text: string;
  level: number | null;
}

/** A transcluded block, resolved by the host from the source note. */
export interface ResolvedBlock {
  blockId: string;
  noteId: string;
  noteTitle: string;
  /** The top-level node as stored in the source note's document. */
  content: JSONContent;
}

export type FragmentActionType = 'tag' | 'noteLink' | 'fragmentLink';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Everything Shuttle needs from the application embedding it.
 *
 * Shuttle never imports the host's stores, IPC or platform APIs. Anything that
 * needs the host's data or causes a side effect outside the document goes
 * through here, which is what lets the package run in the playground and in
 * tests against a fake.
 *
 * Promise-returning methods may reject; Shuttle catches the rejection,
 * degrades the affected UI, and reports it through `log`.
 */
export interface ShuttleHost {
  // ── Lookups ───────────────────────────────────────────────────────────────
  /** Notes matching a query, for `[[` autocomplete and the reference picker. */
  searchNotes(query: string): Promise<NoteRef[]>;
  /**
   * Exact (case-insensitive) title match, for typed `[[Title]]` and markdown.
   * Must be synchronous — called from input rules and markdown parsing.
   * Answer from an in-memory cache of the current vault. The host should trim
   * the input; matching is case-insensitive; with duplicate titles, return
   * any one consistently.
   */
  findNoteByTitle(title: string): NoteRef | null;
  /**
   * Every note title, for unlinked-mention highlighting. Called by a
   * decoration plugin on every document change, so it must be synchronous
   * and cheap — answer from an in-memory cache of the current vault.
   * Return the same array instance until the titles change — Shuttle caches
   * its matcher by array identity; after a change, return a new array and
   * dispatch a transaction with `UNLINKED_REFRESH_META` (ShuttleEditor does
   * this when the host prop changes).
   */
  listNoteTitles(): NoteRef[];
  /** Blocks of one note, for the second step of the reference picker. */
  listBlocks(noteId: string): Promise<BlockSummary[]>;
  /** A transcluded block's current content, or null if it no longer exists. */
  resolveBlock(blockId: string): Promise<ResolvedBlock | null>;
  /**
   * A displayable URL for a stored `src`. Stored values are platform-neutral
   * (`attachment:<id>`); unknown schemes must be returned unchanged.
   */
  resolveFileSrc(src: string): string;

  // ── Side effects ──────────────────────────────────────────────────────────
  /** Store a file and return the `src` to persist in the document. */
  uploadFile(file: File): Promise<{ src: string }>;
  /**
   * Note ids of wiki-link targets that appeared in or disappeared from
   * document `docKey`. Fires on edit, before the debounced save.
   */
  onLinksChanged(docKey: string, diff: { added: string[]; removed: string[] }): void;
  /** Fragment link nodes removed from document `docKey`, by their link id. */
  onFragmentLinksRemoved(docKey: string, linkIds: string[]): void;
  /** A per-block action the host implements (tagging, linking a block). */
  onFragmentAction(action: { docKey: string; type: FragmentActionType; blockId: string }): void;
  /** Navigate to a note, optionally scrolling to one of its blocks. */
  openNote(noteId: string, blockId?: string): void;
  /** Structured logging; Shuttle never calls `console` directly. */
  log(level: LogLevel, message: string, data?: unknown): void;

  // ── Settings ──────────────────────────────────────────────────────────────
  /** User overrides of Shuttle's default editor keybindings. */
  keybindings: Partial<Record<KeybindingId, string>>;
}
