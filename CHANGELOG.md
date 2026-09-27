# Changelog

## 0.2.2

- The slash menu and `[[` autocomplete follow the caret when the page or a host's
  scroll container scrolls, hide while the caret is out of view, and flip above it
  based on their real height.
- The formula editor opens as a popover under the formula instead of a box in the
  middle of the window, follows it while scrolling, and closes on an outside click.
- The formatting toolbar stays in view (`position: sticky`) while the document scrolls.
- Task checkboxes are drawn from the theme (`--accent`, `--text-muted`), so they
  match light and dark themes instead of showing the native control.
- New `spellCheck` prop to turn the browser's spell checking on or off.

## 0.2.1

- The editor's commands are typed for hosts. The published declarations now include
  Shuttle's own commands (`moveBlock`, `duplicateBlock`, `deleteBlock`, `turnInto`,
  `insertBlockRef` and the math commands) and every official extension's
  (`toggleBold`, `toggleHeading`, `toggleTaskList`, `toggleHighlight`, …), so code
  using the `Editor` from `onReady` typechecks.
- New type exports: `BlockRefAttrs`, `BlockMathAlign`, `TurnIntoType`.

## 0.2.0

- `shuttle-editor/doc`: a React-free entry for servers and workers, with `nodeText`,
  `topLevelBlocks`, `wikiLinkTargets`, `fragmentLinkIds` and `findTopLevelBlock` over
  stored documents.
- Built-in light and dark code highlighting. The new `colorScheme` prop
  (`'light' | 'dark' | 'auto'`) picks the palette, and the `--sh-code-*` variables
  override its colours. Code uses `--font-mono`.
- `onReady` also receives `ShuttleControls` (`openRefPicker`, `openFind`, `pickImage`),
  so hosts can open Shuttle's dialogs from their own menus.
- The `twitch` prop: `false` stops pasted Twitch links from becoming embeds, while stored
  embeds still load.
- CI uses `actions/checkout@v5` and `actions/setup-node@v5`.

## 0.1.0

First public release, published to npm as `shuttle-editor` and to GitHub Packages as
`@cord-note/shuttle`.

Shuttle is rebuilt on official Tiptap 3 extensions. This release includes:

- `ShuttleEditor`, a React component with a debounced save that never drops an edit,
  and the `ShuttleHost` adapter through which an app supplies notes, files and
  navigation. `createFakeHost()` provides an in-memory host for trying it out.
- Wiki links (`[[Note]]`, `[[Note|alias]]`) with autocomplete and unlinked-mention
  highlighting.
- Notepad mode: stable block ids, drag handles, a block menu and block shortcuts.
- Read-only block transclusion by reference.
- Inline and display math (KaTeX), tables, toggles, task lists, highlight,
  subscript/superscript and syntax-highlighted code blocks.
- Find & replace, a heading outline panel, a slash menu and a selection toolbar.
- Image uploads by paste, drop or picker; YouTube and Twitch embeds.
- Markdown shortcuts while typing, markdown paste (including from code editors) and
  markdown copy.
- Rebindable keyboard shortcuts.
- Theming through CSS variables.
- Documents that don't match the schema open read-only and are never overwritten.
