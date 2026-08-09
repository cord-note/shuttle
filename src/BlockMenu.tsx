import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import {
  Pilcrow, Heading1, Heading2, Heading3, List, ListOrdered, CheckSquare,
  Quote, Code2, Minus, Pi,
  Copy, ArrowUp, ArrowDown, Link, Tag, Link2, Trash2, ChevronRight,
} from 'lucide-react';
import styles from './BlockMenu.module.css';

interface Props {
  editor: Editor;
  noteId: string;
  vaultId: string;
  /** A position inside the target block. */
  pos: number;
  blockId: string | null;
  top: number;
  left: number;
  onClose: () => void;
}

interface TurnIntoOption {
  label: string;
  type: string;
  attrs?: Record<string, unknown>;
  icon: React.ReactNode;
  /** True when the conversion cannot keep the block's text. */
  lossy?: boolean;
}

const TURN_INTO: TurnIntoOption[] = [
  { label: 'Text',           type: 'paragraph',      icon: <Pilcrow size={13} strokeWidth={1.75} /> },
  { label: 'Heading 1',      type: 'heading',        attrs: { level: 1 }, icon: <Heading1 size={13} strokeWidth={1.75} /> },
  { label: 'Heading 2',      type: 'heading',        attrs: { level: 2 }, icon: <Heading2 size={13} strokeWidth={1.75} /> },
  { label: 'Heading 3',      type: 'heading',        attrs: { level: 3 }, icon: <Heading3 size={13} strokeWidth={1.75} /> },
  { label: 'Bullet list',    type: 'bulletList',     icon: <List size={13} strokeWidth={1.75} /> },
  { label: 'Numbered list',  type: 'orderedList',    icon: <ListOrdered size={13} strokeWidth={1.75} /> },
  { label: 'Task list',      type: 'taskList',       icon: <CheckSquare size={13} strokeWidth={1.75} /> },
  { label: 'Quote',          type: 'blockquote',     icon: <Quote size={13} strokeWidth={1.75} /> },
  { label: 'Code',           type: 'codeBlock',      icon: <Code2 size={13} strokeWidth={1.75} /> },
  { label: 'Math',           type: 'mathBlock',      icon: <Pi size={13} strokeWidth={1.75} />, lossy: true },
  { label: 'Divider',        type: 'horizontalRule', icon: <Minus size={13} strokeWidth={1.75} />, lossy: true },
];

/**
 * Actions for one block.
 *
 * Tag and link entries dispatch the same `corddb:fragment-action` event the
 * slash menu uses, so per-block annotation has exactly one implementation
 * regardless of which surface the user reaches it from.
 */
export default function BlockMenu({ editor, pos, blockId, top, left, onClose }: Props) {
  const [showTurnInto, setShowTurnInto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (ref.current?.contains(target as Node)) return;
      // The gutter owns its own toggle. Treating a press there as an outside
      // click would close the menu, and the handle's pointerup would reopen it.
      if (target?.closest('[data-block-gutter]')) return;
      onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    // Deferred: the click that opened the menu is still finishing, and would
    // otherwise be caught here and close it immediately.
    const id = setTimeout(() => {
      window.addEventListener('pointerdown', onPointerDown);
    }, 0);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(id);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  function run(fn: () => void) {
    fn();
    onClose();
  }

  function fragmentAction(type: 'tag' | 'noteLink' | 'fragmentLink') {
    if (!blockId) return;
    window.dispatchEvent(
      new CustomEvent('corddb:fragment-action', { detail: { type, blockId } }),
    );
  }

  function turnInto(option: TurnIntoOption) {
    const hasText = editor.state.doc.resolve(pos).parent.textContent.trim() !== '';
    if (option.lossy && hasText) {
      const ok = window.confirm(
        `Turning this block into a ${option.label.toLowerCase()} will discard its text. Continue?`,
      );
      if (!ok) return;
    }
    editor.commands.turnBlockInto(pos, option.type, option.attrs);
    onClose();
  }

  return (
    <div className={styles.menu} style={{ top, left }} ref={ref}>
      <button
        className={styles.item}
        onClick={() => setShowTurnInto((v) => !v)}
        onMouseEnter={() => setShowTurnInto(true)}
      >
        <Pilcrow size={13} strokeWidth={1.75} />
        <span className={styles.label}>Turn into</span>
        <ChevronRight size={12} strokeWidth={2} className={styles.chevron} />
      </button>

      {showTurnInto && (
        <div className={styles.submenu}>
          {TURN_INTO.map((option) => (
            <button
              key={option.label}
              className={styles.item}
              onClick={() => turnInto(option)}
            >
              {option.icon}
              <span className={styles.label}>{option.label}</span>
            </button>
          ))}
        </div>
      )}

      <div className={styles.divider} />

      <button className={styles.item} onClick={() => run(() => editor.commands.duplicateBlock(pos))}>
        <Copy size={13} strokeWidth={1.75} />
        <span className={styles.label}>Duplicate</span>
      </button>
      <button className={styles.item} onClick={() => run(() => editor.commands.moveBlock(pos, -1))}>
        <ArrowUp size={13} strokeWidth={1.75} />
        <span className={styles.label}>Move up</span>
        <kbd className={styles.kbd}>Alt ↑</kbd>
      </button>
      <button className={styles.item} onClick={() => run(() => editor.commands.moveBlock(pos, 1))}>
        <ArrowDown size={13} strokeWidth={1.75} />
        <span className={styles.label}>Move down</span>
        <kbd className={styles.kbd}>Alt ↓</kbd>
      </button>

      <div className={styles.divider} />

      <button
        className={styles.item}
        disabled={!blockId}
        onClick={() => run(() => { if (blockId) void navigator.clipboard.writeText(blockId); })}
      >
        <Link size={13} strokeWidth={1.75} />
        <span className={styles.label}>Copy block id</span>
      </button>
      <button className={styles.item} disabled={!blockId} onClick={() => run(() => fragmentAction('tag'))}>
        <Tag size={13} strokeWidth={1.75} />
        <span className={styles.label}>Tag block</span>
      </button>
      <button className={styles.item} disabled={!blockId} onClick={() => run(() => fragmentAction('noteLink'))}>
        <Link2 size={13} strokeWidth={1.75} />
        <span className={styles.label}>Link to note</span>
      </button>

      <div className={styles.divider} />

      <button
        className={`${styles.item} ${styles.danger}`}
        onClick={() => run(() => editor.commands.deleteBlock(pos))}
      >
        <Trash2 size={13} strokeWidth={1.75} />
        <span className={styles.label}>Delete</span>
      </button>
    </div>
  );
}
