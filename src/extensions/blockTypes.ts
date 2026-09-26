/**
 * Node types that get a `blockId` from UniqueID. Top-level instances are the
 * addressable blocks the host indexes; nested paragraphs also get ids, which
 * is what will allow per-bullet addressing later without a format change.
 */
export const BLOCK_TYPES: readonly string[] = [
  'paragraph', 'heading', 'bulletList', 'orderedList', 'taskList', 'blockquote', 'codeBlock',
  'blockMath', 'horizontalRule', 'image', 'youtube', 'twitch', 'table', 'details', 'blockRef',
];
