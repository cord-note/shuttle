# Shuttle

The editor layer for [Cord](https://github.com/alexander-288/cord): [Tiptap](https://tiptap.dev) OSS (MIT) plus a **ghost-markdown** model — markdown syntax disappears as you type; storage is Tiptap JSON, and markdown is input UX only.

> **Status: extracted baseline, pre-rework.** This repo was seeded from Cord's in-tree editor (`apps/desktop/src/renderer/components/editor/`) so a significant rework can happen in isolation. It does **not** build standalone yet — see [Decoupling from Cord](#decoupling-from-cord).

## What's here

The seeded `src/` is the current editor as it lives in Cord:

| Area | Files |
|---|---|
| Slash command menu | `SlashCommand.tsx`, `SlashCommandList.tsx` (+ CSS) |
| Wiki links (`[[note]]`) | `WikiLink.ts`, `WikiLinkView.tsx`, `WikiLinkList.tsx`, `WikiLinkPills.tsx` (+ CSS) |
| Math (KaTeX) | `Math.ts`, `MathViews.tsx` |
| Fragments | `FragmentLinkNode.tsx`, `FragmentOverlay.tsx` (+ CSS) |
| Block identity | `BlockId.ts` |
| Task items | `CustomTaskItem.ts` |
| Unlinked mentions | `UnlinkedMentionDecorations.ts`, `LinkPills.ts` |
| Context menu | `EditorContextMenu.tsx` (+ CSS) |
| Markdown clipboard | `markdownClipboard.ts` (+ tests) |

## Frozen node types (v1)

`paragraph` · `heading` (h1–h3) · `bulletList` · `orderedList` · `listItem` · `blockquote` · `codeBlock` · `inlineCode` · `latex` (block KaTeX) · `inlineLatex` · `backlink` (`[[note]]`) · `horizontalRule` · `hardBreak` · `bold` · `italic` · `underline` · `strikethrough` · `link`

## Decoupling from Cord

The extraction is deliberate but incomplete. The seeded code still reaches into Cord internals, and severing these is the first job of the rework — Shuttle should depend on **injected interfaces**, not Cord modules:

- **`@shared/types`** — DTOs (e.g. note shapes) shared across Cord's IPC boundary. → define Shuttle's own minimal types or accept them as generics/props.
- **Zustand stores** — `../../store/{notes,vaults,tags,fragments}`. Editor nodes read app state directly (note lookups, fragment/tag data). → replace with a passed-in data provider / callbacks.
- **`../../ipc` (`api`)** — `WikiLink.ts` calls the sidecar for note search/resolution. → accept a `resolveLink` / `searchNotes` function from the host.

Everything else (`@tiptap/*`, `katex`, `marked`, `turndown`, `lucide-react`, `nanoid`) is a normal external dependency and already declared in `package.json`.

## Develop

```bash
pnpm install     # or bun install
pnpm typecheck
pnpm test        # bun test
```

`react` / `react-dom` are peer dependencies — provided by the host app (Cord) rather than bundled.

## License

Editor built on Tiptap OSS (MIT). This repository is private / all rights reserved.
