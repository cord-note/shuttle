import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
// Type-only: declares `toggleHighlight` on the command chain without loading the extension.
import type {} from '@tiptap/extension-highlight';
import type { ShuttleContextRef } from '../../context';
import type { ShuttleMode } from '../../host';
import { slashPluginKey } from '../slash/slash';
import { wikiLinkPluginKey } from '../links/wikiLink';
import { SHUTTLE_KEYBINDINGS, eventToAccels, resolveBindings, type KeybindingDef, type KeybindingId } from './defs';

/** Chords Tiptap itself relies on for non-catalogued behaviour; never swallowed. */
const NEVER_SWALLOW = new Set(['Mod+Enter']);

const hasExtension = (editor: Editor, name: string): boolean =>
  editor.extensionManager.extensions.some((x) => x.name === name);

/** Runs an action; false when it does not apply here, so the key falls through. */
function runAction(editor: Editor, ctx: ShuttleContextRef, id: KeybindingId): boolean {
  const chain = () => editor.chain().focus();
  const at = editor.state.selection.from;
  switch (id) {
    case 'editor.bold':        return chain().toggleBold().run();
    case 'editor.italic':      return chain().toggleItalic().run();
    case 'editor.underline':   return chain().toggleUnderline().run();
    case 'editor.inlineCode':  return chain().toggleCode().run();
    case 'editor.strike':      return chain().toggleStrike().run();
    case 'editor.highlight':   return hasExtension(editor, 'highlight') ? chain().toggleHighlight().run() : false;
    case 'editor.heading1':    return chain().toggleHeading({ level: 1 }).run();
    case 'editor.heading2':    return chain().toggleHeading({ level: 2 }).run();
    case 'editor.heading3':    return chain().toggleHeading({ level: 3 }).run();
    case 'editor.bulletList':  return chain().toggleBulletList().run();
    case 'editor.orderedList': return chain().toggleOrderedList().run();
    case 'editor.taskList':    return chain().toggleTaskList().run();
    case 'editor.blockquote':  return chain().toggleBlockquote().run();
    case 'editor.codeBlock':   return chain().toggleCodeBlock().run();
    case 'editor.divider':     return chain().setHorizontalRule().run();
    case 'editor.toggleTask': {
      if (!editor.isActive('taskItem')) return false;
      const checked = Boolean(editor.getAttributes('taskItem')['checked']);
      return editor.commands.updateAttributes('taskItem', { checked: !checked });
    }
    case 'editor.find':        ctx.current.events.openFind(); return true;
    case 'block.moveUp':       return editor.commands.moveBlock(at, -1);
    case 'block.moveDown':     return editor.commands.moveBlock(at, 1);
    case 'block.duplicate':    return editor.commands.duplicateBlock(at);
    case 'block.delete':       return editor.commands.deleteBlock(at);
    case 'block.insertRef':    ctx.current.events.openRefPicker(); return true;
  }
}

/**
 * Owns every editor shortcut so all of them are rebindable. Priority 1000
 * puts it ahead of Tiptap's own keymaps; a default the user moved away from
 * is swallowed rather than left working through the built-in keymap (except
 * chords in NEVER_SWALLOW, which Tiptap core also uses for other things).
 */
export function keybindings(ctx: ShuttleContextRef, mode: ShuttleMode) {
  return Extension.create({
    name: 'shuttleKeybindings',
    priority: 1000,
    addProseMirrorPlugins() {
      const editor = this.editor;
      const applies = (def: KeybindingDef): boolean => !def.notepadOnly || mode === 'notepad';
      return [
        new Plugin({
          key: new PluginKey('shuttleKeybindings'),
          props: {
            handleKeyDown(view, event) {
              // An open suggestion popup owns the keyboard (arrows, Enter, Escape).
              if (slashPluginKey.getState(view.state)?.active || wikiLinkPluginKey.getState(view.state)?.active) return false;
              const accels = eventToAccels(event);
              if (accels.length === 0) return false;
              const bindings = resolveBindings(ctx.current.host.keybindings);

              for (const def of SHUTTLE_KEYBINDINGS) {
                const bound = bindings[def.id];
                if (!bound || !accels.includes(bound) || !applies(def)) continue;
                if (!runAction(editor, ctx, def.id)) continue;
                event.preventDefault();
                return true;
              }

              const displaced = SHUTTLE_KEYBINDINGS.some(
                (def) => def.defaultAccel !== '' && accels.includes(def.defaultAccel)
                  && bindings[def.id] !== def.defaultAccel && applies(def)
                  && !NEVER_SWALLOW.has(def.defaultAccel),
              );
              if (displaced) { event.preventDefault(); return true; }
              return false;
            },
          },
        }),
      ];
    },
  });
}
