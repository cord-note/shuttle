import type { Node as PMNode } from '@tiptap/pm/model';

/** Note ids targeted by `[[wiki links]]` in the document. */
export function collectMentionTargets(doc: PMNode): Set<string> {
  const ids = new Set<string>();
  doc.descendants((node) => {
    if (node.type.name === 'mention' && typeof node.attrs['id'] === 'string') ids.add(node.attrs['id']);
  });
  return ids;
}

/** Link ids of fragment link nodes in the document. */
export function collectFragmentLinkIds(doc: PMNode): Set<string> {
  const ids = new Set<string>();
  doc.descendants((node) => {
    if (node.type.name === 'fragmentLink' && typeof node.attrs['linkId'] === 'string') ids.add(node.attrs['linkId']);
  });
  return ids;
}

export function diffSets(before: Set<string>, after: Set<string>): { added: string[]; removed: string[] } {
  return {
    added: [...after].filter((id) => !before.has(id)),
    removed: [...before].filter((id) => !after.has(id)),
  };
}
