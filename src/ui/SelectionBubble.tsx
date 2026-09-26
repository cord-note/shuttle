import { useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';
import { TextSelection } from '@tiptap/pm/state';
import { useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Link2, Unlink } from 'lucide-react';

/**
 * Whether the bubble should show: a non-empty text selection, in an editable,
 * non-code-block editor. A NodeSelection (e.g. a selected math block) never
 * shows it — formatting makes no sense there.
 */
export function shouldShowBubble({ editor, state, from, to }: { editor: Editor; state: EditorState; from: number; to: number }): boolean {
  return from !== to && editor.isEditable && !editor.isActive('codeBlock') && state.selection instanceof TextSelection;
}

/** Formatting and link editing over a text selection. */
export function SelectionBubble({ editor }: { editor: Editor }) {
  const [editingLink, setEditingLink] = useState(false);
  const [href, setHref] = useState('');
  const isLink = useEditorState({ editor, selector: ({ editor: e }) => e.isActive('link') });
  // Escape cancels; the blur that follows unmounting the input must not apply.
  const cancelled = useRef(false);

  const applyLink = (): void => {
    if (cancelled.current) { cancelled.current = false; return; }
    const url = href.trim();
    if (url) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    else editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setEditingLink(false);
  };

  return (
    <BubbleMenu
      editor={editor}
      className="sh-bubble"
      shouldShow={({ editor: e, state, from, to }) => shouldShowBubble({ editor: e, state, from, to })}
    >
      {editingLink ? (
        <input
          autoFocus
          className="sh-bubble-input"
          placeholder="https://…"
          value={href}
          onChange={(e) => setHref(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); applyLink(); }
            if (e.key === 'Escape') {
              e.preventDefault();
              cancelled.current = true;
              setEditingLink(false);
              editor.commands.focus();
            }
          }}
          onBlur={applyLink}
        />
      ) : (
        <>
          <button type="button" title="Bold" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }}><strong>B</strong></button>
          <button type="button" title="Italic" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }}><em>I</em></button>
          <button type="button" title="Highlight" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHighlight().run(); }}>==</button>
          <button
            type="button"
            title="Link"
            onMouseDown={(e) => {
              e.preventDefault();
              cancelled.current = false;
              setHref(String(editor.getAttributes('link')['href'] ?? ''));
              setEditingLink(true);
            }}
          >
            <Link2 size={13} strokeWidth={1.75} />
          </button>
          {isLink && (
            <button type="button" title="Remove link" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().unsetLink().run(); }}>
              <Unlink size={13} strokeWidth={1.75} />
            </button>
          )}
        </>
      )}
    </BubbleMenu>
  );
}
