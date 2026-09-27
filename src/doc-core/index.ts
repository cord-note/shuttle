/**
 * Pure helpers over a stored Shuttle document (Tiptap JSON). No React, no
 * Tiptap, no DOM — safe to import from servers and workers via
 * `shuttle-editor/doc`.
 */
export { BLOCK_TYPES, BLOCK_ID_ATTRIBUTE } from '../extensions/blockTypes';

export interface DocNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

export interface TopLevelBlock {
  index: number;
  type: string;
  blockId: string | null;
  node: DocNode;
}

const INLINE_ATOMS = new Set(['mention', 'inlineMath', 'fragmentLink', 'hardBreak']);

const isNode = (v: unknown): v is DocNode => typeof v === 'object' && v !== null && !Array.isArray(v);
const children = (n: DocNode): DocNode[] => (Array.isArray(n.content) ? n.content.filter(isNode) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const isInline = (n: DocNode): boolean => typeof n.text === 'string' || INLINE_ATOMS.has(n.type ?? '');

/** Text an atom contributes to search and excerpts. */
function atomText(n: DocNode): string {
  const a = n.attrs ?? {};
  switch (n.type) {
    case 'mention': return str(a['displayText']) || str(a['label']);
    case 'inlineMath':
    case 'blockMath': return str(a['latex']);
    case 'image': return str(a['alt']);
    case 'fragmentLink': return str(a['label']);
    case 'hardBreak': return ' ';
    default: return '';
  }
}

function collect(n: DocNode, out: string[]): void {
  if (typeof n.text === 'string') { out.push(n.text); return; }
  const own = atomText(n);
  if (own) out.push(own);
  const kids = children(n);
  // Inline children concatenate; block children are separated by a space.
  const inline = kids.every(isInline);
  for (const k of kids) {
    if (!inline) out.push(' ');
    collect(k, out);
  }
}

/** Plain text of a node and its descendants, whitespace collapsed. */
export function nodeText(node: unknown): string {
  if (!isNode(node)) return '';
  const out: string[] = [];
  collect(node, out);
  return out.join('').replace(/\s+/g, ' ').trim();
}

/** The document's top-level nodes, with the block id each one carries. */
export function topLevelBlocks(doc: unknown): TopLevelBlock[] {
  if (!isNode(doc)) return [];
  return children(doc).map((node, index) => {
    const id = node.attrs?.['blockId'];
    return { index, type: node.type ?? 'paragraph', blockId: typeof id === 'string' && id ? id : null, node };
  });
}

function walk(n: DocNode, visit: (n: DocNode) => void): void {
  visit(n);
  for (const k of children(n)) walk(k, visit);
}

function uniqueAttr(doc: unknown, type: string, attr: string): string[] {
  if (!isNode(doc)) return [];
  const seen = new Set<string>();
  walk(doc, (n) => {
    const v = n.attrs?.[attr];
    if (n.type === type && typeof v === 'string' && v) seen.add(v);
  });
  return [...seen];
}

/** Note ids targeted by `[[wiki links]]` anywhere in the document. */
export const wikiLinkTargets = (doc: unknown): string[] => uniqueAttr(doc, 'mention', 'id');

/** Link ids of fragment link nodes anywhere in the document. */
export const fragmentLinkIds = (doc: unknown): string[] => uniqueAttr(doc, 'fragmentLink', 'linkId');

/** The top-level node carrying `blockId`, or null. */
export function findTopLevelBlock(doc: unknown, blockId: string): DocNode | null {
  if (!blockId) return null;
  return topLevelBlocks(doc).find((b) => b.blockId === blockId)?.node ?? null;
}
