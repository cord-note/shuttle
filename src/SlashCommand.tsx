import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import {
  Pilcrow, Heading1, Heading2, Heading3,
  List, ListOrdered, CheckSquare,
  Code2, Quote, Minus, Sigma, Pi,
  Tag, Link2,
  BookOpen, Calendar, CalendarCheck, Layers, BookMarked,
} from 'lucide-react';

function fireFragmentAction(editor: Editor, type: 'tag' | 'noteLink' | 'fragmentLink') {
  const blockId = editor.state.selection.$anchor.parent.attrs?.blockId as string | undefined;
  if (!blockId) return;
  window.dispatchEvent(new CustomEvent('corddb:fragment-action', { detail: { type, blockId } }));
}

const slashCommandPluginKey = new PluginKey('slashCommand');
import SlashCommandList, {
  type SlashItem,
  type SlashCommandListRef,
} from './SlashCommandList';

// ── Available items ─────────────────────────────────────────────────────────

const ITEMS: SlashItem[] = [
  {
    title: 'Text',
    description: 'Plain paragraph',
    group: 'Blocks',
    icon: <Pilcrow size={14} strokeWidth={1.75} />,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    title: 'Heading 1',
    description: 'Large section heading',
    icon: <Heading1 size={14} strokeWidth={1.75} />,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run(),
  },
  {
    title: 'Heading 2',
    description: 'Medium section heading',
    icon: <Heading2 size={14} strokeWidth={1.75} />,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run(),
  },
  {
    title: 'Heading 3',
    description: 'Small section heading',
    icon: <Heading3 size={14} strokeWidth={1.75} />,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run(),
  },
  {
    title: 'Bullet List',
    description: 'Unordered list',
    icon: <List size={14} strokeWidth={1.75} />,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: 'Numbered List',
    description: 'Ordered list',
    icon: <ListOrdered size={14} strokeWidth={1.75} />,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: 'Task List',
    description: 'Checklist',
    icon: <CheckSquare size={14} strokeWidth={1.75} />,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    title: 'Code Block',
    description: 'Syntax-highlighted code',
    icon: <Code2 size={14} strokeWidth={1.75} />,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: 'Blockquote',
    description: 'Quote or callout',
    icon: <Quote size={14} strokeWidth={1.75} />,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: 'Divider',
    description: 'Horizontal rule',
    icon: <Minus size={14} strokeWidth={1.75} />,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    title: 'Math (inline)',
    description: 'Inline LaTeX formula',
    icon: <Sigma size={14} strokeWidth={1.75} />,
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({ type: 'mathInline', attrs: { latex: '' } })
        .run(),
  },
  {
    title: 'Math Block',
    description: 'Display LaTeX formula',
    icon: <Pi size={14} strokeWidth={1.75} />,
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({ type: 'mathBlock', attrs: { latex: '' } })
        .run(),
  },
  {
    title: 'Tag block',
    description: 'Add a tag to this block',
    icon: <Tag size={14} strokeWidth={1.75} />,
    command: ({ editor, range }) => {
      const blockId = editor.state.selection.$anchor.parent.attrs?.blockId;
      editor.chain().focus().deleteRange(range).run();
      if (blockId) fireFragmentAction(editor, 'tag');
    },
  },
  {
    title: 'Link → note',
    description: 'Link this block to a note',
    icon: <Link2 size={14} strokeWidth={1.75} />,
    command: ({ editor, range }) => {
      const blockId = editor.state.selection.$anchor.parent.attrs?.blockId;
      editor.chain().focus().deleteRange(range).run();
      if (blockId) fireFragmentAction(editor, 'noteLink');
    },
  },
  {
    title: 'Link → fragment',
    description: 'Link this block to a fragment in a note',
    icon: <Link2 size={14} strokeWidth={1.75} />,
    command: ({ editor, range }) => {
      const blockId = editor.state.selection.$anchor.parent.attrs?.blockId;
      editor.chain().focus().deleteRange(range).run();
      if (blockId) fireFragmentAction(editor, 'fragmentLink');
    },
  },
];

// ── Template content helpers ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = Record<string, any>;

const p    = (): Node => ({ type: 'paragraph' });
const h    = (level: 1 | 2 | 3, text: string): Node => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] });
const meta = (label: string): Node => ({ type: 'paragraph', content: [{ type: 'text', text: label, marks: [{ type: 'bold' }] }] });
const tasks = (n: number): Node => ({
  type: 'taskList',
  content: Array.from({ length: n }, () => ({ type: 'taskItem', attrs: { checked: false }, content: [p()] })),
});
const bullets = (n: number): Node => ({
  type: 'bulletList',
  content: Array.from({ length: n }, () => ({ type: 'listItem', content: [p()] })),
});
function todayLabel() {
  return new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// ── Template items ────────────────────────────────────────────────────────────

const TEMPLATES: SlashItem[] = [
  {
    title: 'Lesson',
    description: 'Title · Objectives · Notes · Summary',
    group: 'Templates',
    icon: <BookOpen size={14} strokeWidth={1.75} />,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).insertContent([
        h(1, 'Lesson Title'),
        h(2, 'Objectives'),
        bullets(2),
        h(2, 'Notes'),
        p(),
        h(2, 'Summary'),
        p(),
      ]).run(),
  },
  {
    title: 'Meeting',
    description: 'Date · Agenda checklist · Notes · Action items',
    group: 'Templates',
    icon: <Calendar size={14} strokeWidth={1.75} />,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).insertContent([
        h(1, 'Meeting'),
        meta('Date: '),
        meta('Time: '),
        meta('Attendees: '),
        h(2, 'Agenda'),
        tasks(3),
        h(2, 'Notes'),
        p(),
        h(2, 'Action Items'),
        tasks(2),
      ]).run(),
  },
  {
    title: 'Daily Note',
    description: "Today's date · Tasks · Notes · Reflection",
    group: 'Templates',
    icon: <CalendarCheck size={14} strokeWidth={1.75} />,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).insertContent([
        h(1, todayLabel()),
        h(2, 'Tasks'),
        tasks(3),
        h(2, 'Notes'),
        p(),
        h(2, 'Reflection'),
        p(),
      ]).run(),
  },
  {
    title: 'Project',
    description: 'Overview · Goals · Task list · Notes',
    group: 'Templates',
    icon: <Layers size={14} strokeWidth={1.75} />,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).insertContent([
        h(1, 'Project Name'),
        h(2, 'Overview'),
        p(),
        h(2, 'Goals'),
        bullets(2),
        h(2, 'Tasks'),
        tasks(3),
        h(2, 'Notes'),
        p(),
      ]).run(),
  },
  {
    title: 'Research Note',
    description: 'Source · Key findings · Notes · References',
    group: 'Templates',
    icon: <BookMarked size={14} strokeWidth={1.75} />,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).insertContent([
        h(1, 'Research: Topic'),
        meta('Source: '),
        h(2, 'Key Findings'),
        bullets(3),
        h(2, 'Notes'),
        p(),
        h(2, 'References'),
        bullets(1),
      ]).run(),
  },
];

const ALL_ITEMS: SlashItem[] = [...ITEMS, ...TEMPLATES];

function filterItems(query: string): SlashItem[] {
  const q = query.toLowerCase();
  return ALL_ITEMS.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q),
  );
}

// ── Popup render factory ────────────────────────────────────────────────────

// Must stay in step with `.popup` max-height / max-width in
// SlashCommandList.module.css — the flip-above and clamp maths depend on them.
const MENU_MAX_H = 196;
const MENU_MAX_W = 230;

function makeRenderFn() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (): Record<string, (props: any) => any> => {
    let component: ReactRenderer<SlashCommandListRef> | null = null;
    let wrapper: HTMLDivElement | null = null;

    function position(clientRect: (() => DOMRect | null) | null | undefined) {
      if (!wrapper || !clientRect) return;
      const rect = clientRect();
      if (!rect) return;
      const vpH = window.innerHeight;
      const vpW = window.innerWidth;
      const top =
        rect.bottom + 4 + MENU_MAX_H > vpH ? rect.top - MENU_MAX_H - 4 : rect.bottom + 4;
      // Keep the popup on screen when the caret is near the right edge.
      const left = Math.max(8, Math.min(rect.left, vpW - MENU_MAX_W - 8));
      wrapper.style.top = `${top}px`;
      wrapper.style.left = `${left}px`;
    }

    return {
      onStart(props) {
        component = new ReactRenderer(SlashCommandList, {
          props,
          editor: props.editor as Editor,
        });
        wrapper = document.createElement('div');
        wrapper.style.cssText = 'position:fixed;z-index:9999;';
        wrapper.appendChild(component.element);
        document.body.appendChild(wrapper);
        position(props.clientRect);
      },
      onUpdate(props) {
        component?.updateProps(props);
        position(props.clientRect);
      },
      onKeyDown(props): boolean {
        if (props.event.key === 'Escape') {
          wrapper?.remove();
          component?.destroy();
          return true;
        }
        return (component?.ref as SlashCommandListRef | null)?.onKeyDown(props) ?? false;
      },
      onExit() {
        wrapper?.remove();
        component?.destroy();
        wrapper = null;
        component = null;
      },
    };
  };
}

// ── Extension ───────────────────────────────────────────────────────────────

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    return [
      Suggestion({
        pluginKey: slashCommandPluginKey,
        editor: this.editor,
        char: '/',
        allowSpaces: false,
        startOfLine: false,
        items: ({ query }) => filterItems(query),
        command: ({ editor, range, props }) => {
          (props as SlashItem).command({ editor, range });
        },
        render: makeRenderFn(),
      }),
    ];
  },
});
