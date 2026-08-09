# Making Shuttle a package Cord consumes

Right now `src/` is a **copy** of `cord/apps/desktop/src/renderer/components/editor/`,
not a library. It does not typecheck standalone, and it cannot, because eleven
of its files import Cord's Zustand stores and IPC client directly.

This is the work to change that. The ordering matters: steps 1–3 are what make
the package possible at all, and nothing after step 4 is worth starting before
they are done.

## The actual problem

Shuttle currently reaches *up* into the application that hosts it:

| Import | Files | What it is used for |
|---|---|---|
| `../../store/notes` | 11 | note lookup by title, active note id, link bookkeeping |
| `../../store/fragments` | 4 | per-block tag/link annotations, pending scroll target |
| `@renderer/ipc` | 4 | `api.links.create/delete`, `api.fragments.deleteLink` |
| `../../store/vaults`, `../../store/tags` | 1 each | tag picker in the context menu |
| `@renderer/store/keybindings` | 1 | editor shortcut lookup (`Keybindings.ts`) |
| `@shared/types` | 9 | `Note`, `NoteKind`, `Block`, `BlockRefTarget` |
| `@shared/constants` | 5 | `BLOCK_NODE_NAME`, `BLOCK_CONTENT_TYPES`, `ANNOTATABLE_TYPES` |
| `@shared/blockDoc` | 1 | doc parsing helpers (copied to `src/shared/`) |

A library that imports its host's global state is not a library. Every one of
these has to become something the host *passes in*.

---

## 1. Define the host interface

- [ ] Write `src/host.ts` declaring what Shuttle needs from whoever embeds it.
      Keep it narrow — this is the contract, and every method is a thing Cord
      must implement forever.

```ts
export interface ShuttleHost {
  /** Resolve a [[wiki link]] title to a note, for autocomplete and pills. */
  findNoteByTitle(title: string): Promise<ShuttleNoteRef | null>;
  /** Titles for the autocomplete list. */
  searchNotes(query: string): Promise<ShuttleNoteRef[]>;
  /** Navigate — clicking a link or a transclusion header. */
  openNote(id: string, blockId?: string): void;
  links: { create(from: string, to: string): Promise<void>;
           delete(from: string, to: string): Promise<void> };
  fragments: { get(noteId: string): Promise<FragmentAnnotations>;
               deleteLink(id: string): Promise<void> };
  blocks: { resolveRef(blockId: string): Promise<ShuttleBlockTarget | null>;
            listForNote(noteId: string): Promise<ShuttleBlock[]> };
  /** Accelerator for an editor action, or '' when unbound. */
  keybinding(action: string): string;
}
```

- [ ] Decide the delivery mechanism. A React context (`<ShuttleProvider host={…}>`)
      reads best for the components, but Tiptap extensions are constructed
      outside React — `Keybindings.ts`, `WikiLink.ts` and `BlockRef.ts` all need
      the host at extension-build time, so it must **also** be passable through
      `buildExtensions(kind, host)`. Do both; do not make the extensions reach
      for a context they cannot see.

## 2. Own the types Shuttle actually needs

- [ ] Define `ShuttleNoteRef`, `ShuttleBlock`, `ShuttleBlockTarget` in
      `src/types.ts`. These are *not* Cord's `Note` and `Block` — Shuttle needs
      an id, a title and a kind, not `bodyJson`, `isPinned` or `deletedAt`.
      Keeping them separate is what stops Cord's schema from leaking into the
      editor's public API.
- [ ] Move `BLOCK_NODE_NAME`, `BLOCK_CONTENT_TYPES` and `ANNOTATABLE_TYPES` into
      `src/constants.ts` and **export them**. These are properties of the
      document schema, so they belong to Shuttle, and Cord should import them
      from here rather than the reverse.
- [ ] Keep `src/shared/blockDoc.ts` — it operates on the document, so it is
      Shuttle's. Cord imports it from the package afterwards.

## 3. Invert the eleven coupled files

One file at a time, each its own commit — a bulk rewrite of eleven files with
this much behaviour in them is not reviewable.

- [ ] `Keybindings.ts` — takes `host.keybinding(action)` instead of importing
      Cord's store. The action-id catalogue stays in Cord; Shuttle only asks
      "what is bound to `editor.bold`".
- [ ] `WikiLink.ts`, `WikiLinkView.tsx`, `WikiLinkList.tsx`, `WikiLinkPills.tsx`,
      `LinkPills.ts`, `UnlinkedMentionDecorations.ts` — note lookup and link
      writes go through `host`.
- [ ] `FragmentOverlay.tsx`, `FragmentLinkNode.tsx` — annotations through
      `host.fragments`.
- [ ] `BlockRefPicker.tsx`, `BlockRefView.tsx` — through `host.blocks`.
- [ ] `EditorContextMenu.tsx` — the worst one; it touches four stores. Consider
      splitting the tag-picker submenu into a `renderTagPicker` slot the host
      supplies, rather than teaching Shuttle about tags at all.
- [ ] `useNoteDoc.ts` — decide whether this belongs in Shuttle. It owns the
      save/debounce cycle and calls `updateNote`, which is application policy,
      not editor behaviour. **Recommend leaving it in Cord** and having Shuttle
      expose `onChange(doc)` instead.

## 4. Make it build on its own

- [ ] `pnpm typecheck` passes with zero `@renderer/*` and `@shared/*` imports
      left. Grep for them in CI — this is the invariant that keeps the package
      honest.
- [ ] `pnpm test` passes. The block tests came across; `__tests__/domSetup.ts`
      registers happy-dom and assumes `bun test`.
- [ ] Add a build. `tsc` alone will not handle the eleven CSS modules — use
      `tsup` or `vite build --lib` with `vite-plugin-lib-inject-css`, and ship
      `dist/` plus `.d.ts`. Decide whether consumers import
      `shuttle/styles.css` once or get CSS injected per component; injection is
      friendlier, a single stylesheet is easier to theme.
- [ ] CSS custom properties are the theming seam. Shuttle currently uses
      Cord's `--accent`, `--bg-input`, `--text-muted` and friends directly.
      Either document them as the required contract or prefix them
      (`--shuttle-accent`, falling back to `--accent`).

## 5. Publish and consume

- [ ] `package.json`: drop `"private": true`, set `name` (`@cord-note/shuttle`
      if the bare `shuttle` name is taken on npm — check first), `version`,
      `license` (AGPL-3.0-or-later, matching Cord), `repository`, `files`,
      `main`/`module`/`types`/`exports`.
- [ ] Keep `react`, `react-dom` and **all `@tiptap/*`** as peer dependencies.
      Two copies of `@tiptap/core` in one app produce a second ProseMirror
      schema registry and the failure mode is baffling — nodes silently refuse
      to parse.
- [ ] In Cord: add the dependency, delete
      `apps/desktop/src/renderer/components/editor/`, and repoint imports.
      Nothing outside that directory should change except `Editor.tsx`.
- [ ] While iterating, use a pnpm workspace link or `pnpm add
      link:../shuttle` rather than publishing on every change.
- [ ] Cord's `blockDoc` imports move to the package; delete the copy in
      `apps/desktop/src/shared/`.

## 6. After the split

- [ ] Cord's CI cannot catch a Shuttle regression any more. Add a smoke test in
      Shuttle that mounts an editor and round-trips a notepad document.
- [ ] Version deliberately. Shuttle is pre-1.0 and Cord is its only consumer, so
      `0.x` with exact pins in Cord is fine; loose ranges will bite before the
      API settles.
- [ ] `BlockIndexService.reproject` in Cord parses `body_json` using the same
      node names Shuttle emits. That coupling is now cross-repo and invisible to
      both typecheckers — a renamed node type breaks the block index at runtime
      with no compile error. Export the node-name constants from Shuttle and
      have Cord import them, so at least the names are shared.

---

## Known state of this copy

- Files are a verbatim copy from Cord at the v1.6 notepad work. They do **not**
  typecheck here yet; steps 1–3 are what fix that.
- `src/index.ts` still exports the July baseline's surface and does not mention
  any of the block work.
- The older baseline files (`WikiLink.ts`, `Math.ts`, …) were overwritten with
  Cord's current versions, which have drifted since July.
