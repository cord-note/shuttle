import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Editor } from '@tiptap/core';
import {
  Pilcrow, Heading1, Heading2, Heading3, List, ListOrdered, CheckSquare, Quote, Code2,
  Copy, ArrowUp, ArrowDown, Link, Tag, Link2, Trash2, ChevronRight,
} from 'lucide-react';
import type { ShuttleContextRef } from '../context';
import type { FragmentActionType } from '../host';
import type { TurnIntoType } from '../custom/notepad/commands';

interface Props {
  editor: Editor;
  ctx: ShuttleContextRef;
  /** Position just before the target top-level block. */
  pos: number;
  top: number;
  left: number;
  onClose: () => void;
}

const ic = { size: 13, strokeWidth: 1.75 } as const;
const TURN_INTO: { label: string; type: TurnIntoType; level?: 1 | 2 | 3; icon: ReactNode }[] = [
  { label: 'Text', type: 'paragraph', icon: <Pilcrow {...ic} /> },
  { label: 'Heading 1', type: 'heading', level: 1, icon: <Heading1 {...ic} /> },
  { label: 'Heading 2', type: 'heading', level: 2, icon: <Heading2 {...ic} /> },
  { label: 'Heading 3', type: 'heading', level: 3, icon: <Heading3 {...ic} /> },
  { label: 'Bullet list', type: 'bulletList', icon: <List {...ic} /> },
  { label: 'Numbered list', type: 'orderedList', icon: <ListOrdered {...ic} /> },
  { label: 'Task list', type: 'taskList', icon: <CheckSquare {...ic} /> },
  { label: 'Quote', type: 'blockquote', icon: <Quote {...ic} /> },
  { label: 'Code', type: 'codeBlock', icon: <Code2 {...ic} /> },
];

/** Per-block actions for notepad mode, opened from the gutter grip. */
export function BlockMenu({ editor, ctx, pos, top, left, onClose }: Props) {
  const [turnInto, setTurnInto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const node = editor.state.doc.nodeAt(pos);
  const blockId = (node?.attrs['blockId'] as string | null | undefined) ?? null;
  const inside = pos + 1;

  useEffect(() => {
    const onDown = (e: PointerEvent): void => {
      const target = e.target as HTMLElement | null;
      if (ref.current?.contains(target) || target?.closest?.('[data-sh-gutter]')) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    // Deferred so the click that opened the menu does not close it.
    const id = setTimeout(() => window.addEventListener('pointerdown', onDown), 0);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(id);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const run = (fn: () => void) => (): void => { fn(); onClose(); };
  const fragment = (type: FragmentActionType) => run(() => {
    if (blockId) ctx.current.host.onFragmentAction({ docKey: ctx.current.docKey, type, blockId });
  });
  const copyId = run(() => {
    if (!blockId) return;
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    clipboard?.writeText(blockId).catch((error: unknown) => {
      ctx.current.host.log('warn', 'Copying the block id failed', { error: String(error) });
    });
  });

  return (
    <div className="sh-menu" role="menu" style={{ top, left }} ref={ref}>
      <button type="button" className="sh-menu-item" onMouseEnter={() => setTurnInto(true)} onClick={() => setTurnInto((v) => !v)}>
        <Pilcrow {...ic} /><span>Turn into</span><ChevronRight size={12} strokeWidth={2} className="sh-menu-chevron" />
      </button>
      {turnInto && node && !node.isAtom && (
        <div className="sh-submenu">
          {TURN_INTO.map((o) => (
            <button type="button" key={o.label} className="sh-menu-item" onClick={run(() => editor.commands.turnInto(inside, o.type, o.level))}>
              {o.icon}<span>{o.label}</span>
            </button>
          ))}
        </div>
      )}
      <div className="sh-menu-sep" />
      <button type="button" className="sh-menu-item" onClick={run(() => editor.commands.duplicateBlock(inside))}><Copy {...ic} /><span>Duplicate</span></button>
      <button type="button" className="sh-menu-item" onClick={run(() => editor.commands.moveBlock(inside, -1))}><ArrowUp {...ic} /><span>Move up</span></button>
      <button type="button" className="sh-menu-item" onClick={run(() => editor.commands.moveBlock(inside, 1))}><ArrowDown {...ic} /><span>Move down</span></button>
      <div className="sh-menu-sep" />
      <button type="button" className="sh-menu-item" disabled={!blockId} onClick={copyId}><Link {...ic} /><span>Copy block id</span></button>
      <button type="button" className="sh-menu-item" disabled={!blockId} onClick={fragment('tag')}><Tag {...ic} /><span>Tag block</span></button>
      <button type="button" className="sh-menu-item" disabled={!blockId} onClick={fragment('noteLink')}><Link2 {...ic} /><span>Link to note</span></button>
      <div className="sh-menu-sep" />
      <button type="button" className="sh-menu-item is-danger" onClick={run(() => editor.commands.deleteBlock(inside))}><Trash2 {...ic} /><span>Delete</span></button>
    </div>
  );
}
