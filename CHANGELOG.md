# Changelog

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
