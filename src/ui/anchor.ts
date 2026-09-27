/**
 * Positioning for popups that belong to a spot in the document (the slash
 * menu, the formula editor). They are `position: fixed`, so they must be
 * placed from the anchor's screen rect and placed again whenever anything
 * scrolls — the host's own scroll container included, not just the window.
 */

const GAP = 4;
const MARGIN = 8;

export interface Size { width: number; height: number }

/** Top-left for a popup of `popup` size next to `anchor`: below it, or above when there is no room. */
export function placeNear(anchor: DOMRect, popup: Size, viewport: Size): { top: number; left: number } {
  const below = anchor.bottom + GAP;
  const fitsBelow = below + popup.height <= viewport.height - MARGIN;
  const top = fitsBelow ? below : Math.max(MARGIN, anchor.top - popup.height - GAP);
  const left = Math.max(MARGIN, Math.min(anchor.left, viewport.width - popup.width - MARGIN));
  return { top, left };
}

/**
 * Moves `el` next to `anchor`, measuring its current size. `fallback` covers
 * the first placement, before its content has rendered and has a size.
 */
export function positionNear(el: HTMLElement, anchor: DOMRect, fallback?: Size): void {
  const measured = el.getBoundingClientRect();
  const size = measured.height > 0 || !fallback ? { width: measured.width, height: measured.height } : fallback;
  const { top, left } = placeNear(anchor, size, { width: window.innerWidth, height: window.innerHeight });
  el.style.top = `${top}px`;
  el.style.left = `${left}px`;
}

/**
 * Whether `rect` is still visible: inside the window and inside every
 * scrolling ancestor of `from`. A popup whose anchor scrolled out of view
 * should hide rather than float over unrelated UI.
 */
export function isAnchorVisible(rect: DOMRect, from: Element): boolean {
  if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
  for (let el = from.parentElement; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if (overflowY !== 'auto' && overflowY !== 'scroll' && overflowY !== 'hidden') continue;
    const box = el.getBoundingClientRect();
    if (rect.bottom < box.top || rect.top > box.bottom) return false;
  }
  return true;
}

/**
 * Calls `update` on every scroll (scroll events don't bubble, so this listens
 * in the capture phase to catch inner scroll containers) and resize. Returns
 * the disposer.
 */
export function followViewport(update: () => void): () => void {
  const options = { capture: true, passive: true } as const;
  window.addEventListener('scroll', update, options);
  window.addEventListener('resize', update, options);
  return () => {
    window.removeEventListener('scroll', update, options);
    window.removeEventListener('resize', update, options);
  };
}
