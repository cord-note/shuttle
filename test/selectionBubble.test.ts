import { describe, it, expect } from 'bun:test';
import { NodeSelection } from '@tiptap/pm/state';
import { shouldShowBubble } from '../src/ui/SelectionBubble';
import { makeEditor } from './helpers';

describe('shouldShowBubble', () => {
  it('is false for a NodeSelection, e.g. a selected math block', () => {
    const { editor } = makeEditor({ content: { type: 'doc', content: [{ type: 'blockMath', attrs: { latex: 'x' } }, { type: 'paragraph' }] } });
    const pos = 0;
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));
    const state = editor.state;
    expect(shouldShowBubble({ editor, state, from: state.selection.from, to: state.selection.to })).toBe(false);
    editor.destroy();
  });

  it('is true for a non-empty TextSelection in an editable, non-code-block editor', () => {
    const { editor } = makeEditor({ content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }] } });
    editor.commands.setTextSelection({ from: 1, to: 4 });
    const state = editor.state;
    expect(shouldShowBubble({ editor, state, from: state.selection.from, to: state.selection.to })).toBe(true);
    editor.destroy();
  });

  it('is false for an empty selection', () => {
    const { editor } = makeEditor({ content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }] } });
    editor.commands.setTextSelection(1);
    const state = editor.state;
    expect(shouldShowBubble({ editor, state, from: state.selection.from, to: state.selection.to })).toBe(false);
    editor.destroy();
  });
});
