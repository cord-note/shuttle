import { describe, it, expect } from 'bun:test';
import { placeNear, followViewport } from '../src/ui/anchor';

const rect = (top: number, left: number, height = 20, width = 10): DOMRect =>
  ({ top, left, bottom: top + height, right: left + width, width, height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
const viewport = { width: 1000, height: 800 };

describe('placeNear', () => {
  it('opens below the anchor when the popup fits there', () => {
    expect(placeNear(rect(100, 200), { width: 300, height: 200 }, viewport)).toEqual({ top: 124, left: 200 });
  });

  it('flips above using the popup\'s real height, not a maximum', () => {
    // 700 + 20 + 4 + 150 > 800, so it goes above: 700 - 150 - 4.
    expect(placeNear(rect(700, 200), { width: 300, height: 150 }, viewport)).toEqual({ top: 546, left: 200 });
  });

  it('keeps the popup inside the viewport horizontally', () => {
    expect(placeNear(rect(100, 900), { width: 300, height: 100 }, viewport).left).toBe(692);
    expect(placeNear(rect(100, -50), { width: 300, height: 100 }, viewport).left).toBe(8);
  });

  it('never places the popup above the top edge', () => {
    expect(placeNear(rect(50, 0, 700), { width: 300, height: 200 }, viewport).top).toBe(8);
  });
});

describe('followViewport', () => {
  it('reruns on scroll anywhere — including inner scroll containers — and on resize, until disposed', () => {
    let calls = 0;
    const dispose = followViewport(() => { calls += 1; });
    const inner = document.createElement('div');
    document.body.appendChild(inner);

    // Scroll events do not bubble; a capturing window listener still sees them.
    inner.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));
    expect(calls).toBe(2);

    dispose();
    inner.dispatchEvent(new Event('scroll'));
    expect(calls).toBe(2);
    inner.remove();
  });
});
