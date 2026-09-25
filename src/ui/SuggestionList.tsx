import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';

export interface KeyHandlerRef {
  onKeyDown(args: { event: KeyboardEvent }): boolean;
}

export interface SuggestionListProps<Item> {
  items: Item[];
  command: (item: Item) => void;
  /** A fetch is in flight; `items` are the previous results, possibly empty. */
  loading?: boolean;
}

export interface ListRenderSpec<Item> {
  itemKey: (item: Item) => string;
  renderItem: (item: Item) => ReactNode;
  group?: (item: Item) => string | undefined;
  header?: ReactNode;
  empty: string;
}

/**
 * Keyboard-navigable suggestion list shared by the slash menu and `[[` links.
 * The popup forwards arrow keys and Enter through the imperative handle.
 */
export function createSuggestionList<Item>(spec: ListRenderSpec<Item>) {
  const List = forwardRef<KeyHandlerRef, SuggestionListProps<Item>>(({ items, command, loading = false }, ref) => {
    const [selected, setSelected] = useState(0);
    const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

    useEffect(() => setSelected(0), [items]);
    useEffect(() => { itemRefs.current[selected]?.scrollIntoView({ block: 'nearest' }); }, [selected]);

    useImperativeHandle(ref, () => ({
      onKeyDown({ event }) {
        // Swallow Enter while results are pending, so it neither picks a stale item nor splits the line.
        if (loading && event.key === 'Enter') return true;
        if (items.length === 0) return false;
        if (event.key === 'ArrowUp') { setSelected((i) => (i - 1 + items.length) % items.length); return true; }
        if (event.key === 'ArrowDown') { setSelected((i) => (i + 1) % items.length); return true; }
        if (event.key === 'Enter') { const item = items[selected]; if (item) command(item); return true; }
        return false;
      },
    }));

    if (items.length === 0) {
      return <div className="sh-popup"><div className="sh-popup-empty">{loading ? 'Searching…' : spec.empty}</div></div>;
    }

    let lastGroup: string | undefined;
    return (
      <div className="sh-popup">
        {spec.header}
        {items.map((item, i) => {
          const group = spec.group?.(item);
          const showGroup = group !== undefined && group !== lastGroup;
          lastGroup = group;
          return (
            <div key={spec.itemKey(item)}>
              {showGroup && <div className="sh-popup-group">{group}</div>}
              <button
                type="button"
                ref={(el) => { itemRefs.current[i] = el; }}
                className={`sh-popup-item${i === selected ? ' is-selected' : ''}`}
                onMouseEnter={() => setSelected(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => command(item)}
              >
                {spec.renderItem(item)}
              </button>
            </div>
          );
        })}
      </div>
    );
  });
  List.displayName = 'SuggestionList';
  return List;
}
