import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import type { Note } from '@shared/types';
import styles from './WikiLinkList.module.css';

interface Props {
  items: Note[];
  command: (note: Note) => void;
}

export interface WikiLinkListRef {
  onKeyDown: (args: { event: KeyboardEvent }) => boolean;
}

const WikiLinkList = forwardRef<WikiLinkListRef, Props>(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => setSelectedIndex(0), [items]);

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
        <div className={styles.empty}>No matching notes</div>
      </div>
    );
  }

  return (
    <div className={styles.popup}>
      <div className={styles.header}>
        Link to note
        <span className={styles.hint}>[[title|display text]]</span>
      </div>
      {items.map((note, i) => (
        <button
          key={note.id}
          className={`${styles.item} ${i === selectedIndex ? styles.selected : ''}`}
          onMouseEnter={() => setSelectedIndex(i)}
          onClick={() => command(note)}
        >
          <span className={styles.icon}>[[</span>
          <span className={styles.label}>{note.title || 'Untitled'}</span>
        </button>
      ))}
    </div>
  );
});
WikiLinkList.displayName = 'WikiLinkList';
export default WikiLinkList;
