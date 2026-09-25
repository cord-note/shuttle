import { useEffect, useRef, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import type { ShuttleContextRef } from '../../context';

/** Long enough for the second click of a double-click to cancel navigation. */
const CLICK_DELAY_MS = 250;

/**
 * Click opens the linked note; double-click edits the alias in place.
 * The context ref arrives through the extension's options.
 */
export default function WikiLinkView({ node, updateAttributes, extension, editor }: NodeViewProps) {
  const ctx = (extension.options as { ctx: ShuttleContextRef }).ctx;
  const label = (node.attrs['label'] as string | null) ?? 'Untitled';
  const alias = node.attrs['displayText'] as string | null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set once the edit is closed, so Enter followed by the resulting blur commits once.
  const done = useRef(false);

  const cancelClick = (): void => {
    if (clickTimer.current !== null) clearTimeout(clickTimer.current);
    clickTimer.current = null;
  };

  useEffect(() => cancelClick, []);

  useEffect(() => {
    if (!editing) return;
    done.current = false;
    setDraft(alias ?? label);
    requestAnimationFrame(() => input.current?.select());
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = (save: boolean): void => {
    if (done.current) return;
    done.current = true;
    if (save) {
      const next = draft.trim();
      updateAttributes({ displayText: next && next !== label ? next : null });
    }
    setEditing(false);
    editor.commands.focus();
  };

  return (
    <NodeViewWrapper as="span" className="sh-wikilink" data-type="mention">
      {editing ? (
        <input
          ref={input}
          className="sh-wikilink-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => close(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); close(true); }
            if (e.key === 'Escape') { e.preventDefault(); close(false); }
          }}
        />
      ) : (
        <span
          className="sh-wikilink-label"
          role="link"
          tabIndex={-1}
          title={alias ? `${alias} → ${label}` : label}
          onClick={(e) => {
            e.preventDefault();
            const id = node.attrs['id'] as string | null;
            if (!id) return;
            cancelClick();
            clickTimer.current = setTimeout(() => {
              clickTimer.current = null;
              ctx.current.host.openNote(id);
            }, CLICK_DELAY_MS);
          }}
          onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            cancelClick();
            setEditing(true);
          }}
        >
          {alias ?? label}
        </span>
      )}
    </NodeViewWrapper>
  );
}
