import type { Extensions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { CharacterCount, Focus, Placeholder, Selection } from '@tiptap/extensions';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { InlineMath } from '@tiptap/extension-mathematics';
import { Youtube } from '@tiptap/extension-youtube';
import { Twitch } from '@tiptap/extension-twitch';
import { FileHandler } from '@tiptap/extension-file-handler';
import { UniqueID } from '@tiptap/extension-unique-id';
import { TableKit } from '@tiptap/extension-table';
import { DetailsContent, DetailsSummary } from '@tiptap/extension-details';
import { Highlight } from '@tiptap/extension-highlight';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { FindAndReplace } from '@tiptap/extension-find-and-replace';
import { TableOfContents, type TableOfContentData } from '@tiptap/extension-table-of-contents';
import { Markdown } from '@tiptap/markdown';
import { common, createLowlight } from 'lowlight';
import { nanoid } from 'nanoid';

import type { ShuttleContextRef } from '../context';
import type { ShuttleMode } from '../host';
import { BLOCK_TYPES } from './blockTypes';
import { BlockCommands } from '../custom/notepad/commands';
import { wikiLink } from '../custom/links/wikiLink';
import { fragmentLink } from '../custom/links/fragmentLink';
import { blockRef } from '../custom/blockRef/blockRef';
import { ShuttleDetails } from '../custom/markdown/details';
import { MarkdownClipboard } from '../custom/markdown/clipboard';
import { shuttleBlockMath } from '../custom/math/blockMath';
import { shuttleImage } from '../custom/image/image';
import { insertImageFiles } from '../custom/image/upload';
import { unlinkedMentions } from '../custom/unlinkedMentions';
import { BlockIdGuard } from '../custom/blockIdGuard';
import { keybindings } from '../custom/keybindings/keybindings';
import { slashCommand } from '../custom/slash/slash';

const lowlight = createLowlight(common);

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif'];

export interface BuildOptions {
  /** False in tests, where no React tree hosts node views. */
  reactViews: boolean;
  /** Twitch embeds require the embedding page's host name. */
  twitchParent: string;
  placeholder?: string;
  /** Receives heading outline updates for the Outline panel. */
  onOutline?: (items: TableOfContentData) => void;
}

/**
 * The editor's extension set. Both modes share one schema — a notepad is the
 * same document with the block gutter turned on — so the only mode-dependent
 * parts are the notepad-only keybindings and slash items.
 */
export function buildExtensions(mode: ShuttleMode, ctx: ShuttleContextRef, options: BuildOptions): Extensions {
  const view = { reactViews: options.reactViews };

  return [
    // ── Official ────────────────────────────────────────────────────────────
    StarterKit.configure({
      codeBlock: false,
      link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
    }),
    CodeBlockLowlight.configure({ lowlight }),
    TaskList,
    TaskItem.configure({ nested: true }),
    InlineMath.configure({
      katexOptions: { throwOnError: false },
      onClick: (node, pos) => ctx.current.events.editMath({ kind: 'inline', latex: String(node.attrs['latex'] ?? ''), pos }),
    }),
    shuttleBlockMath.configure({
      katexOptions: { throwOnError: false, displayMode: true },
      onClick: (node, pos) => ctx.current.events.editMath({ kind: 'block', latex: String(node.attrs['latex'] ?? ''), pos }),
    }),
    shuttleImage(ctx),
    FileHandler.configure({
      allowedMimeTypes: IMAGE_TYPES,
      consumePasteEvent: true,
      onPaste: (editor, files) => { void insertImageFiles(editor, ctx, files); },
      onDrop: (editor, files, pos) => { void insertImageFiles(editor, ctx, files, pos); },
    }),
    Youtube.configure({ nocookie: true, controls: true }),
    Twitch.configure({ parent: options.twitchParent }),
    TableKit.configure({ table: { resizable: false } }),
    ShuttleDetails,
    DetailsSummary,
    DetailsContent,
    Highlight,
    Subscript,
    Superscript,
    BlockIdGuard,
    UniqueID.configure({
      attributeName: 'blockId',
      types: [...BLOCK_TYPES],
      generateID: () => nanoid(10),
    }),
    Placeholder.configure({ placeholder: options.placeholder ?? 'Start writing… or type / for commands' }),
    CharacterCount,
    Selection,
    Focus.configure({ className: 'sh-has-focus', mode: 'shallowest' }),
    FindAndReplace.configure({ searchDebounceMs: 0, injectCSS: false }),
    TableOfContents.configure(options.onOutline ? { onUpdate: options.onOutline } : {}),
    Markdown.configure({ markedOptions: { gfm: true, breaks: false } }),
    MarkdownClipboard,

    // ── Custom ──────────────────────────────────────────────────────────────
    wikiLink(ctx, view),
    fragmentLink(ctx, view),
    blockRef(ctx, view),
    BlockCommands,
    unlinkedMentions(ctx),
    keybindings(ctx, mode),
    slashCommand(ctx, mode),
  ];
}
