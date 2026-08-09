import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { GripVertical, Plus } from 'lucide-react';
import BlockMenu from './BlockMenu';
import styles from './BlockChrome.module.css';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface Hover extends Rect {
  /** A position *inside* the block — what the block commands expect. */
  pos: number;
  index: number;
  blockId: string | null;
  el: HTMLElement;
}

/** Gutter width: the controls plus a little air before the text starts. */
const GUTTER_OFFSET = 46;

/** Pointer travel before a press on the handle becomes a drag, not a click. */
const DRAG_THRESHOLD_PX = 4;

/** Vertical slack so the gap between two blocks still resolves to one of them. */
const BAND_SLACK_PX = 4;

interface Props {
  editor: Editor;
  noteId: string;
  vaultId: string;
  /** The scrolling element the editor content sits in. */
  contentEl: HTMLElement | null;
}

/**
 * Hover controls and drag-reordering for a notepad's blocks.
 *
 * A single overlay positioned from `[data-block]` rects rather than a node view
 * per block: a node view per block would put a React component on every line of
 * every page, which is the cost this design exists to avoid.
 *
 * Hover is tracked by pointer *Y against the whole content area*, not by the
 * block's own `:hover`. The controls sit in the margin outside the text column,
 * so a block-scoped hover loses the pointer the instant it travels toward them —
 * the buttons disappear before they can be clicked.
 */
export default function BlockChrome({ editor, noteId, vaultId, contentEl }: Props) {
  const [hover, setHover] = useState<Hover | null>(null);
  const [menuFor, setMenuFor] = useState<Hover | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const drag = useRef<{ index: number; pos: number; startY: number; active: boolean } | null>(null);
  const hoverRef = useRef<Hover | null>(null);
  const menuOpen = useRef(false);

  hoverRef.current = hover;
  menuOpen.current = menuFor !== null;

  /** Rect of an element relative to the scrolling content element. */
  const measure = useCallback(
    (el: HTMLElement): Rect | null => {
      if (!contentEl) return null;
      const r = el.getBoundingClientRect();
      const host = contentEl.getBoundingClientRect();
      return {
        top: r.top - host.top + contentEl.scrollTop,
        left: r.left - host.left,
        width: r.width,
        height: r.height,
      };
    },
    [contentEl],
  );

  /** Top-level block elements, in document order. */
  const blockEls = useCallback(
    (): HTMLElement[] =>
      Array.from(editor.view.dom.children).filter(
        (el): el is HTMLElement => el instanceof HTMLElement && el.hasAttribute('data-block'),
      ),
    [editor],
  );

  const hoverFor = useCallback(
    (el: HTMLElement, index: number): Hover | null => {
      const rect = measure(el);
      if (!rect) return null;
      return {
        ...rect,
        index,
        // posAtDOM with offset 0 lands just inside the wrapper, which is what the
        // block commands resolve from.
        pos: editor.view.posAtDOM(el, 0),
        blockId: el.getAttribute('data-block-id'),
        el,
      };
    },
    [editor, measure],
  );

  // Track the hovered block from pointer Y across the whole content area, so the
  // gutter, the menu and the margins all count as "still on this block".
  useEffect(() => {
    if (!contentEl) return;

    function onMove(event: MouseEvent) {
      if (drag.current?.active || menuOpen.current) return;

      const els = blockEls();
      let found: Hover | null = null;

      for (let i = 0; i < els.length; i++) {
        const r = els[i]!.getBoundingClientRect();
        if (event.clientY >= r.top - BAND_SLACK_PX && event.clientY <= r.bottom + BAND_SLACK_PX) {
          found = hoverFor(els[i]!, i);
          break;
        }
      }

      // Between or beyond blocks: keep the current target rather than flickering
      // the controls out from under the pointer on its way to them.
      if (found) setHover(found);
    }

    function onLeave() {
      if (drag.current?.active || menuOpen.current) return;
      setHover(null);
    }

    // Rects move under the pointer when the page scrolls.
    function onScroll() {
      const current = hoverRef.current;
      if (!current || menuOpen.current) return;
      const next = hoverFor(current.el, current.index);
      if (next) setHover(next);
    }

    contentEl.addEventListener('mousemove', onMove);
    contentEl.addEventListener('mouseleave', onLeave);
    contentEl.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      contentEl.removeEventListener('mousemove', onMove);
      contentEl.removeEventListener('mouseleave', onLeave);
      contentEl.removeEventListener('scroll', onScroll);
    };
  }, [contentEl, blockEls, hoverFor]);

  // Mark the active block so it reads as the target of the gutter controls.
  // Driven from here, not CSS `:hover`, for the same reason hover is.
  useEffect(() => {
    const active = (menuFor ?? hover)?.el;
    for (const el of blockEls()) {
      if (el === active) el.setAttribute('data-block-active', '');
      else el.removeAttribute('data-block-active');
    }
    return () => {
      for (const el of blockEls()) el.removeAttribute('data-block-active');
    };
  }, [hover, menuFor, blockEls]);

  // Drag to reorder. Pointer events rather than HTML5 drag-and-drop, which
  // fights contenteditable over what a drag means.
  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      const d = drag.current;
      if (!d) return;

      // A press that never travels is a click for the menu, not a drag.
      if (!d.active) {
        if (Math.abs(event.clientY - d.startY) < DRAG_THRESHOLD_PX) return;
        d.active = true;
        document.body.style.cursor = 'grabbing';
        setDropIndex(d.index);
      }

      const els = blockEls();
      let next = els.length;
      for (let i = 0; i < els.length; i++) {
        const r = els[i]!.getBoundingClientRect();
        if (event.clientY < r.top + r.height / 2) { next = i; break; }
      }
      setDropIndex(next);
    }

    function onPointerUp() {
      const d = drag.current;
      drag.current = null;
      document.body.style.cursor = '';

      if (!d) return;

      if (!d.active) {
        // A press that never moved is a click on the handle: toggle the menu.
        setDropIndex(null);
        setMenuFor((open) => {
          if (open && open.index === d.index) return null;
          const el = blockEls()[d.index];
          return el ? hoverFor(el, d.index) : null;
        });
        return;
      }

      setDropIndex((target) => {
        if (target !== null) {
          // Dropping below the source removes one slot above the target first,
          // so the effective destination shifts up by one.
          const adjusted = target > d.index ? target - 1 : target;
          const delta = adjusted - d.index;
          if (delta !== 0) editor.commands.moveBlock(d.pos, delta);
        }
        return null;
      });

      // The block just moved, so the gutter's position is stale. Drop it and let
      // the next pointer move resolve where it now belongs.
      setHover(null);
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      document.body.style.cursor = '';
    };
  }, [editor, blockEls, hoverFor]);

  function startPress(event: React.PointerEvent) {
    if (!hover) return;
    event.preventDefault();
    drag.current = { index: hover.index, pos: hover.pos, startY: event.clientY, active: false };
  }

  function addBlockBelow() {
    if (!hover) return;
    editor.chain().focus().insertBlockAfter(hover.pos).run();
    // Type the `/` for the user so `＋` and `/` reach the same menu.
    editor.commands.insertContent('/');
    setHover(null);
  }

  if (!contentEl) return null;

  // The gutter stays put while the menu is open, so the menu keeps an anchor.
  const anchor = menuFor ?? hover;

  const dropRect = (() => {
    if (dropIndex === null) return null;
    const els = blockEls();
    const at = els[dropIndex];
    if (at) return measure(at);
    const last = els[els.length - 1];
    const r = last ? measure(last) : null;
    return r ? { ...r, top: r.top + r.height } : null;
  })();

  return (
    <>
      {anchor && (
        <div
          className={styles.gutter}
          // Marks the gutter so the open menu does not treat a press on the
          // handle as an outside click — it would close, then the handle's
          // pointerup would reopen it.
          data-block-gutter=""
          style={{
            top: anchor.top,
            left: anchor.left - GUTTER_OFFSET,
            height: Math.max(anchor.height, 24),
          }}
        >
          <button
            className={styles.control}
            title="Add block below"
            onClick={addBlockBelow}
            tabIndex={-1}
          >
            <Plus size={14} strokeWidth={2} />
          </button>
          <button
            className={`${styles.control} ${styles.handle} ${menuFor ? styles.controlActive : ''}`}
            title="Drag to move · click for options"
            onPointerDown={startPress}
            tabIndex={-1}
          >
            <GripVertical size={14} strokeWidth={2} />
          </button>
        </div>
      )}

      {dropRect && (
        <div
          className={styles.dropLine}
          style={{ top: dropRect.top, left: dropRect.left, width: dropRect.width }}
        />
      )}

      {menuFor && (
        <BlockMenu
          editor={editor}
          noteId={noteId}
          vaultId={vaultId}
          pos={menuFor.pos}
          blockId={menuFor.blockId}
          top={menuFor.top}
          left={menuFor.left - GUTTER_OFFSET}
          onClose={() => setMenuFor(null)}
        />
      )}
    </>
  );
}
