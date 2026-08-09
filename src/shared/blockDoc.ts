// Pure helpers over a serialised Tiptap document.
//
// No DB, no editor, no React — imported by the sidecar (block index,
// conversion) and by the renderer (seed documents, ref rendering) alike.
//
// A plain note's document is `doc → (paragraph | heading | list | …)+`.
// A notepad's document is `doc → block+`, where every `block` holds exactly one
// content node. These helpers read both shapes.

/**
 * Structurally compatible with Tiptap's `JSONContent`, declared here so this
 * module stays free of editor imports and can run in the sidecar.
 */
export interface DocNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown>; [key: string]: unknown }[];
}

/** One top-level unit of a document, flattened for indexing. */
export interface ExtractedBlock {
  /** The node's blockId, or a deterministic synthetic id when it has none. */
  id: string;
  /** Whether `id` came from a real blockId attribute. Synthetic ids are not
   *  valid blockRef targets — they move when surrounding blocks move. */
  synthetic: boolean;
  type: string;
  sort: number;
  level: number | null;
  text: string;
  refBlockId: string | null;
  /** The content node itself, for transclusion. */
  node: DocNode;
}

export { BLOCK_NODE_NAME as BLOCK_NODE } from './constants';
import { BLOCK_NODE_NAME as BLOCK_NODE } from './constants';

export const BLOCK_REF_NODE = 'blockRef';

/** A valid, empty plain-note document. */
export function emptyNoteDoc(): DocNode {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

/** A valid, empty notepad document — one empty block, never zero. */
export function emptyNotepadDoc(): DocNode {
  return {
    type: 'doc',
    content: [{ type: BLOCK_NODE, content: [{ type: 'paragraph' }] }],
  };
}

/**
 * Parse a stored body into a document, falling back to an empty one.
 *
 * A new note's body_json is '{}' — the column default — which parses cleanly
 * but is NOT a valid doc. Checking JSON syntax alone is not enough; the shape
 * has to be checked too, or Tiptap throws "Unknown node type: undefined".
 */
export function parseDoc(bodyJson: string, kind: 'note' | 'notepad' = 'note'): DocNode {
  try {
    const parsed: unknown = JSON.parse(bodyJson);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      (parsed as DocNode).type === 'doc' &&
      Array.isArray((parsed as DocNode).content) &&
      (parsed as DocNode).content!.length > 0
    ) {
      return parsed as DocNode;
    }
  } catch {
    // Malformed JSON — fall through to an empty document.
  }
  return kind === 'notepad' ? emptyNotepadDoc() : emptyNoteDoc();
}

/** All text in a subtree, space-joined. */
export function flattenText(node: DocNode): string {
  const parts: string[] = [];
  (function walk(n: DocNode): void {
    if (typeof n.text === 'string') parts.push(n.text);
    n.content?.forEach(walk);
  })(node);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function readBlockId(node: DocNode): string | null {
  const id = node.attrs?.['blockId'];
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/** The content node inside a `block` wrapper, or the node itself if unwrapped. */
export function innerNode(node: DocNode): DocNode {
  if (node.type !== BLOCK_NODE) return node;
  return node.content?.[0] ?? { type: 'paragraph' };
}

/**
 * Flatten a document's top level into indexable blocks.
 *
 * Works on both shapes: a `block` wrapper contributes its own blockId as the
 * row id while the row's `type`, `level` and `text` describe the content node
 * inside it — so a query for `type = 'taskList'` matches in both note kinds.
 */
export function extractBlocks(doc: DocNode, noteId: string): ExtractedBlock[] {
  const out: ExtractedBlock[] = [];
  const top = doc.content ?? [];

  // Ids already used in this document. Duplicates are real and pre-existing: the
  // original BlockId extension only assigns an id when one is missing, so every
  // paragraph ever split or duplicated in a plain note left two nodes carrying
  // the same id.
  //
  // The first occurrence keeps it — it holds the original position, so fragment
  // tags and links stay where the user put them. Later ones fall back to a
  // synthetic id, which keeps them searchable while marking them unsuitable as
  // reference targets. Without this the index's primary key is violated.
  const seen = new Set<string>();

  for (let sort = 0; sort < top.length; sort++) {
    const node = top[sort]!;
    const inner = innerNode(node);

    // A block wrapper owns the id; otherwise the content node may carry one
    // (BlockId stamps paragraph/heading/blockquote/codeBlock in plain notes).
    const candidate = readBlockId(node) ?? readBlockId(inner);
    const realId = candidate !== null && !seen.has(candidate) ? candidate : null;
    if (realId !== null) seen.add(realId);

    const level = inner.type === 'heading' ? Number(inner.attrs?.['level'] ?? 1) : null;
    const ref = inner.type === BLOCK_REF_NODE
      ? (inner.attrs?.['refBlockId'] as string | undefined) ?? null
      : null;

    out.push({
      id: realId ?? `${noteId}:${sort}`,
      synthetic: realId === null,
      type: inner.type ?? 'paragraph',
      sort,
      level,
      text: flattenText(inner),
      refBlockId: ref,
      node: inner,
    });
  }

  return out;
}

/** The content node of a single block, for rendering a transclusion. */
export function findBlockContent(doc: DocNode, blockId: string): DocNode | null {
  for (const block of extractBlocks(doc, '')) {
    if (!block.synthetic && block.id === blockId) return block.node;
  }
  return null;
}

// ─── Conversion between the two document shapes ──────────────────────────────

/**
 * note → notepad: wrap every top-level node in a `block`.
 *
 * An existing blockId on the content node is promoted onto the wrapper so that
 * fragment tags and links written against it keep resolving. Nodes without one
 * are left null — BlockNormalizer mints ids on load.
 */
export function wrapInBlocks(doc: DocNode): DocNode {
  const top = doc.content ?? [];
  if (top.length === 0) return emptyNotepadDoc();

  return {
    type: 'doc',
    content: top.map((node) => {
      if (node.type === BLOCK_NODE) return node;
      const id = readBlockId(node);
      return {
        type: BLOCK_NODE,
        ...(id ? { attrs: { blockId: id } } : {}),
        content: [node],
      };
    }),
  };
}

/**
 * notepad → note: unwrap every block.
 *
 * The wrapper's blockId is pushed back down onto the content node where that
 * node type can hold one, so converting back is lossless for annotated blocks.
 * `blockRef` nodes cannot survive outside a notepad and are dropped.
 */
export function unwrapBlocks(doc: DocNode, annotatableTypes: readonly string[]): DocNode {
  const top = doc.content ?? [];
  const content: DocNode[] = [];

  for (const node of top) {
    if (node.type !== BLOCK_NODE) {
      content.push(node);
      continue;
    }
    const inner = innerNode(node);
    if (inner.type === BLOCK_REF_NODE) continue;

    const id = readBlockId(node);
    if (id && annotatableTypes.includes(inner.type ?? '')) {
      content.push({ ...inner, attrs: { ...inner.attrs, blockId: id } });
    } else {
      content.push(inner);
    }
  }

  return content.length > 0 ? { type: 'doc', content } : emptyNoteDoc();
}
