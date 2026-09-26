import { describe, it, expect, afterEach } from 'bun:test';
import { Editor, Extension, type AnyExtension, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { createFakeHost } from '../src/testing/fakeHost';
import { noopEvents, type ShuttleContextRef } from '../src/context';
import type { NoteRef } from '../src/host';
import { unlinkedMentions, UNLINKED_REFRESH_META } from '../src/custom/unlinkedMentions';
import { keybindings } from '../src/custom/keybindings/keybindings';
import { slashCommand, slashPluginKey } from '../src/custom/slash/slash';
import { filterSlashItems } from '../src/custom/slash/items';
import { BlockCommands } from '../src/custom/notepad/commands';

let editor: Editor | null = null;
afterEach(() => { editor?.destroy(); editor = null; });

function make(
  ctx: ShuttleContextRef,
  mode: 'note' | 'notepad' = 'note',
  content: string | JSONContent = '<p>Alpha meets Gamma Ray here</p>',
  extra: AnyExtension[] = [],
): Editor {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit, TaskList, TaskItem, BlockCommands, unlinkedMentions(ctx), keybindings(ctx, mode), slashCommand(ctx, mode), ...extra],
    content,
  });
  return editor;
}

const ctxWith = (overrides = {}, docKey = 'n-alpha'): ShuttleContextRef => {
  const host = createFakeHost();
  host.keybindings = overrides;
  return { current: { host, events: noopEvents, docKey } };
};

const press = (e: Editor, key: string, mods: Partial<KeyboardEventInit> = {}) =>
  e.view.someProp('handleKeyDown', (f) => f(e.view, new KeyboardEvent('keydown', { key, ...mods })));

describe('unlinked mentions', () => {
  it('highlights other notes named in the text, skipping the current note', () => {
    const e = make(ctxWith());
    expect(e.view.dom.innerHTML).toContain('unlinked-mention');
    expect(e.view.dom.querySelectorAll('.unlinked-mention').length).toBe(1); // "Gamma Ray", not "Alpha"
  });

  it('rebuilds when asked to refresh after the host note list changes', () => {
    const notes: NoteRef[] = [{ id: 'n-alpha', title: 'Alpha' }];
    const host = createFakeHost({ notes });
    const ctx: ShuttleContextRef = { current: { host, events: noopEvents, docKey: 'n-alpha' } };
    const e = make(ctx);
    expect(e.view.dom.querySelectorAll('.unlinked-mention').length).toBe(0);
    notes.push({ id: 'n-gamma', title: 'Gamma Ray' });
    e.view.dispatch(e.state.tr.setMeta(UNLINKED_REFRESH_META, true));
    expect(e.view.dom.querySelectorAll('.unlinked-mention').length).toBe(1);
  });

  it('prefers the longest matching title', () => {
    const host = createFakeHost({ notes: [{ id: 'g', title: 'Gamma' }, { id: 'gr', title: 'Gamma Ray' }] });
    const e = make({ current: { host, events: noopEvents, docKey: 'x' } });
    const marks = [...e.view.dom.querySelectorAll('.unlinked-mention')].map((m) => m.textContent);
    expect(marks).toEqual(['Gamma Ray']);
  });
});

describe('keybindings', () => {
  it('applies a default binding', () => {
    const e = make(ctxWith());
    e.commands.selectAll();
    press(e, 'b', { ctrlKey: true });
    expect(e.isActive('bold')).toBe(true);
  });

  it('honours an override and swallows the displaced default', () => {
    const e = make(ctxWith({ 'editor.bold': 'Mod+Shift+K' }));
    e.commands.selectAll();
    expect(press(e, 'b', { ctrlKey: true })).toBe(true);
    expect(e.isActive('bold')).toBe(false);
    press(e, 'k', { ctrlKey: true, shiftKey: true });
    expect(e.isActive('bold')).toBe(true);
  });

  it('ignores notepad-only bindings in note mode', () => {
    const e = make(ctxWith(), 'note');
    expect(press(e, 'ArrowDown', { altKey: true })).toBeFalsy();
  });

  it('matches Shift+digit shortcuts by physical key', () => {
    const e = make(ctxWith());
    e.commands.setTextSelection(2);
    press(e, '*', { ctrlKey: true, shiftKey: true, code: 'Digit8' });
    expect(e.state.doc.firstChild?.type.name).toBe('bulletList');
  });

  it('never swallows Mod+Enter, which Tiptap core relies on', () => {
    const e = make(ctxWith({ 'editor.toggleTask': 'Mod+Shift+Enter' }));
    e.commands.setTextSelection(2);
    // Our plugin alone must not handle it...
    const ours = e.state.plugins.find((pl) => (pl as unknown as { key: string }).key.startsWith('shuttleKeybindings'));
    const event = new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true });
    expect(ours?.props.handleKeyDown?.call(ours, e.view, event)).toBeFalsy();
    // ...so it falls through to Tiptap's own Mod-Enter (a hard break).
    press(e, 'Enter', { ctrlKey: true });
    expect(e.getJSON().content?.[0]?.content?.some((n) => n.type === 'hardBreak')).toBe(true);
  });
});

describe('slash menu', () => {
  it('offers the block reference only in notepads', () => {
    expect(filterSlashItems('block ref', 'note')).toEqual([]);
    expect(filterSlashItems('block ref', 'notepad').map((i) => i.title)).toEqual(['Block reference']);
  });

  it('opens when a / is inserted programmatically', () => {
    const e = make(ctxWith(), 'notepad');
    e.commands.setTextSelection(e.state.doc.content.size - 1);
    // Suggestion only triggers after a space or at line start.
    e.commands.insertContent(' /');
    expect(slashPluginKey.getState(e.state)?.active).toBe(true);
  });

  it('passes the document key with fragment actions', () => {
    const ctx = ctxWith({}, 'n-self');
    const testIds = Extension.create({
      name: 'testIds',
      addGlobalAttributes: () => [{ types: ['paragraph'], attributes: { blockId: { default: null } } }],
    });
    const e = make(ctx, 'note', {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { blockId: 'b1' }, content: [{ type: 'text', text: 'x' }] }],
    }, [testIds]);
    const item = filterSlashItems('tag', 'note').find((i) => i.title === 'Tag block');
    expect(item).toBeDefined();
    const pos = 2;
    e.commands.setTextSelection(pos);
    item!.run({ editor: e, range: { from: pos, to: pos }, ctx });
    const host = ctx.current.host as ReturnType<typeof createFakeHost>;
    expect(host.calls.fragmentActions).toEqual([{ docKey: 'n-self', type: 'tag', blockId: 'b1' }]);
  });
});
