// Shuttle public surface.
//
// Only the modules that depend solely on external packages are exported here.
// The rest (WikiLink, Fragments, UnlinkedMentions, EditorContextMenu) still
// reach into Cord internals — see README "Decoupling from Cord" — and will be
// re-exported once they accept injected data/link providers instead.

export { BlockId } from './BlockId';
export { CustomTaskItem } from './CustomTaskItem';
export { MathInline, MathBlock } from './Math';
export { SlashCommand } from './SlashCommand';
export {
  markdownClipboardProps,
  looksLikeMarkdown,
  markdownToSlice,
  sliceToMarkdown,
} from './markdownClipboard';

// Pending decouple (do not export until host-injected):
// export { WikiLink } from './WikiLink';
// export { FragmentLinkNode } from './FragmentLinkNode';
// export { UnlinkedMentionDecorations } from './UnlinkedMentionDecorations';
