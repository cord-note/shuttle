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

// The v1.6 notepad work — Block, BlockNormalizer, BlockRef, the block chrome,
// blockTarget, Keybindings, extensions and useNoteDoc — is present in src/ but
// not exported. It still imports `@shared/*` and Cord's stores, so it does not
// typecheck standalone. PACKAGING.md is the plan for fixing that; the ordering
// there matters, and steps 1-3 are what make any of this exportable.
