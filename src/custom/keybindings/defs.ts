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

export type KeybindingGroup = 'Editor' | 'Blocks';

export const KEYBINDING_GROUPS: readonly KeybindingGroup[] = ['Editor', 'Blocks'];

export interface KeybindingDef {
  id: KeybindingId;
  label: string;
  group: KeybindingGroup;
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

/** The catalogue entry for `id`. Throws if `id` is not a known keybinding. */
export function keybindingDef(id: KeybindingId): KeybindingDef {
  const def = SHUTTLE_KEYBINDINGS.find((d) => d.id === id);
  if (!def) throw new Error(`Unknown keybinding id: ${id}`);
  return def;
}

export type KeybindingMap = Record<KeybindingId, string>;

/**
 * Defaults with the host's overrides laid over them. An override that is not
 * a string (e.g. corrupted settings JSON) is ignored and the default is used
 * instead; an explicit empty-string override is kept as-is — it represents a
 * binding the user cleared.
 */
export function resolveBindings(overrides: Partial<KeybindingMap>): KeybindingMap {
  const out = {} as KeybindingMap;
  for (const def of SHUTTLE_KEYBINDINGS) {
    const v = overrides[def.id];
    out[def.id] = typeof v === 'string' ? v : def.defaultAccel;
  }
  return out;
}

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'CapsLock', 'Dead']);

type KeyEventLike = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>;

function normalizeKey(key: string): string {
  if (key === ' ') return 'Space';
  return key.length === 1 ? key.toUpperCase() : key;
}

function modifierParts(e: KeyEventLike, mac: boolean): string[] {
  const parts: string[] = [];
  if (mac ? e.metaKey : e.ctrlKey) parts.push('Mod');
  if (mac && e.ctrlKey) parts.push('Ctrl');
  if (!mac && e.metaKey) parts.push('Meta');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  return parts;
}

/** `code` -> the layout-independent character it represents, or null. */
function physicalKey(code: string): string | null {
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  return null;
}

/**
 * True when the combination is Right Alt (AltGr) rather than a genuine
 * Ctrl+Alt chord. Windows/Linux report AltGr as ctrlKey + altKey both true;
 * macOS has no AltGr, so this is always false there.
 */
function isAltGr(e: Pick<KeyEventLike, 'ctrlKey' | 'altKey'>, mac: boolean): boolean {
  return !mac && e.ctrlKey && e.altKey;
}

const USABLE_TYPED_KEY = /^[A-Z0-9]$/;

/**
 * The physical key (`e.code`) is only a fallback for when the *typed*
 * character is useless for matching a shortcut against — Shift+digit
 * symbols ('*' for Shift+8), mac Option characters ('¡' for Option+1), or a
 * non-Latin layout's letters ('и' for a Cyrillic Ctrl+B). Mirroring
 * prosemirror-keymap's approach: when `e.key` already normalizes to a plain
 * ASCII letter or digit, it is a perfectly good, layout-correct accelerator
 * on its own and the physical-key candidate is skipped — otherwise, on
 * Dvorak, Colemak, AZERTY and other remapped layouts, the physical position
 * would hijack a shortcut the user meant to type by character (Dvorak
 * Ctrl+X has the physical code of QWERTY's B, so a physical-first match
 * would fire "bold" instead of "cut"; AZERTY Ctrl+A would record as
 * Mod+Q). So the physical-key candidate is added only when: a physical key
 * exists, a ctrl/meta/alt modifier is held, the combination isn't AltGr
 * (see below), and the typed key is not already a usable ASCII
 * letter/digit. We then always fall back to the `e.key`-based accel so
 * still-unmapped combinations and non-letter/digit keys keep working.
 *
 * AltGr (Right Alt) is reported on Windows/Linux as ctrlKey + altKey, and
 * AltGr+<letter> commonly *types* an accented character on European layouts
 * (e.g. Polish AltGr+C -> 'ć'). That must never be read as the physical
 * shortcut Mod+Alt+C — the user typed a character, not a shortcut — so the
 * physical-key candidate is skipped whenever `isAltGr` is true and only the
 * (layout-specific) key-based accel is offered.
 */
export function eventToAccels(e: KeyEventLike, mac: boolean = IS_MAC): string[] {
  if (MODIFIER_KEYS.has(e.key)) return [];

  const mods = modifierParts(e, mac);
  const accels: string[] = [];

  const hasModifier = e.ctrlKey || e.metaKey || e.altKey;
  const phys = physicalKey(e.code);
  const typedKey = normalizeKey(e.key);
  if (phys && hasModifier && !isAltGr(e, mac) && !USABLE_TYPED_KEY.test(typedKey)) {
    accels.push([...mods, phys].join('+'));
  }

  const keyAccel = [...mods, typedKey].join('+');
  if (!accels.includes(keyAccel)) accels.push(keyAccel);

  return accels;
}

/**
 * The best single accelerator for a key event, or null for a bare modifier
 * press. Used by a host's shortcut recorder — the physical-key candidate is
 * preferred so recorded strings are layout-independent and match the
 * catalogue's defaults.
 */
export function eventToAccel(e: KeyEventLike, mac: boolean = IS_MAC): string | null {
  return eventToAccels(e, mac)[0] ?? null;
}

const DISPLAY_KEYS: Record<string, string> = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Enter: '⏎', Backspace: '⌫', Escape: 'Esc',
};

/** Human-readable accelerator for buttons and menus. */
export function formatAccel(accel: string, mac: boolean = IS_MAC): string {
  if (!accel) return '';
  // Lookahead requires a following character so a binding on the literal
  // '+' key (e.g. "Mod++") doesn't get split into an empty trailing part.
  const parts = accel.split(/\+(?=.)/).map((p) => {
    if (p === 'Mod') return mac ? '⌘' : 'Ctrl';
    if (p === 'Alt') return mac ? '⌥' : 'Alt';
    if (p === 'Shift') return mac ? '⇧' : 'Shift';
    if (p === 'Ctrl') return mac ? '⌃' : 'Ctrl';
    if (p === 'Meta') return mac ? '⌘' : 'Win';
    return DISPLAY_KEYS[p] ?? p;
  });
  return mac ? parts.join('') : parts.join('+');
}
