import { describe, it, expect } from 'bun:test';
import {
  SHUTTLE_KEYBINDINGS, eventToAccel, formatAccel, resolveBindings,
} from '../src/custom/keybindings/defs';

const key = (k: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>> = {}) => ({
  key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods,
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
});

describe('formatAccel', () => {
  it('renders human labels on non-mac', () => {
    expect(formatAccel('Mod+Alt+ArrowUp', false)).toBe('Ctrl+Alt+↑');
  });
});
