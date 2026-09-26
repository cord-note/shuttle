import type { JSONContent } from '@tiptap/core';

/**
 * A read-only plain-text view of a document the current schema cannot load.
 *
 * Collects every `text` string in each top-level child of the root `content`
 * array and makes one paragraph of it, so an older-format note shows its
 * words instead of opening blank. Structure and formatting are dropped. Never
 * throws: anything unrecognisable yields an empty document.
 */
export function legacyPreview(json: unknown): JSONContent {
  const paragraphs: JSONContent[] = [];
  try {
    const content = isObject(json) ? json['content'] : undefined;
    if (Array.isArray(content)) {
      for (const child of content) {
        const parts: string[] = [];
        collectText(child, parts, new WeakSet());
        const text = parts.join('');
        if (text.length > 0) paragraphs.push({ type: 'paragraph', content: [{ type: 'text', text }] });
      }
    }
  } catch {
    // Fall through with whatever was collected.
  }
  return { type: 'doc', content: paragraphs.length > 0 ? paragraphs : [{ type: 'paragraph' }] };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function collectText(value: unknown, out: string[], seen: WeakSet<object>): void {
  if (!isObject(value) || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectText(item, out, seen);
    return;
  }
  for (const [key, field] of Object.entries(value)) {
    if (key === 'text') {
      if (typeof field === 'string') out.push(field);
    } else {
      collectText(field, out, seen);
    }
  }
}
