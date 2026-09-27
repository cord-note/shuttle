import { describe, it, expect, afterEach } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ShuttleEditor, type ShuttleEditorProps } from '../src/ShuttleEditor';
import { createFakeHost } from '../src/testing/fakeHost';

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ''; });

function mount(props: Partial<ShuttleEditorProps>) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const base: ShuttleEditorProps = { docKey: 'a', doc: null, mode: 'note', host: createFakeHost(), onChange: () => {} };
  const render = (next: Partial<ShuttleEditorProps>): void => { act(() => root!.render(<ShuttleEditor {...base} {...props} {...next} />)); };
  render({});
  return { container, render };
}

/** The ruler spans 0–1000px on screen, so its centre is at 500. */
function stubRulerRect(container: HTMLElement): void {
  const ruler = container.querySelector('.sh-ruler') as HTMLElement;
  ruler.getBoundingClientRect = () => ({ left: 0, right: 1000, width: 1000, top: 0, bottom: 10, height: 10, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}

describe('margin ruler', () => {
  it('is shown only when the host handles width changes', () => {
    expect(mount({ lineWidth: 600 }).container.querySelector('.sh-ruler')).toBeNull();
    act(() => root!.unmount()); root = null;
    expect(mount({ lineWidth: 600, onLineWidthChange: () => {} }).container.querySelector('.sh-ruler')).not.toBeNull();
  });

  it('sets the text column width on the root', () => {
    const { container } = mount({ lineWidth: 640 });
    expect((container.querySelector('.sh-root') as HTMLElement).style.getPropertyValue('--sh-line-width')).toBe('640px');
  });

  it('dragging a handle widens the column symmetrically, committing on release', () => {
    const changes: number[] = [];
    const { container } = mount({ lineWidth: 600, onLineWidthChange: (w) => changes.push(w) });
    stubRulerRect(container);
    const right = container.querySelector('.sh-ruler-handle[data-side="right"]') as HTMLElement;
    act(() => { right.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 800 })); });
    // 380px right of centre → a 760px column; the preview updates while dragging.
    act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: 880 })); });
    expect((container.querySelector('.sh-root') as HTMLElement).style.getPropertyValue('--sh-line-width')).toBe('760px');
    expect(changes).toEqual([]);
    act(() => { window.dispatchEvent(new MouseEvent('pointerup', { clientX: 880 })); });
    expect(changes).toEqual([760]);
  });

  it('keeps the width within the range and the ruler', () => {
    const changes: number[] = [];
    const { container } = mount({ lineWidth: 600, lineWidthRange: { min: 480, max: 1200 }, onLineWidthChange: (w) => changes.push(w) });
    stubRulerRect(container);
    const left = container.querySelector('.sh-ruler-handle[data-side="left"]') as HTMLElement;
    act(() => { left.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 200 })); });
    act(() => { window.dispatchEvent(new MouseEvent('pointerup', { clientX: 450 })); });
    act(() => { left.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 200 })); });
    act(() => { window.dispatchEvent(new MouseEvent('pointerup', { clientX: -400 })); });
    // Too narrow → the minimum; wider than the ruler itself → the ruler's width.
    expect(changes).toEqual([480, 1000]);
  });

  it('moves with the arrow keys', () => {
    const changes: number[] = [];
    const { container } = mount({ lineWidth: 600, onLineWidthChange: (w) => changes.push(w) });
    stubRulerRect(container);
    const right = container.querySelector('.sh-ruler-handle[data-side="right"]') as HTMLElement;
    expect(right.getAttribute('role')).toBe('slider');
    expect(right.getAttribute('aria-valuenow')).toBe('600');
    act(() => { right.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    act(() => { right.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, shiftKey: true })); });
    expect(changes).toEqual([620, 500]);
  });
});
