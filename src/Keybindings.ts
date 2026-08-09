import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import {
  KEYBINDINGS,
  eventToAccel,
  useKeybindingStore,
  type KeybindingId,
} from '@renderer/store/keybindings';
import { OPEN_REF_PICKER_EVENT } from './blockTarget';

/**
 * Applies the user's editor-scope keybindings inside ProseMirror.
 *
 * Runs at a high priority so its plugin sits ahead of every keymap Tiptap
 * installs — otherwise a rebound chord would still hit the built-in handler
 * first. It also swallows a *displaced* default: if Bold has been moved off
 * Mod+B, Mod+B must do nothing rather than quietly keep working through
 * StarterKit's own keymap.
 */

const EDITOR_ACTIONS = KEYBINDINGS.filter((d) => d.scope === 'editor');

/** Runs an action, returning false when it does not apply in this context. */
function runAction(editor: Editor, id: KeybindingId, isNotepad: boolean): boolean {
  const chain = () => editor.chain().focus();

  switch (id) {
    case 'editor.bold':       return chain().toggleBold().run();
    case 'editor.italic':     return chain().toggleItalic().run();
    case 'editor.inlineCode': return chain().toggleCode().run();
    case 'editor.strike':     return chain().toggleStrike().run();
    case 'editor.heading1':   return chain().toggleHeading({ level: 1 }).run();
    case 'editor.heading2':   return chain().toggleHeading({ level: 2 }).run();
    case 'editor.heading3':   return chain().toggleHeading({ level: 3 }).run();
    case 'editor.bulletList': return chain().toggleBulletList().run();
    case 'editor.orderedList':return chain().toggleOrderedList().run();
    case 'editor.taskList':   return chain().toggleTaskList().run();
    case 'editor.blockquote': return chain().toggleBlockquote().run();
    case 'editor.codeBlock':  return chain().toggleCodeBlock().run();

    case 'editor.toggleTask': {
      if (!editor.isActive('taskItem')) return false;
      const { checked } = editor.getAttributes('taskItem');
      return editor.commands.updateAttributes('taskItem', { checked: !checked });
    }

    case 'editor.divider':
      // In a notepad a divider is its own block; setHorizontalRule would try to
      // place one inside the current block, where it cannot go.
      if (isNotepad) {
        return chain().command(({ commands, state }) =>
          commands.replaceBlockWith(state.selection.from, [{ type: 'horizontalRule' }]),
        ).run();
      }
      return chain().setHorizontalRule().run();

    case 'block.moveUp':    return editor.commands.moveBlock(editor.state.selection.from, -1);
    case 'block.moveDown':  return editor.commands.moveBlock(editor.state.selection.from, 1);
    case 'block.duplicate': return editor.commands.duplicateBlock(editor.state.selection.from);
    case 'block.delete':    return editor.commands.deleteBlock(editor.state.selection.from);
    case 'block.insertRef':
      // The picker is a React modal; the editor can only ask for one.
      window.dispatchEvent(new CustomEvent(OPEN_REF_PICKER_EVENT));
      return true;

    default:
      return false;
  }
}

export interface KeybindingsOptions {
  isNotepad: boolean;
}

export const Keybindings = Extension.create<KeybindingsOptions>({
  name: 'keybindings',

  // Above every keymap Tiptap registers (default priority is 100), so the
  // user's binding is consulted before the built-in one.
  priority: 1000,

  addOptions() {
    return { isNotepad: false };
  },

  addProseMirrorPlugins() {
    const { isNotepad } = this.options;
    const editor = this.editor;

    return [
      new Plugin({
        key: new PluginKey('keybindings'),
        props: {
          handleKeyDown(_view, event) {
            const accel = eventToAccel(event);
            if (!accel) return false;

            const { bindings } = useKeybindingStore.getState();

            for (const def of EDITOR_ACTIONS) {
              if (bindings[def.id] !== accel) continue;
              if (def.notepadOnly && !isNotepad) continue;
              if (!runAction(editor, def.id, isNotepad)) continue;
              event.preventDefault();
              return true;
            }

            // Nothing is bound here now, but something used to be: stop the
            // built-in keymap from honouring a binding the user moved away.
            const displaced = EDITOR_ACTIONS.some(
              (def) =>
                def.defaultAccel === accel &&
                bindings[def.id] !== accel &&
                (!def.notepadOnly || isNotepad),
            );
            if (displaced) {
              event.preventDefault();
              return true;
            }

            return false;
          },
        },
      }),
    ];
  },
});
