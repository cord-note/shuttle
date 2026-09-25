import { useEffect, useRef, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import type { ShuttleContextRef } from '../../context';

/**
 * Click opens the linked note; double-click edits the alias in place.
 * The context ref arrives through the extension's options.
 */
export default function WikiLinkView({ node, updateAttributes, extension }: NodeViewProps) {
  const ctx = (extension.options as { ctx: ShuttleContextRef }).ctx;
  const label = (node.attrs['label'] as string | null) ?? 'Untitled';
  const alias = node.attrs['displayText'] as string | null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    setDraft(alias ?? label);
    requestAnimationFrame(() => input.current?.select());
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (): void => {
    const next = draft.trim();
    updateAttributes({ displayText: next && next !== label ? next : null });
    setEditing(false);
  };

  return (
    <NodeViewWrapper as="span" className="sh-wikilink" data-type="mention">
      {editing ? (
        <input
          ref={input}
          className="sh-wikilink-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
          }}
        />
      ) : (
        <span
          className="sh-wikilink-label"
          title={alias ? `${alias} → ${label}` : label}
          onClick={(e) => {
            e.preventDefault();
            const id = node.attrs['id'] as string | null;
            if (id) ctx.current.host.openNote(id);
          }}
          onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditing(true); }}
        >
          {alias ?? label}
        </span>
      )}
    </NodeViewWrapper>
  );
}
