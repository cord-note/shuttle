import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { AlignCenter, AlignLeft } from 'lucide-react';
import type { BlockMathAlign } from '../custom/math/blockMath';

const BLOCK_MATH_SELECTOR = '[data-type="block-math"]';
const HIDE_DELAY_MS = 150;

interface Target {
  block: HTMLElement;
  top: number;
  right: number;
}

/** Where the button goes for `block`: its top-right corner, relative to `.sh-content`. */
function targetFor(block: HTMLElement): Target | null {
  const content = block.closest('.sh-content');
  if (!content) return null;
  const b = block.getBoundingClientRect();
  const c = content.getBoundingClientRect();
  return { block, top: b.top - c.top, right: c.right - b.right };
}

/** The rendered block math the selection is a NodeSelection on, if any. */
function selectedBlockMath(editor: Editor): HTMLElement | null {
  const { selection } = editor.state;
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'blockMath') return null;
  const dom = editor.view.nodeDOM(selection.from);
  return dom instanceof HTMLElement ? dom : null;
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
 * A small button at the top-right of the hovered — or node-selected, for
 * keyboard users — block math that flips it between centred and left-aligned.
 * It lives in `.sh-content`, outside the node view, so clicking it never
 * reaches the node view's click handler (which opens the formula editor).
 */
export function MathAlignToggle({ editor }: { editor: Editor }) {
  const [hovered, setHovered] = useState<Target | null>(null);
  const [selected, setSelected] = useState<Target | null>(null);
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
      cancelHide();
      setHovered((prev) => (prev && prev.block === block ? prev : targetFor(block)));
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

  useEffect(() => {
    // Follows every transaction rather than just selection changes: an
    // alignment change recreates the node view, and `setEditable` must hide it.
    const sync = (): void => {
      if (!editor.isEditable) {
        cancelHide();
        setHovered(null);
        setSelected(null);
        return;
      }
      const block = selectedBlockMath(editor);
      setSelected((prev) => (block ? (prev && prev.block === block ? prev : targetFor(block)) : null));
      setHovered((prev) => (prev && !prev.block.isConnected ? null : prev));
    };
    sync();
    editor.on('transaction', sync);
    editor.on('update', sync);
    return () => {
      editor.off('transaction', sync);
      editor.off('update', sync);
    };
  }, [editor, cancelHide]);

  useEffect(() => cancelHide, [cancelHide]);

  const target = hovered ?? selected;
  if (!target) return null;
  const current: BlockMathAlign = target.block.dataset['align'] === 'left' ? 'left' : 'center';
  const next: BlockMathAlign = current === 'left' ? 'center' : 'left';

  return (
    <button
      type="button"
      className="sh-math-align"
      title={next === 'left' ? 'Align left' : 'Centre'}
      aria-label={next === 'left' ? 'Align left' : 'Centre'}
      style={{ top: target.top + 4, right: target.right + 4 }}
      onMouseEnter={cancelHide}
      onMouseLeave={scheduleHide}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const pos = blockMathPos(editor, target.block);
        if (pos >= 0) editor.commands.setBlockMathAlign(pos, next);
        // The node view is recreated on the change, so this block element is
        // gone; a node selection, if any, re-targets the new one.
        cancelHide();
        setHovered(null);
      }}
    >
      {next === 'left' ? <AlignLeft size={14} strokeWidth={1.75} /> : <AlignCenter size={14} strokeWidth={1.75} />}
    </button>
  );
}
