# Shuttle

Shuttle is [Cord](https://github.com/alexander-288/cord)'s editor, rebuilt as a
standalone React 18 package (`@cord/shuttle`) on **official Tiptap 3** extensions.
It follows a ghost-markdown model — markdown syntax disappears as you type, the
stored document is Tiptap JSON, and markdown is input UX only, never the storage
format. Almost everything Shuttle does is an official Tiptap extension, configured;
custom code exists only where Tiptap has no equivalent — wiki links, transclusion,
notepad mode, the slash menu, rebindable keybindings and unlinked-mention highlighting.

## Use

```tsx
import { ShuttleEditor } from '@cord/shuttle';
import '@cord/shuttle/styles.css';

<ShuttleEditor
  docKey={note.id}
  doc={note.bodyJson}
  mode={note.kind}           // 'note' | 'notepad'
  host={host}                // implements ShuttleHost
  onChange={(id, doc) => save(id, doc)}
/>
```

| Prop | Behaviour |
|---|---|
| `docKey` | Identity of the document. `doc` is read only when this changes; the editor owns the content after that. Changing it flushes any pending debounced edit first. |
| `doc` | The stored document. A document that fails schema validation (a legacy note) is shown as read-only plain text, never saved — it is never passed to `onChange`. |
| `mode` | `'note'` (plain document) or `'notepad'` (adds the block gutter and block menu); both share one schema. |
| `host` | Implements `ShuttleHost`. Pass a **new** host object when the note list changes — Shuttle refreshes views derived from it (unlinked-mention decorations) on identity change, not on a deep diff. |
| `onChange` | Debounced save (`saveDebounceMs`, default 750 ms). Also flushed immediately on `docKey` change and on unmount, so an edit inside the debounce window is never dropped. |
| `onStats` | Word/character counts, reported after every load and edit. |
| `onReady` | The live `Editor` instance, for host-owned overlays (context menus, fragment overlays); called with `null` on unmount. |
| `saveDebounceMs` | Overrides the 750 ms default. |
| `toolbar` | Shows the formatting toolbar. Default `true`. |
| `outline` | Shows the heading outline panel, fed by `TableOfContents`. Default `false`. |
| `placeholder` | Empty-document placeholder text. |
| `twitchParent` | Embedding page's hostname, required by Twitch embeds. Defaults to `window.location.hostname`. |
| `className` | Extra class on the root element. |
| `children` | Rendered inside the content area, for host overlays positioned against the document. |

## The host contract

Shuttle never imports Cord's stores, IPC or platform APIs. Everything it needs from
the embedding application goes through one interface, `ShuttleHost` (`src/host.ts`):

- **Lookups** — `searchNotes` (async, `[[` autocomplete and the reference picker),
  `findNoteByTitle` (exact title match for typed `[[Title]]` and markdown parsing),
  `listNoteTitles` (every title, for unlinked-mention highlighting), `listBlocks`
  (a note's blocks, for the reference picker), `resolveBlock` (a transcluded block's
  current content), `resolveFileSrc` (a displayable URL for a stored file reference).
- **Side effects** — `uploadFile`, `onLinksChanged`, `onFragmentLinksRemoved`,
  `onFragmentAction`, `openNote`, `log` (structured; Shuttle never calls `console`).
- **Settings** — `keybindings`, the user's overrides of Shuttle's defaults.

Shuttle catches exceptions from every host method, sync or async (`guardHost`), logs
them through `log`, and degrades the affected feature: a throwing lookup answers
"nothing found", a throwing side-effect callback is skipped, and the save is always
scheduled before any callback runs.

`findNoteByTitle` and `listNoteTitles` **must be synchronous** — they're called from
input rules, markdown parsing and a decoration plugin that runs on every document
change, so both should answer from an in-memory cache rather than a query.
`listNoteTitles` should also return the **same array instance** until titles actually
change: Shuttle caches its unlinked-mention matcher by array identity, so a fresh
array is the signal to rebuild it (pair it with a new `host` object so the editor
knows to refresh).

## Stored format

The document is Tiptap JSON — there is no markdown or HTML storage representation.
Every block-level node carries a `blockId` attribute, minted and kept unique by
`UniqueID` + `BlockIdGuard`; it renders in the DOM as `data-blockid` (exported as
`BLOCK_ID_ATTRIBUTE`, not the old `data-block-id`). `BlockIdGuard` runs before
`UniqueID` on every change and guarantees `blockId` uniqueness across the whole
document — a duplicate keeps its id on whichever occurrence still holds the
original content (or the first non-empty one), and re-mints the rest.

`toStoredJson` is what actually gets saved (via `onChange`): it strips the random
`id`/`data-toc-id` attributes `TableOfContents` writes onto headings for outline
navigation (view state, not authored content) and, separately, images still mid-upload
are excluded until they resolve to a real `src`.

## What is official, what is custom

**Official Tiptap 3, configured:** StarterKit (Document, Paragraph, Text, Heading,
Blockquote, BulletList, OrderedList, ListItem, ListKeymap, HorizontalRule, HardBreak,
Bold, Italic, Code, Strike, Underline, Link, Dropcursor, Gapcursor, UndoRedo,
TrailingNode; its own CodeBlock disabled in favour of CodeBlockLowlight) ·
CodeBlockLowlight · TaskList / TaskItem · Mathematics (including its `$…$` / `$$…$$`
markdown tokenizers) · Mention · Image · Youtube · Twitch · FileHandler · UniqueID ·
DragHandleReact · Placeholder · CharacterCount · BubbleMenu · Selection · Focus ·
TableKit · Details (+ summary, content) · Highlight · Subscript · Superscript ·
FindAndReplace · TableOfContents · `@tiptap/markdown`.

**Custom** (Tiptap has no equivalent):

| Piece | What it does |
|---|---|
| Wiki links | `Mention.extend` with a `[[` trigger, `displayText` alias attribute, typed-link input/paste rules |
| `fragmentLink` | Small custom inline node for host-created links to a note or block; markdown-lossy (keeps only its label) |
| `blockRef` | Read-only transclusion by reference (`refBlockId`/`refNoteId` only, content never copied) |
| Notepad commands + UI | Block move/duplicate/turnInto/delete, the block gutter and block menu |
| `BlockIdGuard` | Keeps `blockId` unique across the document; see Stored format above |
| Slash menu | Official `Suggestion` plugin plus Shuttle's own item list and React list |
| Keybindings | Priority-1000 plugin with Shuttle's defaults, rebindable by the host, with physical-key fallback |
| Unlinked mentions | Decoration plugin fed by `host.listNoteTitles()` |
| Markdown glue | Tokenizers for `[[…]]`, `:::details`, `![[note#block]]`, and the markdown clipboard (parses plain-text pastes that look like markdown; serializes multi-block copies back to markdown) |
| Image upload glue | Drop/paste handling into `host.uploadFile`, with pending uploads excluded from what's saved |

**Deliberately not used:** the TextStyle kit, Color/BackgroundColor, FontFamily,
FontSize, LineHeight, TextAlign (presentational, don't survive markdown, fight
theming), Typography (rewrites typed text), FloatingMenu (duplicates the slash menu
and gutter `+`), Emoji, Ruby text, InvisibleCharacters, and Collaboration /
CollaborationCaret (a later phase — implies Yjs as the sync model) — plus every paid
extension.

## Markdown

Markdown is input UX only — never the storage format. Round-tripping through markdown
is lossy for a few types: subscript, superscript, and `fragmentLink` (which keeps only
its label, since a fragment link isn't representable in markdown). Paste conversion
also only sees `text/plain` clipboards; a clipboard that also carries `text/html` (VS
Code, browsers, most editors) takes ProseMirror's HTML path instead, so the markdown
is not converted.

## Develop

```bash
pnpm install
bun test
pnpm typecheck
pnpm playground   # http://localhost:5199, fake host
```

## Roadmap

Phase 1 (this rebuild) → Phase 2 graphs and datasets → Phase 3 canvases → Phase 4
speech-to-text. Collaboration comes last, since it implies Yjs as the sync model.
