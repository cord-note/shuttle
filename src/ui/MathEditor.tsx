import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import katex from 'katex';
import type { MathEditRequest } from '../context';
import { followViewport, positionNear } from './anchor';

/** Screen rect of the formula being edited, falling back to its position's caret rect. */
function formulaRect(editor: Editor, pos: number): DOMRect | null {
  const dom = editor.view.nodeDOM(pos);
  if (dom instanceof HTMLElement) return dom.getBoundingClientRect();
  try {
    const c = editor.view.coordsAtPos(pos);
    return new DOMRect(c.left, c.top, 0, c.bottom - c.top);
  } catch {
    return null;
  }
}

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

  // Anchored under the formula it edits, following it while the page scrolls.
  const panel = useRef<HTMLDivElement>(null);
  const latest = useRef({ cancel });
  latest.current = { cancel };
  useLayoutEffect(() => {
    const place = (): void => {
      const rect = formulaRect(editor, request.pos);
      if (panel.current && rect) positionNear(panel.current, rect);
    };
    place();
    const unfollow = followViewport(place);
    // A click elsewhere dismisses it, like every other popup.
    const onPointerDown = (e: PointerEvent): void => {
      if (panel.current && !panel.current.contains(e.target as Node)) latest.current.cancel();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      unfollow();
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [editor, request.pos]);

  return (
    <div ref={panel} className="sh-dialog" role="dialog" aria-label="Edit formula">
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
