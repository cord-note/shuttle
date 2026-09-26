import type { JSONContent } from '@tiptap/core';
import type { Schema } from '@tiptap/pm/model';

export const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };

/**
 * True when the stored document fits the current schema. Documents written by
 * Shuttle v2 (notepad wrappers, old math nodes) fail here and are opened
 * read-only instead of being silently rewritten.
 */
export function isValidDoc(schema: Schema, json: JSONContent): boolean {
  if (json.type !== 'doc') return false;
  try {
    schema.nodeFromJSON(json).check();
    return true;
  } catch {
    return false;
  }
}
