import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Editor, Range } from '@tiptap/core';
import type { NoteKind } from '@shared/types';
import styles from './SlashCommandList.module.css';

export interface SlashItem {
  title: string;
  description: string;
  icon: ReactNode;
  group?: string;
  /** Only offered in this note kind. Omitted means both. */
  only?: NoteKind;
  command: (args: { editor: Editor; range: Range; mode: NoteKind }) => void;
}

interface Props {
  items: SlashItem[];
  command: (item: SlashItem) => void;
}

export interface SlashCommandListRef {
  onKeyDown: (args: { event: KeyboardEvent }) => boolean;
}

const SlashCommandList = forwardRef<SlashCommandListRef, Props>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

    useEffect(() => setSelectedIndex(0), [items]);

    useEffect(() => {
      itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex]);

    useImperativeHandle(ref, () => ({
      onKeyDown({ event }) {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((i) => (i - 1 + items.length) % items.length);
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === 'Enter') {
          if (items[selectedIndex]) command(items[selectedIndex]);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className={styles.popup}>
          <div className={styles.empty}>No results</div>
        </div>
      );
    }

    let lastGroup: string | undefined;

    return (
      <div className={styles.popup} ref={listRef}>
        {items.map((item, i) => {
          const showHeader = item.group && item.group !== lastGroup;
          lastGroup = item.group;
          return (
            <div key={item.title}>
              {showHeader && (
                <div className={styles.groupLabel}>{item.group}</div>
              )}
              <button
                ref={(el) => { itemRefs.current[i] = el; }}
                className={`${styles.item} ${i === selectedIndex ? styles.selected : ''}`}
                onMouseEnter={() => setSelectedIndex(i)}
                onClick={() => command(item)}
                title={item.description}
              >
                <span className={styles.icon}>{item.icon}</span>
                <span className={styles.title}>{item.title}</span>
              </button>
            </div>
          );
        })}
      </div>
    );
  },
);
SlashCommandList.displayName = 'SlashCommandList';
export default SlashCommandList;
