import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { AlignCenter, AlignLeft } from 'lucide-react';
import type { BlockMathAlign } from '../custom/math/blockMath';

const BLOCK_MATH_SELECTOR = '[data-type="block-math"]';
const HIDE_DELAY_MS = 150;

interface Hovered {
  block: HTMLElement;
  top: number;
  right: number;
}

/** Document position of the block math node rendered by `block`, or -1. */
function blockMathPos(editor: Editor, block: HTMLElement): number {
  const { view } = editor;
  const isIt = (pos: number): boolean =>
    pos >= 0 && view.state.doc.nodeAt(pos)?.type.name === 'blockMath' && view.nodeDOM(pos) === block;
  try {
    const pos = view.posAtDOM(block, 0);
    if (isIt(pos)) return pos;
    if (isIt(pos - 1)) return pos - 1;
  } catch {
    // Detached DOM: fall through to the scan.
  }
  let found = -1;
  view.state.doc.descendants((node, pos) => {
    if (found !== -1) return false;
    if (node.type.name === 'blockMath' && view.nodeDOM(pos) === block) found = pos;
    return found === -1;
  });
  return found;
}

/**
 * A small button at the top-right of the hovered block math that flips it
 * between centred and left-aligned. It lives in `.sh-content`, outside the
 * node view, so clicking it never reaches the node view's click handler
 * (which opens the formula editor).
 */
export function MathAlignToggle({ editor }: { editor: Editor }) {
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHide = useCallback((): void => {
    if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    hideTimer.current = null;
  }, []);
  const scheduleHide = useCallback((): void => {
    cancelHide();
    hideTimer.current = setTimeout(() => setHovered(null), HIDE_DELAY_MS);
  }, [cancelHide]);

  useEffect(() => {
    const dom = editor.view.dom;
    const onOver = (event: MouseEvent): void => {
      const target = event.target instanceof Element ? event.target : null;
      const block = target?.closest<HTMLElement>(BLOCK_MATH_SELECTOR) ?? null;
      if (!block || !editor.isEditable) return;
      const content = block.closest('.sh-content');
      if (!content) return;
      cancelHide();
      const b = block.getBoundingClientRect();
      const c = content.getBoundingClientRect();
      setHovered((prev) =>
        prev && prev.block === block ? prev : { block, top: b.top - c.top, right: c.right - b.right },
      );
    };
    const onOut = (event: MouseEvent): void => {
      const target = event.target instanceof Element ? event.target : null;
      const block = target?.closest(BLOCK_MATH_SELECTOR);
      if (!block) return;
      const next = event.relatedTarget instanceof Node ? event.relatedTarget : null;
      if (next && block.contains(next)) return;
      scheduleHide();
    };
    dom.addEventListener('mouseover', onOver);
    dom.addEventListener('mouseout', onOut);
    return () => {
      dom.removeEventListener('mouseover', onOver);
      dom.removeEventListener('mouseout', onOut);
    };
  }, [editor, cancelHide, scheduleHide]);

  useEffect(() => cancelHide, [cancelHide]);

  if (!hovered) return null;
  const current: BlockMathAlign = hovered.block.dataset['align'] === 'left' ? 'left' : 'center';
  const next: BlockMathAlign = current === 'left' ? 'center' : 'left';

  return (
    <button
      type="button"
      className="sh-math-align"
      title={next === 'left' ? 'Align left' : 'Centre'}
      aria-label={next === 'left' ? 'Align left' : 'Centre'}
      style={{ top: hovered.top + 4, right: hovered.right + 4 }}
      onMouseEnter={cancelHide}
      onMouseLeave={scheduleHide}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const pos = blockMathPos(editor, hovered.block);
        if (pos >= 0) editor.commands.setBlockMathAlign(pos, next);
        // The node view is recreated on the change, so this block element is gone.
        cancelHide();
        setHovered(null);
      }}
    >
      {next === 'left' ? <AlignLeft size={14} strokeWidth={1.75} /> : <AlignCenter size={14} strokeWidth={1.75} />}
    </button>
  );
}
