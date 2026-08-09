// Registers a DOM so Tiptap's `Editor` can be constructed under `bun test`.
//
// An `EditorState` needs no DOM, but an `Editor` creates an `EditorView`, which
// does — and the block keymap and commands can only be exercised through a real
// editor. Imported for its side effect by the tests that need it.
//
// Registration must happen before any editor is constructed, not before the
// imports: Tiptap and ProseMirror touch `document` when a view is created, not
// at module evaluation.
import { GlobalRegistrator } from '@happy-dom/global-registrator';

if (typeof globalThis.document === 'undefined') {
  GlobalRegistrator.register();
}
