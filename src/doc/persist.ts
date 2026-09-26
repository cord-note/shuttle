import type { JSONContent } from '@tiptap/core';

/** Attributes TableOfContents writes into headings; view state, never stored. */
const OUTLINE_ATTRS = ['id', 'data-toc-id'] as const;

/**
 * The document as it should be stored. TableOfContents gives every heading a
 * random `id` / `data-toc-id` for outline navigation; persisting those would
 * make every load produce a "changed" document. Only headings are touched —
 * a mention's `id` is its target note and must survive.
 * Returns a new tree; the input is not mutated.
 */
export function toStoredJson(json: JSONContent): JSONContent {
  let attrs = json.attrs;
  if (json.type === 'heading' && attrs) {
    const copy = { ...attrs };
    for (const key of OUTLINE_ATTRS) delete copy[key];
    attrs = copy;
  }
  return {
    ...json,
    ...(attrs ? { attrs } : {}),
    ...(json.content ? { content: json.content.map(toStoredJson) } : {}),
  };
}
