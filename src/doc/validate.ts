import type { JSONContent } from '@tiptap/core';
import type { Schema } from '@tiptap/pm/model';

export const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };

/**
 * True when the stored document fits the current schema. Documents written by
 * Shuttle v2 (notepad wrappers, old math nodes) fail here and are opened
 * read-only instead of being silently rewritten.
 *
 * Known gap: this only checks node/mark *types* and content structure — it does
 * not validate individual attribute names or values. ProseMirror silently drops
 * unknown attrs on `nodeFromJSON`, so a document that differs from the current
 * schema only by extra or renamed attrs will pass here, open editable, and lose
 * those attrs on the first save. This is accepted because every known v2 shape
 * (notepad wrappers, old math nodes) differs by node *type*, not just attrs.
 */
export function isValidDoc(schema: Schema, json: unknown): boolean {
  if (!json || typeof json !== 'object' || (json as JSONContent).type !== 'doc') return false;
  try {
    schema.nodeFromJSON(json as JSONContent).check();
    return true;
  } catch {
    return false;
  }
}
