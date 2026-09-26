import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import type { ReactNode } from 'react';
import {
  List, ListOrdered, CheckSquare, Quote, Code2, Minus, Sigma, ImageIcon, Table, Highlighter,
  Underline, Strikethrough, Subscript, Superscript,
} from 'lucide-react';
import type { ShuttleContextRef } from '../context';
import { formatAccel, resolveBindings, type KeybindingId } from '../custom/keybindings/defs';

interface Props {
  editor: Editor;
  ctx: ShuttleContextRef;
}

function Btn({ onRun, active, title, children }: { onRun: () => void; active?: boolean; title: string; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`sh-tb-btn${active ? ' is-active' : ''}`}
      title={title}
      aria-pressed={active}
      onMouseDown={(e) => { e.preventDefault(); onRun(); }}
    >
      {children}
    </button>
  );
}

const ic = { size: 14, strokeWidth: 1.75 } as const;

/** Formatting toolbar; titles show the effective keybinding. */
export function Toolbar({ editor, ctx }: Props) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'),
      strike: e.isActive('strike'), code: e.isActive('code'), highlight: e.isActive('highlight'),
      sub: e.isActive('subscript'), sup: e.isActive('superscript'),
      h1: e.isActive('heading', { level: 1 }), h2: e.isActive('heading', { level: 2 }), h3: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'), ordered: e.isActive('orderedList'), task: e.isActive('taskList'),
      quote: e.isActive('blockquote'), codeBlock: e.isActive('codeBlock'),
    }),
  });
  const bindings = resolveBindings(ctx.current.host.keybindings);
  const t = (label: string, id?: KeybindingId): string => (id && bindings[id] ? `${label} (${formatAccel(bindings[id])})` : label);
  const run = () => editor.chain().focus();

  const insertInlineMath = (): void => {
    // The official insertInlineMath refuses empty latex, so insert the node
    // directly (replacing any selected range) and open the editor on it.
    const { from, to } = editor.state.selection;
    const inserted = run().insertContentAt({ from, to }, { type: 'inlineMath', attrs: { latex: '' } }).run();
    if (!inserted) return;
    const node = editor.state.doc.nodeAt(from);
    if (node?.type.name !== 'inlineMath') return;
    ctx.current.events.editMath({ kind: 'inline', latex: '', pos: from });
  };

  return (
    <div className="sh-toolbar" role="toolbar" aria-label="Formatting">
      <Btn title={t('Bold', 'editor.bold')} active={s.bold} onRun={() => run().toggleBold().run()}><strong>B</strong></Btn>
      <Btn title={t('Italic', 'editor.italic')} active={s.italic} onRun={() => run().toggleItalic().run()}><em>I</em></Btn>
      <Btn title={t('Underline', 'editor.underline')} active={s.underline} onRun={() => run().toggleUnderline().run()}><Underline {...ic} /></Btn>
      <Btn title={t('Strikethrough', 'editor.strike')} active={s.strike} onRun={() => run().toggleStrike().run()}><Strikethrough {...ic} /></Btn>
      <Btn title={t('Inline code', 'editor.inlineCode')} active={s.code} onRun={() => run().toggleCode().run()}>{'</>'}</Btn>
      <Btn title={t('Highlight', 'editor.highlight')} active={s.highlight} onRun={() => run().toggleHighlight().run()}><Highlighter {...ic} /></Btn>
      <Btn title="Subscript" active={s.sub} onRun={() => run().toggleSubscript().run()}><Subscript {...ic} /></Btn>
      <Btn title="Superscript" active={s.sup} onRun={() => run().toggleSuperscript().run()}><Superscript {...ic} /></Btn>
      <span className="sh-tb-sep" />
      <Btn title={t('Heading 1', 'editor.heading1')} active={s.h1} onRun={() => run().toggleHeading({ level: 1 }).run()}>H1</Btn>
      <Btn title={t('Heading 2', 'editor.heading2')} active={s.h2} onRun={() => run().toggleHeading({ level: 2 }).run()}>H2</Btn>
      <Btn title={t('Heading 3', 'editor.heading3')} active={s.h3} onRun={() => run().toggleHeading({ level: 3 }).run()}>H3</Btn>
      <span className="sh-tb-sep" />
      <Btn title={t('Bullet list', 'editor.bulletList')} active={s.bullet} onRun={() => run().toggleBulletList().run()}><List {...ic} /></Btn>
      <Btn title={t('Ordered list', 'editor.orderedList')} active={s.ordered} onRun={() => run().toggleOrderedList().run()}><ListOrdered {...ic} /></Btn>
      <Btn title={t('Task list', 'editor.taskList')} active={s.task} onRun={() => run().toggleTaskList().run()}><CheckSquare {...ic} /></Btn>
      <Btn title={t('Quote', 'editor.blockquote')} active={s.quote} onRun={() => run().toggleBlockquote().run()}><Quote {...ic} /></Btn>
      <Btn title={t('Code block', 'editor.codeBlock')} active={s.codeBlock} onRun={() => run().toggleCodeBlock().run()}><Code2 {...ic} /></Btn>
      <span className="sh-tb-sep" />
      <Btn title={t('Divider', 'editor.divider')} onRun={() => run().setHorizontalRule().run()}><Minus {...ic} /></Btn>
      <Btn title="Table" onRun={() => run().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table {...ic} /></Btn>
      <Btn title="Image" onRun={() => ctx.current.events.pickImage()}><ImageIcon {...ic} /></Btn>
      <Btn title="Math (inline)" onRun={insertInlineMath}><Sigma {...ic} /></Btn>
    </div>
  );
}
