# Shuttle

A React rich-text editor for note-taking apps, built on official Tiptap 3.

[![npm](https://img.shields.io/npm/v/shuttle-editor)](https://www.npmjs.com/package/shuttle-editor)
[![License: AGPL-3.0-or-later](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue)](./LICENSE)
[![CI](https://github.com/cord-note/shuttle/actions/workflows/ci.yml/badge.svg)](https://github.com/cord-note/shuttle/actions/workflows/ci.yml)

## What it is

Shuttle is a ready-made editor component for apps where notes link to each other.
Markdown syntax disappears as you type (`# ` becomes a heading, `**bold**` becomes
bold), and the document is stored as Tiptap JSON. It includes:

- **Wiki links** — type `[[` to link another note, or write `[[Note]]` / `[[Note|alias]]`
  directly. Unlinked mentions of note titles are highlighted.
- **Notepad mode** — every top-level block gets a stable id, a drag handle and a block
  menu (move, duplicate, turn into, delete).
- **Block transclusion** — embed a block from another note by reference; it always shows
  the source's current content.
- **Math** — inline and display formulas rendered with KaTeX.
- **Tables, toggles, task lists, highlight, subscript/superscript, code blocks** with
  syntax highlighting.
- **Find & replace** and a heading **outline** panel.
- **Image uploads** by paste, drop or the slash menu, stored wherever your app puts them.
- **YouTube and Twitch embeds** — paste a link.
- **Markdown paste and copy**, a `/` slash menu, a selection toolbar, and
  **rebindable keyboard shortcuts**.

Your app plugs in its data — note search, file storage, navigation — through one
adapter object, `ShuttleHost`.

## Install

```bash
npm install shuttle-editor react react-dom katex
# or
pnpm add shuttle-editor react react-dom katex
# or
yarn add shuttle-editor react react-dom katex
```

React 18 or 19 and KaTeX 0.16 are peer dependencies. The package is ESM-only.

The same package is also published to GitHub Packages as `@cord-note/shuttle`.
To install from there, add this to your project's `.npmrc`:

```ini
@cord-note:registry=https://npm.pkg.github.com
```

and authenticate with a GitHub token that has the `read:packages` scope (GitHub
Packages requires a token even for public packages). Then
`npm install @cord-note/shuttle` and import from `@cord-note/shuttle` instead of
`shuttle-editor` — including the stylesheet, `import '@cord-note/shuttle/styles.css'`.

## Quick start

```tsx
import { useMemo, useState } from 'react';
import { ShuttleEditor, type JSONContent, type NoteRef, type ShuttleHost } from 'shuttle-editor';
import 'shuttle-editor/styles.css';

// Your app's notes. Here: a fixed list kept in memory.
const NOTES: NoteRef[] = [
  { id: 'welcome', title: 'Welcome' },
  { id: 'ideas', title: 'Ideas' },
];

function createHost(openNote: (id: string) => void): ShuttleHost {
  return {
    // Lookups
    searchNotes: async (query) =>
      NOTES.filter((n) => n.title.toLowerCase().includes(query.toLowerCase())),
    findNoteByTitle: (title) =>
      NOTES.find((n) => n.title.toLowerCase() === title.trim().toLowerCase()) ?? null,
    listNoteTitles: () => NOTES, // same array until the titles change
    listBlocks: async () => [],
    resolveBlock: async () => null,
    resolveFileSrc: (src) => src,

    // Side effects
    uploadFile: async (file) => ({ src: URL.createObjectURL(file) }),
    onLinksChanged: () => {},
    onFragmentLinksRemoved: () => {},
    onFragmentAction: () => {},
    openNote: (noteId) => openNote(noteId),
    log: (level, message, data) => console[level](message, data),

    // Settings
    keybindings: {},
  };
}

export function Notes() {
  const [noteId, setNoteId] = useState('welcome');
  const [docs, setDocs] = useState<Record<string, JSONContent>>({});
  const host = useMemo(() => createHost(setNoteId), []);

  return (
    <ShuttleEditor
      docKey={noteId}
      doc={docs[noteId] ?? null}
      mode="notepad"
      host={host}
      onChange={(key, doc) => setDocs((all) => ({ ...all, [key]: doc }))}
    />
  );
}
```

To try the editor before writing a host, use the built-in fake: `createFakeHost()`
returns an in-memory `ShuttleHost` with three sample notes that records every call
(`host.calls`). You can pass your own `notes`, `blocks` and `resolved` blocks, typed as
`FakeHostOptions`.

```tsx
import { ShuttleEditor, createFakeHost } from 'shuttle-editor';

const host = createFakeHost();
```

## Props

| Prop | Type | Behaviour |
|---|---|---|
| `docKey` | `string` | Identity of the document. `doc` is read only when this changes; after that the editor owns the content. Changing it saves any pending edit to the previous document first. |
| `doc` | `JSONContent \| null` | The stored document, or `null` for an empty one. A document that doesn't fit the schema opens read-only (see [Document format](#document-format)). |
| `mode` | `'note' \| 'notepad'` | `note` is a plain document. `notepad` adds the block gutter (drag handles, block menu), block shortcuts and block references. Both use the same schema, so a document can switch modes. |
| `host` | `ShuttleHost` | Your app's adapter. Pass a **new object** when your note list changes; Shuttle refreshes views derived from it (unlinked mentions) when the identity changes. |
| `onChange` | `(docKey, doc) => void` | Save callback, debounced. Also called immediately when `docKey` changes and on unmount, so an edit inside the debounce window is never lost. |
| `onStats` | `({ words, characters }) => void` | Optional. Word and character counts after every load and edit. |
| `onReady` | `(editor \| null, controls \| null) => void` | Optional. The live Tiptap `Editor`, for your own overlays or commands, and `ShuttleControls` (`openRefPicker()`, `openFind()`, `pickImage()`) to open Shuttle's dialogs from your own menus, plus `pickNote()` / `pickBlock()`, which open the reference picker and resolve with the choice (or `null`). Both are `null` on unmount. |
| `saveDebounceMs` | `number` | Optional. Debounce for `onChange`. Default `750`. |
| `toolbar` | `boolean` | Optional. Show the formatting toolbar. Default `true`. |
| `outline` | `boolean` | Optional. Show the heading outline panel. Default `false`. |
| `placeholder` | `string` | Optional. Text shown in an empty document. Default `Start writing… or type / for commands`. |
| `twitchParent` | `string` | Optional. Your page's hostname, which Twitch embeds require. Default `window.location.hostname`. |
| `colorScheme` | `'light' \| 'dark' \| 'auto'` | Optional. Palette for code highlighting; `auto` follows the system. Pass your app's scheme if it has its own switch. Default `'auto'`. |
| `spellCheck` | `boolean` | Optional. Turns the browser's spell checking on or off for the document. Omitted, the browser decides (usually on). |
| `lineWidth` | `number` | Optional. Width of the text column in px, centred; the toolbar follows it. Omitted, the text fills the editor. |
| `onLineWidthChange` | `(width) => void` | Optional. Shows a margin ruler under the toolbar with a handle at each edge of the column; dragging (or the arrow keys on a handle) calls this with the new width when released. Store it and pass it back as `lineWidth`. |
| `lineWidthRange` | `{ min, max }` | Optional. Limits for the ruler. Default `320` to the editor's full width. |
| `twitch` | `boolean` | Optional. `false` stops pasted Twitch links from becoming embeds (use it where Twitch can't play, such as desktop shells). Stored embeds still load. Default `true`. |
| `className` | `string` | Optional. Extra class on the root element (`.sh-root`). |
| `children` | `ReactNode` | Optional. Rendered inside the content area, for overlays positioned against the document. |

`loadDocument(editor, json)` is also exported, for replacing a live editor's content
without making the load undoable.

## The host adapter

`ShuttleHost` is everything Shuttle needs from your app. Shuttle never talks to your
stores or APIs directly.

**Lookups**

| Method | Purpose |
|---|---|
| `searchNotes(query)` | Async. Notes matching a query, for `[[` autocomplete and the block-reference picker. |
| `findNoteByTitle(title)` | **Sync.** Exact, case-insensitive title match, for a typed `[[Title]]` and pasted markdown. |
| `listNoteTitles()` | **Sync.** Every note, for unlinked-mention highlighting. |
| `listBlocks(noteId)` | Async. A note's blocks (`BlockSummary[]`), for the second step of the block-reference picker. |
| `resolveBlock(blockId)` | Async. A transcluded block's current content (`ResolvedBlock`), or `null` if it no longer exists. |
| `resolveFileSrc(src)` | **Sync.** A displayable URL for a stored image `src`. Return unknown values unchanged. |

**Side effects**

| Method | Purpose |
|---|---|
| `uploadFile(file)` | Async. Store a pasted, dropped or picked image and return the `{ src }` to keep in the document — for example `attachment:<id>`, turned into a URL by `resolveFileSrc`. |
| `onLinksChanged(docKey, { added, removed })` | Wiki-link targets (note ids) that appeared in or disappeared from a document. Fires on edit, before the debounced save — use it to keep a backlinks index. |
| `onFragmentLinksRemoved(docKey, linkIds)` | Link nodes your app created (fragment links) that were deleted from the document. |
| `onFragmentAction({ docKey, type, blockId })` | The user picked *Tag block*, *Link → note* or *Link → fragment* from the slash menu. Implement it however your app tags or links blocks. |
| `openNote(noteId, blockId?)` | Navigate to a note, optionally to one of its blocks (clicking a wiki link or a transclusion). |
| `log(level, message, data?)` | Structured logging. Shuttle never calls `console` itself. |

**Settings**

| Property | Purpose |
|---|---|
| `keybindings` | The user's shortcut overrides, `Partial<Record<KeybindingId, string>>`. See [Keyboard shortcuts](#keyboard-shortcuts). |

The synchronous methods are called from input rules, markdown parsing and a plugin
that runs on every document change, so answer them from an in-memory cache, not a
database query.

`listNoteTitles` must return the **same array instance** until the titles change.
Shuttle caches its matcher by array identity; when the titles change, return a new
array and pass a new `host` object to the editor so it refreshes.

Errors are contained: every host method is wrapped, so an exception (sync or async) is
logged through `log` and only the affected feature degrades — a failing lookup
answers "nothing found", a failing callback is skipped, and saving is scheduled before
any callback runs.

## Document format

Documents are [Tiptap JSON](https://tiptap.dev/docs/editor/core-concepts/schema)
(`JSONContent`); that is the only stored form, and `onChange` hands you exactly what to
store.

- Block nodes (paragraphs, headings, lists, quotes, code blocks, math, images, embeds,
  tables, toggles, transclusions) carry a `blockId` attribute that stays stable across
  edits and is kept unique within the document. In the DOM it is rendered as
  `data-blockid` — exported as `BLOCK_ID_ATTRIBUTE` — so you can locate a block with
  `[data-blockid="…"]`. `BLOCK_TYPES` lists the node types that get one.
- A transclusion stores only the ids of the block it shows (`refNoteId`,
  `refBlockId`), never a copy of its content.
- What is **not** saved: the temporary ids the outline puts on headings, and images
  that are still uploading (they are saved once `uploadFile` resolves).
- A document that doesn't match the current schema opens **read-only**, showing its
  text with a notice, and is never passed to `onChange` — so an old or corrupt
  document is never overwritten. `isValidDoc(schema, json)` runs the same check.
- `EMPTY_DOC` is an empty document; `toStoredJson(json)` is the cleanup applied before
  saving, if you build documents yourself.

### Reading documents on a server

`shuttle-editor/doc` reads stored documents without React, Tiptap or a DOM, so a
server or worker can index what the editor saves:

```ts
import { nodeText, topLevelBlocks, wikiLinkTargets } from 'shuttle-editor/doc';

const doc = JSON.parse(storedJson);
const links = wikiLinkTargets(doc);           // note ids of every [[wiki link]]
const rows = topLevelBlocks(doc).map((b) => ({ id: b.blockId, text: nodeText(b.node) }));
```

It also exports `fragmentLinkIds(doc)`, `findTopLevelBlock(doc, blockId)`,
`BLOCK_TYPES` and `BLOCK_ID_ATTRIBUTE`. `nodeText` includes the text atoms stand for:
wiki-link labels, formulas and image alt text.

## Theming

The stylesheet reads your CSS variables and falls back to a neutral light theme:

| Variable | Used for | Default |
|---|---|---|
| `--accent` | Selection, active buttons, focus | `#7aa2f7` |
| `--on-accent` | Text on accent backgrounds | `#fff` |
| `--bg-primary` | Selection toolbar, menus and popups (the editor itself is transparent) | `#ffffff` |
| `--bg-secondary` | Code, table headers, block references, hover states | `#f5f5f7` |
| `--border` | Borders and dividers | `#e3e3e8` |
| `--text-primary` | Body text | `#1d1d22` |
| `--text-muted` | Placeholders, secondary text | `#8a8a94` |
| `--link-color` | Links and wiki links | `--accent` |
| `--editor-font-size` | Base font size | `15px` |
| `--font-mono` | Inline code and code blocks | `ui-monospace, …, monospace` |

```css
:root[data-theme='dark'] {
  --accent: #bb9af7;
  --bg-primary: #1a1b26;
  --bg-secondary: #24283b;
  --border: #33384d;
  --text-primary: #c0caf5;
  --text-muted: #737aa2;
  --editor-font-size: 16px;
}
```

### Code highlighting

Code blocks are highlighted by Shuttle itself (lowlight tokens, coloured by a built-in
GitHub-style light and dark palette), so you don't need a highlight.js theme. The
palette follows the system's `prefers-color-scheme`; if your app has its own light/dark
switch, pass it as the `colorScheme` prop (`'light' | 'dark' | 'auto'`). To change the
colours, override any of `--sh-code-keyword`, `-string`, `-comment`, `-number`,
`-function`, `-builtin`, `-type`, `-attr`, `-variable`, `-meta`, `-tag`, `-operator`,
`-addition` and `-deletion` on `.sh-root`.

`shuttle-editor/styles.css` imports KaTeX's stylesheet itself, so math renders without
extra setup (your bundler needs to resolve CSS `@import`, as Vite, webpack and Next.js
do).

## Keyboard shortcuts

`Ctrl` is `Cmd` on macOS. Block shortcuts work in notepad mode only.

| Action | Default | Id |
|---|---|---|
| Bold | `Ctrl+B` | `editor.bold` |
| Italic | `Ctrl+I` | `editor.italic` |
| Underline | `Ctrl+U` | `editor.underline` |
| Inline code | `Ctrl+E` | `editor.inlineCode` |
| Strikethrough | `Ctrl+Shift+X` | `editor.strike` |
| Highlight | `Ctrl+Shift+H` | `editor.highlight` |
| Heading 1 | `Ctrl+Alt+1` | `editor.heading1` |
| Heading 2 | `Ctrl+Alt+2` | `editor.heading2` |
| Heading 3 | `Ctrl+Alt+3` | `editor.heading3` |
| Bullet list | `Ctrl+Shift+8` | `editor.bulletList` |
| Ordered list | `Ctrl+Shift+7` | `editor.orderedList` |
| Task list | `Ctrl+Shift+9` | `editor.taskList` |
| Check / uncheck task (caret in a task item) | `Ctrl+Enter` | `editor.toggleTask` |
| Blockquote | `Ctrl+Shift+B` | `editor.blockquote` |
| Code block | `Ctrl+Alt+C` | `editor.codeBlock` |
| Insert divider | unbound | `editor.divider` |
| Find and replace | `Ctrl+F` | `editor.find` |
| Move block up | `Alt+Up` | `block.moveUp` |
| Move block down | `Alt+Down` | `block.moveDown` |
| Duplicate block | `Ctrl+Shift+D` | `block.duplicate` |
| Delete block | `Ctrl+Shift+Backspace` | `block.delete` |
| Insert block reference | unbound | `block.insertRef` |

Override any of them through `host.keybindings`, using the id and an accelerator string
where `Mod` means Ctrl (Cmd on macOS); an empty string removes a binding:

```ts
const host: ShuttleHost = {
  // …
  keybindings: { 'editor.highlight': 'Mod+Alt+H', 'block.insertRef': 'Mod+Shift+R', 'editor.find': '' },
};
```

For a settings screen, `SHUTTLE_KEYBINDINGS` lists every shortcut with its label,
group and default; `eventToAccel(keyboardEvent)` turns a key press into an accelerator
string for a shortcut recorder, and `formatAccel(accel)` renders one for display.

## Markdown

Markdown is how you type and paste, not how documents are stored.

- **Typing** — markdown shortcuts turn into formatting as you type: `#`, `-`, `1.`,
  `[ ]`, `>`, ```` ``` ````, `---`, `**bold**`, `*italic*`, `` `code` ``, `==highlight==`,
  `$$x^2$$` (inline math), `[[Note]]`.
- **Pasting** — plain text that looks like markdown is converted into real content,
  including text copied from code editors such as VS Code, which put a styled copy of
  the plain text on the clipboard. Rich HTML (a web page, a word processor) keeps its
  own formatting, and syntax-highlighted code snippets stay code. **Shift+paste**
  always pastes literal text.
- **Copying** — a selection spanning several blocks is copied as markdown, so lists and
  tables survive a paste into another app; a selection inside one block copies plain
  text.
- Shuttle's own syntax: `[[Note|alias]]` for wiki links, `:::details` for toggles and
  `![[noteId#blockId]]` for block references.

Markdown can't represent everything a document holds: subscript, superscript, the
alignment of display math, YouTube and Twitch embeds, fragment links (only their label
is kept) and block ids are lost when content is copied out as markdown. The stored
JSON keeps all of them.

## Try it

The repository uses pnpm 11 (pinned in `package.json`); `corepack enable` installs the
right version for you.

```bash
git clone https://github.com/cord-note/shuttle.git
cd shuttle
corepack enable
pnpm install
pnpm playground
```

Then open http://localhost:5199 — the playground runs the editor against
`createFakeHost()`, with three linked notes and a mode switch.

*Planned: graphs & datasets, drawing canvases, speech-to-text.*

## License

Copyright (C) 2026 Aleksander Sprengel

[AGPL-3.0-or-later](./LICENSE). If you ship an app that includes Shuttle — including
a web app people use over a network, which the AGPL treats the same as distributing
it — you must make that app's complete source code available to its users under the
AGPL. This summary is not legal advice.
