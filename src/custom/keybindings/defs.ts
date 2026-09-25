/**
 * Shuttle's editor keybindings. The host stores user overrides and passes them
 * in `ShuttleHost.keybindings`; Shuttle owns the ids, labels and defaults.
 *
 * Accelerators are canonical strings: modifiers in a fixed order joined with
 * '+', e.g. `Mod+Shift+D`. `Mod` is Cmd on macOS and Ctrl elsewhere.
 */

export const IS_MAC: boolean =
  typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

export type KeybindingId =
  | 'editor.bold'
  | 'editor.italic'
  | 'editor.underline'
  | 'editor.inlineCode'
  | 'editor.strike'
  | 'editor.highlight'
  | 'editor.heading1'
  | 'editor.heading2'
  | 'editor.heading3'
  | 'editor.bulletList'
  | 'editor.orderedList'
  | 'editor.taskList'
  | 'editor.toggleTask'
  | 'editor.blockquote'
  | 'editor.codeBlock'
  | 'editor.divider'
  | 'editor.find'
  | 'block.moveUp'
  | 'block.moveDown'
  | 'block.duplicate'
  | 'block.delete'
  | 'block.insertRef';

export interface KeybindingDef {
  id: KeybindingId;
  label: string;
  group: 'Editor' | 'Blocks';
  /** Empty string means "no default binding". */
  defaultAccel: string;
  /** Only active in notepad mode. */
  notepadOnly?: true;
  hint?: string;
}

export const SHUTTLE_KEYBINDINGS: readonly KeybindingDef[] = [
  { id: 'editor.bold',        label: 'Bold',           group: 'Editor', defaultAccel: 'Mod+B' },
  { id: 'editor.italic',      label: 'Italic',         group: 'Editor', defaultAccel: 'Mod+I' },
  { id: 'editor.underline',   label: 'Underline',      group: 'Editor', defaultAccel: 'Mod+U' },
  { id: 'editor.inlineCode',  label: 'Inline code',    group: 'Editor', defaultAccel: 'Mod+E' },
  { id: 'editor.strike',      label: 'Strikethrough',  group: 'Editor', defaultAccel: 'Mod+Shift+X' },
  { id: 'editor.highlight',   label: 'Highlight',      group: 'Editor', defaultAccel: 'Mod+Shift+H' },
  { id: 'editor.heading1',    label: 'Heading 1',      group: 'Editor', defaultAccel: 'Mod+Alt+1' },
  { id: 'editor.heading2',    label: 'Heading 2',      group: 'Editor', defaultAccel: 'Mod+Alt+2' },
  { id: 'editor.heading3',    label: 'Heading 3',      group: 'Editor', defaultAccel: 'Mod+Alt+3' },
  { id: 'editor.bulletList',  label: 'Bullet list',    group: 'Editor', defaultAccel: 'Mod+Shift+8' },
  { id: 'editor.orderedList', label: 'Ordered list',   group: 'Editor', defaultAccel: 'Mod+Shift+7' },
  { id: 'editor.taskList',    label: 'Task list',      group: 'Editor', defaultAccel: 'Mod+Shift+9' },
  { id: 'editor.toggleTask',  label: 'Check / uncheck task', group: 'Editor', defaultAccel: 'Mod+Enter',
    hint: 'Only while the caret is in a task item' },
  { id: 'editor.blockquote',  label: 'Blockquote',     group: 'Editor', defaultAccel: 'Mod+Shift+B' },
  { id: 'editor.codeBlock',   label: 'Code block',     group: 'Editor', defaultAccel: 'Mod+Alt+C' },
  { id: 'editor.divider',     label: 'Insert divider', group: 'Editor', defaultAccel: '' },
  { id: 'editor.find',        label: 'Find and replace', group: 'Editor', defaultAccel: 'Mod+F' },
  { id: 'block.moveUp',    label: 'Move block up',          group: 'Blocks', defaultAccel: 'Alt+ArrowUp',         notepadOnly: true },
  { id: 'block.moveDown',  label: 'Move block down',        group: 'Blocks', defaultAccel: 'Alt+ArrowDown',       notepadOnly: true },
  { id: 'block.duplicate', label: 'Duplicate block',        group: 'Blocks', defaultAccel: 'Mod+Shift+D',         notepadOnly: true },
  { id: 'block.delete',    label: 'Delete block',           group: 'Blocks', defaultAccel: 'Mod+Shift+Backspace', notepadOnly: true },
  { id: 'block.insertRef', label: 'Insert block reference', group: 'Blocks', defaultAccel: '',                    notepadOnly: true },
];

export type KeybindingMap = Record<KeybindingId, string>;

/** Defaults with the host's overrides laid over them. */
export function resolveBindings(overrides: Partial<KeybindingMap>): KeybindingMap {
  const out = {} as KeybindingMap;
  for (const def of SHUTTLE_KEYBINDINGS) out[def.id] = overrides[def.id] ?? def.defaultAccel;
  return out;
}

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'CapsLock', 'Dead']);

type KeyEventLike = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>;

/** Canonical accelerator for a key event, or null for a bare modifier press. */
export function eventToAccel(e: KeyEventLike, mac: boolean = IS_MAC): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;

  const parts: string[] = [];
  if (mac ? e.metaKey : e.ctrlKey) parts.push('Mod');
  if (mac && e.ctrlKey) parts.push('Ctrl');
  if (!mac && e.metaKey) parts.push('Meta');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(key);
  return parts.join('+');
}

const DISPLAY_KEYS: Record<string, string> = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Enter: '⏎', Backspace: '⌫', Escape: 'Esc',
};

/** Human-readable accelerator for buttons and menus. */
export function formatAccel(accel: string, mac: boolean = IS_MAC): string {
  if (!accel) return '';
  const parts = accel.split('+').map((p) => {
    if (p === 'Mod') return mac ? '⌘' : 'Ctrl';
    if (p === 'Alt') return mac ? '⌥' : 'Alt';
    if (p === 'Shift') return mac ? '⇧' : 'Shift';
    if (p === 'Ctrl') return mac ? '⌃' : 'Ctrl';
    if (p === 'Meta') return mac ? '⌘' : 'Win';
    return DISPLAY_KEYS[p] ?? p;
  });
  return mac ? parts.join('') : parts.join('+');
}
