import { describe, it, expect, afterEach } from 'bun:test';
import { createRef } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createSuggestionList, type KeyHandlerRef } from '../src/ui/SuggestionList';

interface Item { id: string; name: string }

const List = createSuggestionList<Item>({
  itemKey: (i) => i.id,
  renderItem: (i) => i.name,
  empty: 'Nothing here',
});

const ITEMS: Item[] = [{ id: 'a', name: 'Apple' }, { id: 'b', name: 'Banana' }];

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function mount(): Root {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  return root;
}

const enter = () => new KeyboardEvent('keydown', { key: 'Enter' });

describe('SuggestionList', () => {
  it('keeps showing the items it has while loading', () => {
    const r = mount();
    const ref = createRef<KeyHandlerRef>();
    act(() => r.render(<List ref={ref} items={ITEMS} command={() => {}} />));
    expect(host!.textContent).toContain('Apple');
    act(() => r.render(<List ref={ref} items={ITEMS} loading command={() => {}} />));
    expect(host!.textContent).toContain('Apple');
    expect(host!.textContent).toContain('Banana');
  });

  it('keeps the selection when the same items come back while loading', () => {
    const r = mount();
    const ref = createRef<KeyHandlerRef>();
    act(() => r.render(<List ref={ref} items={ITEMS} command={() => {}} />));
    act(() => { ref.current!.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'ArrowDown' }) }); });
    act(() => r.render(<List ref={ref} items={ITEMS} loading command={() => {}} />));
    expect(host!.querySelector('.is-selected')?.textContent).toBe('Banana');
  });

  it('shows "Searching…" instead of the empty message while loading with no items', () => {
    const r = mount();
    act(() => r.render(<List items={[]} loading command={() => {}} />));
    expect(host!.textContent).toContain('Searching…');
    expect(host!.textContent).not.toContain('Nothing here');
    act(() => r.render(<List items={[]} command={() => {}} />));
    expect(host!.textContent).toContain('Nothing here');
  });

  it('swallows Enter while loading without running the command', () => {
    const r = mount();
    const ref = createRef<KeyHandlerRef>();
    const picked: Item[] = [];
    act(() => r.render(<List ref={ref} items={[]} loading command={(i) => picked.push(i)} />));
    expect(ref.current!.onKeyDown({ event: enter() })).toBe(true);
    act(() => r.render(<List ref={ref} items={ITEMS} loading command={(i) => picked.push(i)} />));
    expect(ref.current!.onKeyDown({ event: enter() })).toBe(true);
    expect(picked).toEqual([]);
  });

  it('runs the command on Enter once loaded', () => {
    const r = mount();
    const ref = createRef<KeyHandlerRef>();
    const picked: Item[] = [];
    act(() => r.render(<List ref={ref} items={ITEMS} command={(i) => picked.push(i)} />));
    expect(ref.current!.onKeyDown({ event: enter() })).toBe(true);
    expect(picked).toEqual([ITEMS[0]!]);
  });
});
