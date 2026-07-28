import { useRef, useState } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import katex from 'katex';

function renderLatex(latex: string, displayMode: boolean): string {
  if (!latex.trim()) {
    return katex.renderToString('\\square', { throwOnError: false, displayMode });
  }
  try {
    return katex.renderToString(latex, { throwOnError: false, displayMode, output: 'html' });
  } catch {
    return `<span style="color:#ff6b6b;font-family:monospace">${latex}</span>`;
  }
}

export function MathInlineView({ node, updateAttributes }: NodeViewProps) {
  const [editing, setEditing] = useState(!node.attrs.latex);
  const [draft, setDraft] = useState<string>(node.attrs.latex ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  const html = renderLatex(node.attrs.latex ?? '', false);

  function commit() {
    updateAttributes({ latex: draft });
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      commit();
    }
  }

  return (
    <NodeViewWrapper as="span" style={{ display: 'inline' }}>
      {editing ? (
        <input
          ref={inputRef}
          autoFocus
          className="math-input-inline"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          placeholder="LaTeX formula…"
          spellCheck={false}
        />
      ) : (
        <span
          className="math-inline"
          contentEditable={false}
          onDoubleClick={() => { setDraft(node.attrs.latex ?? ''); setEditing(true); }}
          dangerouslySetInnerHTML={{ __html: html }}
          title="Double-click to edit"
        />
      )}
    </NodeViewWrapper>
  );
}

export function MathBlockView({ node, updateAttributes }: NodeViewProps) {
  const [editing, setEditing] = useState(!node.attrs.latex);
  const [draft, setDraft] = useState<string>(node.attrs.latex ?? '');
  const html = renderLatex(node.attrs.latex ?? '', true);

  function commit() {
    updateAttributes({ latex: draft });
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') { e.preventDefault(); commit(); }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); }
  }

  return (
    <NodeViewWrapper as="div">
      {editing ? (
        <textarea
          autoFocus
          className="math-input-block"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          placeholder="LaTeX formula… (Ctrl+Enter or Esc to confirm)"
          spellCheck={false}
          rows={3}
        />
      ) : (
        <div
          className="math-block"
          contentEditable={false}
          onDoubleClick={() => { setDraft(node.attrs.latex ?? ''); setEditing(true); }}
          dangerouslySetInnerHTML={{ __html: html }}
          title="Double-click to edit"
        />
      )}
    </NodeViewWrapper>
  );
}
