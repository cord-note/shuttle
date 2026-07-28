import { useState, useRef, useEffect } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useNoteStore } from '../../store/notes';

export default function WikiLinkView({ node, updateAttributes }: NodeViewProps) {
  const { setActiveNote, loadLinks } = useNoteStore();
  const label: string       = node.attrs.label       || 'Untitled';
  const displayText: string = node.attrs.displayText || label;

  const [editing, setEditing]   = useState(false);
  const [draft, setDraft]       = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(node.attrs.displayText || label);
      requestAnimationFrame(() => {
        inputRef.current?.select();
      });
    }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  function navigate(e: React.MouseEvent) {
    e.preventDefault();
    if (!editing && node.attrs.id) {
      setActiveNote(node.attrs.id);
      loadLinks(node.attrs.id);
    }
  }

  function startEdit(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setEditing(true);
  }

  function commitEdit() {
    const trimmed = draft.trim();
    updateAttributes({ displayText: trimmed && trimmed !== label ? trimmed : null });
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter')  { e.preventDefault(); commitEdit(); }
    if (e.key === 'Escape') { setEditing(false); }
  }

  if (editing) {
    return (
      <NodeViewWrapper as="span" style={{ display: 'inline' }}>
        <input
          ref={inputRef}
          className="wiki-link-edit"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          contentEditable={false}
        />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper as="span" style={{ display: 'inline' }}>
      <span
        className="wiki-link"
        contentEditable={false}
        onClick={navigate}
        onDoubleClick={startEdit}
        title={
          node.attrs.displayText
            ? `${displayText} → ${label}`
            : `Open: ${label}`
        }
      >
        {displayText}
      </span>
    </NodeViewWrapper>
  );
}
