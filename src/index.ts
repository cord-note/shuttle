// Hosts call commands on the Editor from `onReady`, and Tiptap types commands
// by augmenting `@tiptap/core` from each extension's declarations. A type is
// exported from every file declaring Shuttle's own commands so the declaration
// bundle keeps their augmentations; the official extensions' are referenced by
// the banner in tsup.config.ts.

export {
  ShuttleEditor, loadDocument, type ShuttleEditorProps, type ShuttleControls, type PickerOptions, type PickedBlock,
} from './ShuttleEditor';
export type { LineWidthRange } from './ui/Ruler';
export type {
  ShuttleHost, ShuttleMode, NoteRef, BlockSummary, ResolvedBlock, FragmentActionType, LogLevel,
} from './host';
export type { ShuttleContext, ShuttleContextRef, ShuttleUiEvents, MathEditRequest } from './context';
export { buildExtensions, type BuildOptions } from './extensions';
export { BLOCK_TYPES, BLOCK_ID_ATTRIBUTE } from './extensions/blockTypes';
export {
  SHUTTLE_KEYBINDINGS, KEYBINDING_GROUPS, keybindingDef, eventToAccel, eventToAccels, formatAccel, resolveBindings,
  type KeybindingId, type KeybindingDef, type KeybindingMap, type KeybindingGroup,
} from './custom/keybindings/defs';
export { isValidDoc, EMPTY_DOC } from './doc/validate';
export { topLevelAt, blockIdAt } from './doc/topLevel';
export { toStoredJson } from './doc/persist';
export { UNLINKED_REFRESH_META } from './custom/unlinkedMentions';
export type { FragmentLinkAttrs } from './custom/links/fragmentLink';
export type { BlockRefAttrs } from './custom/blockRef/blockRef';
export type { BlockMathAlign } from './custom/math/blockMath';
export type { TurnIntoType } from './custom/notepad/commands';
export { createFakeHost, type FakeHost, type FakeHostOptions } from './testing/fakeHost';
export type { Editor, JSONContent } from '@tiptap/core';
