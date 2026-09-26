import { useMemo, useState } from 'react';
import type { Editor } from '@tiptap/core';
import katex from 'katex';
import type { MathEditRequest } from '../context';

const nodeName = (kind: MathEditRequest['kind']): string => (kind === 'inline' ? 'inlineMath' : 'blockMath');

/**
 * Edit a math node's LaTeX with a live preview. Saving empty input deletes
 * the node; cancelling a node that is still empty (freshly inserted) does too.
 */
export function MathEditor({ editor, request, onClose }: { editor: Editor; request: MathEditRequest; onClose: () => void }) {
  const [latex, setLatex] = useState(request.latex);
  const preview = useMemo(
    () => katex.renderToString(latex || '\\;', { throwOnError: false, displayMode: request.kind === 'block' }),
    [latex, request.kind],
  );

  /** The target node, if it is still the math node the request names. */
  const target = () => {
    const node = editor.state.doc.nodeAt(request.pos);
    return node && node.type.name === nodeName(request.kind) ? node : null;
  };

  const remove = (): void => {
    if (!target()) return;
    const chain = editor.chain().focus();
    (request.kind === 'inline' ? chain.deleteInlineMath({ pos: request.pos }) : chain.deleteBlockMath({ pos: request.pos })).run();
  };

  const save = (): void => {
    const value = latex.trim();
    if (!value) { remove(); onClose(); return; }
    if (target()) {
      const chain = editor.chain().focus();
      (request.kind === 'inline'
        ? chain.updateInlineMath({ latex: value, pos: request.pos })
        : chain.updateBlockMath({ latex: value, pos: request.pos })).run();
    }
    onClose();
  };

  const cancel = (): void => {
    // A formula inserted empty and never filled in should not linger.
    const node = target();
    if (node && !String(node.attrs['latex'] ?? '').trim()) remove();
    else editor.commands.focus();
    onClose();
  };

  return (
    <div className="sh-dialog" role="dialog" aria-modal="true" aria-label="Edit formula">
      <textarea
        autoFocus
        className="sh-math-input"
        value={latex}
        placeholder="LaTeX, e.g. E = mc^2"
        onChange={(e) => setLatex(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
          if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        }}
      />
      <div className="sh-math-preview" dangerouslySetInnerHTML={{ __html: preview }} />
      <div className="sh-dialog-actions">
        <button type="button" onClick={cancel}>Cancel</button>
        <button type="button" className="is-primary" onClick={save}>Save</button>
      </div>
    </div>
  );
}
