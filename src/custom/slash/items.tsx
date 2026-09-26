import type { Editor, JSONContent, Range } from '@tiptap/core';
// Type-only: declare the commands of extensions a later task registers.
import type {} from '@tiptap/extension-details';
import type {} from '@tiptap/extension-table';
import type {} from '@tiptap/extension-mathematics';
import type { ReactNode } from 'react';
import {
  Pilcrow, Heading1, Heading2, Heading3, List, ListOrdered, CheckSquare, Code2, Quote, Minus,
  Sigma, Pi, Table, ChevronRight, ImageIcon, Blocks, Tag, Link2,
  BookOpen, Calendar, CalendarCheck, Layers, BookMarked,
} from 'lucide-react';
import type { ShuttleContextRef } from '../../context';
import type { ShuttleMode } from '../../host';
import { blockIdAt } from '../../doc/topLevel';

export interface SlashArgs {
  editor: Editor;
  range: Range;
  ctx: ShuttleContextRef;
}

export interface SlashItem {
  title: string;
  description: string;
  icon: ReactNode;
  group: 'Blocks' | 'Insert' | 'Annotate' | 'Templates';
  only?: ShuttleMode;
  run: (args: SlashArgs) => void;
}

const icon = (C: typeof Pilcrow): ReactNode => <C size={14} strokeWidth={1.75} />;
const clear = ({ editor, range }: SlashArgs) => editor.chain().focus().deleteRange(range);

const fragmentAction = (type: 'tag' | 'noteLink' | 'fragmentLink') => (args: SlashArgs): void => {
  clear(args).run();
  const blockId = blockIdAt(args.editor.state);
  if (blockId) args.ctx.current.host.onFragmentAction({ docKey: args.ctx.current.docKey, type, blockId });
};

const insert = (nodes: JSONContent[]) => (args: SlashArgs): void => {
  clear(args).insertContent(nodes).run();
};

// ── Template helpers ────────────────────────────────────────────────────────
const p = (): JSONContent => ({ type: 'paragraph' });
const h = (level: 1 | 2 | 3, text: string): JSONContent => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] });
const meta = (label: string): JSONContent => ({ type: 'paragraph', content: [{ type: 'text', text: label, marks: [{ type: 'bold' }] }] });
const tasks = (n: number): JSONContent => ({ type: 'taskList', content: Array.from({ length: n }, () => ({ type: 'taskItem', attrs: { checked: false }, content: [p()] })) });
const bullets = (n: number): JSONContent => ({ type: 'bulletList', content: Array.from({ length: n }, () => ({ type: 'listItem', content: [p()] })) });
const today = (): string => new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

export const SLASH_ITEMS: readonly SlashItem[] = [
  { title: 'Text', description: 'Plain paragraph', group: 'Blocks', icon: icon(Pilcrow), run: (a) => clear(a).setParagraph().run() },
  { title: 'Heading 1', description: 'Large section heading', group: 'Blocks', icon: icon(Heading1), run: (a) => clear(a).setHeading({ level: 1 }).run() },
  { title: 'Heading 2', description: 'Medium section heading', group: 'Blocks', icon: icon(Heading2), run: (a) => clear(a).setHeading({ level: 2 }).run() },
  { title: 'Heading 3', description: 'Small section heading', group: 'Blocks', icon: icon(Heading3), run: (a) => clear(a).setHeading({ level: 3 }).run() },
  { title: 'Bullet List', description: 'Unordered list', group: 'Blocks', icon: icon(List), run: (a) => clear(a).toggleBulletList().run() },
  { title: 'Numbered List', description: 'Ordered list', group: 'Blocks', icon: icon(ListOrdered), run: (a) => clear(a).toggleOrderedList().run() },
  { title: 'Task List', description: 'Checklist', group: 'Blocks', icon: icon(CheckSquare), run: (a) => clear(a).toggleTaskList().run() },
  { title: 'Code Block', description: 'Syntax-highlighted code', group: 'Blocks', icon: icon(Code2), run: (a) => clear(a).toggleCodeBlock().run() },
  { title: 'Quote', description: 'Blockquote', group: 'Blocks', icon: icon(Quote), run: (a) => clear(a).toggleBlockquote().run() },
  { title: 'Toggle', description: 'Collapsible section', group: 'Blocks', icon: icon(ChevronRight), run: (a) => clear(a).setDetails().run() },
  { title: 'Divider', description: 'Horizontal rule', group: 'Insert', icon: icon(Minus), run: (a) => clear(a).setHorizontalRule().run() },
  { title: 'Table', description: '3 × 3 table with header', group: 'Insert', icon: icon(Table), run: (a) => clear(a).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { title: 'Image', description: 'Upload an image', group: 'Insert', icon: icon(ImageIcon), run: (a) => { clear(a).run(); a.ctx.current.events.pickImage(); } },
  {
    title: 'Math (inline)', description: 'Inline LaTeX formula', group: 'Insert', icon: icon(Sigma),
    run: (a) => {
      clear(a).insertInlineMath({ latex: '' }).run();
      a.ctx.current.events.editMath({ kind: 'inline', latex: '', pos: a.range.from });
    },
  },
  {
    title: 'Math Block', description: 'Display LaTeX formula', group: 'Insert', icon: icon(Pi),
    run: (a) => {
      clear(a).insertBlockMath({ latex: '' }).run();
      const pos = a.editor.state.selection.from - 1;
      a.ctx.current.events.editMath({ kind: 'block', latex: '', pos: Math.max(0, pos) });
    },
  },
  {
    title: 'Block reference', description: 'Embed a block from another note', group: 'Insert', icon: icon(Blocks), only: 'notepad',
    run: (a) => { clear(a).run(); a.ctx.current.events.openRefPicker(); },
  },
  { title: 'Tag block', description: 'Add a tag to this block', group: 'Annotate', icon: icon(Tag), run: fragmentAction('tag') },
  { title: 'Link → note', description: 'Link this block to a note', group: 'Annotate', icon: icon(Link2), run: fragmentAction('noteLink') },
  { title: 'Link → fragment', description: 'Link this block to a block in a note', group: 'Annotate', icon: icon(Link2), run: fragmentAction('fragmentLink') },
  { title: 'Lesson', description: 'Title · Objectives · Notes · Summary', group: 'Templates', icon: icon(BookOpen),
    run: insert([h(1, 'Lesson Title'), h(2, 'Objectives'), bullets(2), h(2, 'Notes'), p(), h(2, 'Summary'), p()]) },
  { title: 'Meeting', description: 'Date · Agenda · Notes · Action items', group: 'Templates', icon: icon(Calendar),
    run: insert([h(1, 'Meeting'), meta('Date: '), meta('Time: '), meta('Attendees: '), h(2, 'Agenda'), tasks(3), h(2, 'Notes'), p(), h(2, 'Action Items'), tasks(2)]) },
  { title: 'Daily Note', description: "Today's date · Tasks · Notes · Reflection", group: 'Templates', icon: icon(CalendarCheck),
    run: (a) => insert([h(1, today()), h(2, 'Tasks'), tasks(3), h(2, 'Notes'), p(), h(2, 'Reflection'), p()])(a) },
  { title: 'Project', description: 'Overview · Goals · Tasks · Notes', group: 'Templates', icon: icon(Layers),
    run: insert([h(1, 'Project Name'), h(2, 'Overview'), p(), h(2, 'Goals'), bullets(2), h(2, 'Tasks'), tasks(3), h(2, 'Notes'), p()]) },
  { title: 'Research Note', description: 'Source · Findings · Notes · References', group: 'Templates', icon: icon(BookMarked),
    run: insert([h(1, 'Research: Topic'), meta('Source: '), h(2, 'Key Findings'), bullets(3), h(2, 'Notes'), p(), h(2, 'References'), bullets(1)]) },
];

export function filterSlashItems(query: string, mode: ShuttleMode): SlashItem[] {
  const q = query.toLowerCase();
  return SLASH_ITEMS.filter(
    (item) =>
      (item.only === undefined || item.only === mode) &&
      (item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)),
  );
}
