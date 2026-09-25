import { describe, it, expect } from 'bun:test';
import {
  SHUTTLE_KEYBINDINGS, eventToAccel, eventToAccels, formatAccel, resolveBindings,
  keybindingDef, KEYBINDING_GROUPS,
  type KeybindingId, type KeybindingMap,
} from '../src/custom/keybindings/defs';

const key = (
  k: string,
  mods: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>> = {},
  code = '',
) => ({
  key: k, code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods,
});

describe('eventToAccel', () => {
  it('maps the primary modifier to Mod per platform', () => {
    expect(eventToAccel(key('b', { ctrlKey: true }), false)).toBe('Mod+B');
    expect(eventToAccel(key('b', { metaKey: true }), true)).toBe('Mod+B');
  });
  it('orders modifiers canonically', () => {
    expect(eventToAccel(key('ArrowUp', { altKey: true, shiftKey: true, ctrlKey: true }), false))
      .toBe('Mod+Alt+Shift+ArrowUp');
  });
  it('ignores bare modifier presses', () => {
    expect(eventToAccel(key('Shift', { shiftKey: true }), false)).toBeNull();
  });
  it('normalizes the space key', () => {
    expect(eventToAccel(key(' ', { ctrlKey: true }), false)).toBe('Mod+Space');
  });
  it('ignores a Dead key from a compose sequence', () => {
    expect(eventToAccel(key('Dead', { altKey: true }), false)).toBeNull();
  });
  it('emits a separate Ctrl token on mac when Ctrl is held alongside Cmd', () => {
    expect(eventToAccel(key('k', { metaKey: true, ctrlKey: true }), true)).toBe('Mod+Ctrl+K');
  });
  it('emits a Meta token on non-mac when Meta (the OS/Win key) is held', () => {
    expect(eventToAccel(key('k', { metaKey: true }), false)).toBe('Meta+K');
  });

  it('falls back to the physical key for Shift+8 (key is "*")', () => {
    expect(eventToAccel(key('*', { ctrlKey: true, shiftKey: true }, 'Digit8'), false))
      .toBe('Mod+Shift+8');
  });
  it('falls back to the physical key for mac Option+1 (key is "¡")', () => {
    expect(eventToAccel(key('¡', { metaKey: true, altKey: true }, 'Digit1'), true))
      .toBe('Mod+Alt+1');
  });
  it('falls back to the physical key for a Cyrillic layout Ctrl+B (key is "и")', () => {
    expect(eventToAccel(key('и', { ctrlKey: true }, 'KeyB'), false)).toBe('Mod+B');
  });
  it('never reads Windows AltGr (ctrl+alt) as the physical Mod+Alt shortcut', () => {
    expect(eventToAccel(key('ć', { ctrlKey: true, altKey: true }, 'KeyC'), false))
      .toBe('Mod+Alt+Ć');
  });
});

describe('eventToAccels', () => {
  it('puts the physical-key accel before the key-based accel', () => {
    expect(eventToAccels(key('*', { ctrlKey: true, shiftKey: true }, 'Digit8'), false))
      .toEqual(['Mod+Shift+8', 'Mod+Shift+*']);
    expect(eventToAccels(key('¡', { metaKey: true, altKey: true }, 'Digit1'), true)[0])
      .toBe('Mod+Alt+1');
    expect(eventToAccels(key('и', { ctrlKey: true }, 'KeyB'), false)[0]).toBe('Mod+B');
  });
  it('excludes the physical-key candidate for AltGr, offering only the key-based accel', () => {
    const accels = eventToAccels(key('ć', { ctrlKey: true, altKey: true }, 'KeyC'), false);
    expect(accels).not.toContain('Mod+Alt+C');
    expect(accels).toEqual(['Mod+Alt+Ć']);
  });
  it('does not duplicate when no modifier is held (physical candidate is skipped)', () => {
    expect(eventToAccels(key('a', {}, 'KeyA'), false)).toEqual(['A']);
  });
  it('returns an empty array for a bare modifier press', () => {
    expect(eventToAccels(key('Shift', { shiftKey: true }), false)).toEqual([]);
    expect(eventToAccels(key('Dead', { altKey: true }), false)).toEqual([]);
  });
});

describe('resolveBindings', () => {
  it('overlays host overrides on defaults', () => {
    const b = resolveBindings({ 'editor.bold': 'Mod+Shift+B' });
    expect(b['editor.bold']).toBe('Mod+Shift+B');
    expect(b['editor.italic']).toBe('Mod+I');
  });
  it('covers every catalogue entry', () => {
    const b = resolveBindings({});
    for (const def of SHUTTLE_KEYBINDINGS) expect(b[def.id]).toBe(def.defaultAccel);
  });
  it('keeps an explicit empty-string override (a cleared binding)', () => {
    const b = resolveBindings({ 'editor.bold': '' });
    expect(b['editor.bold']).toBe('');
  });
  it('ignores a non-string override and falls back to the default', () => {
    const bad = { 'editor.bold': 42 } as unknown as Partial<KeybindingMap>;
    const b = resolveBindings(bad);
    expect(b['editor.bold']).toBe('Mod+B');
  });
});

describe('formatAccel', () => {
  it('renders human labels on non-mac', () => {
    expect(formatAccel('Mod+Alt+ArrowUp', false)).toBe('Ctrl+Alt+↑');
  });
  it('renders symbol glyphs on mac with no separators', () => {
    expect(formatAccel('Mod+Shift+D', true)).toBe('⌘⇧D');
  });
  it('renders a binding on the literal + key', () => {
    expect(formatAccel('Mod++', false)).toBe('Ctrl++');
  });
});

describe('keybindingDef', () => {
  it('returns the catalogue entry for a known id', () => {
    expect(keybindingDef('editor.bold').defaultAccel).toBe('Mod+B');
  });
  it('throws for an unknown id', () => {
    expect(() => keybindingDef('editor.nope' as unknown as KeybindingId)).toThrow();
  });
});

describe('KEYBINDING_GROUPS', () => {
  it('lists both groups', () => {
    expect(KEYBINDING_GROUPS).toEqual(['Editor', 'Blocks']);
  });
});
