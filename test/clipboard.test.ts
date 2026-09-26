import { describe, it, expect, afterEach } from 'bun:test';
import { Editor, type AnyExtension, type Content, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { Fragment, Slice } from '@tiptap/pm/model';
import { TableKit } from '@tiptap/extension-table';
import { CellSelection } from '@tiptap/pm/tables';
import { MarkdownClipboard, htmlHasStructure, markdownClipboardKey } from '../src/custom/markdown/clipboard';

let editor: Editor | null = null;
afterEach(() => { editor?.destroy(); editor = null; });

function make(content: Content, extra: AnyExtension[] = []): Editor {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit, Markdown, MarkdownClipboard, ...extra],
    content,
  });
  return editor;
}

/**
 * `Editor.getJSON()` is typed with a strict `NodeType | TextType` union for
 * `content` (so a text node's `.content` and a node's `.text` are typed as
 * absent), which is more precise than useful here. Widen to the general
 * `JSONContent` shape (which declares both as optional) so tests can freely
 * inspect `.content`/`.text`/`.marks` on arbitrary nodes.
 */
function toJSON(e: Editor): JSONContent {
  return e.getJSON();
}

/** Position at the very start of the first text node matching `text`. */
function startOfText(e: Editor, text: string): number {
  let found = -1;
  e.state.doc.descendants((node, pos) => {
    if (found !== -1) return false;
    if (node.isText && node.text === text) { found = pos; return false; }
    return true;
  });
  return found;
}

/**
 * Simulates an ordinary (non-Shift) paste of plain text through the same
 * `clipboardTextParser` hook a real paste event uses.
 *
 * `editor.view.pasteText(text)` looks like the obvious way to simulate this,
 * and it does route through `clipboardTextParser` — but reading
 * prosemirror-view's source (`pasteText` -> `doPaste(this, text, null, true,
 * event)`) shows it hardcodes `preferPlain: true`, which flows straight
 * through as the `plain` argument `clipboardTextParser` receives. That `true`
 * is indistinguishable from a real Shift+paste (in `editHandlers.paste`,
 * `plain` is `view.input.shiftKey && ...`) — so `pasteText` cannot simulate
 * an ordinary Ctrl+V of plain-text clipboard content; it only ever simulates
 * "paste as plain text". Since our `clipboardTextParser` is spec'd to bail
 * out whenever `plain` is true (respecting that Shift+paste request), using
 * `pasteText` for the tests that need actual markdown conversion would
 * always exercise the bail branch instead of the parser, no matter how the
 * extension is implemented — confirmed empirically: with `pasteText`, e.g.
 * `'**bold** word '` came through completely unconverted.
 *
 * `pasteText` remains the right call for cases whose expected outcome holds
 * regardless of `plain` (code-block / inline-code contexts bail before or
 * independently of the `plain` check, and non-markdown text is left alone
 * either way) — see the tests below. For the cases that must actually
 * exercise conversion, this helper calls `clipboardTextParser` directly with
 * `plain: false` (matching a real unmodified Ctrl+V) and then dispatches the
 * resulting slice exactly the way prosemirror-view's own `doPaste` does, so
 * paste/undo grouping still matches production behavior.
 */
function pasteMarkdown(e: Editor, text: string): void {
  const view = e.view;
  const $context = view.state.selection.$from;
  const parsed = view.someProp('clipboardTextParser', (f) => f(text, $context, false, view));
  let slice: Slice;
  if (parsed) {
    slice = parsed;
  } else {
    // Mirror ProseMirror's own fallback (one <p> per line) for completeness,
    // though the tests using this helper always produce a `parsed` slice.
    const marks = $context.marks();
    const schema = view.state.schema;
    const paragraphType = schema.nodes['paragraph'];
    if (!paragraphType) throw new Error('schema has no paragraph node');
    const paragraphs = text
      .split(/(?:\r\n?|\n)+/)
      .map((line) => paragraphType.create(null, line ? schema.text(line, marks) : undefined));
    slice = Slice.maxOpen(Fragment.fromArray(paragraphs));
  }
  const singleNode =
    slice.openStart === 0 && slice.openEnd === 0 && slice.content.childCount === 1 ? slice.content.firstChild : null;
  const tr = singleNode ? view.state.tr.replaceSelectionWith(singleNode, false) : view.state.tr.replaceSelection(slice);
  view.dispatch(tr.scrollIntoView().setMeta('paste', true).setMeta('uiEvent', 'paste'));
}

describe('markdown paste', () => {
  it('leaves a paste inside a code block as literal text', () => {
    const e = make({
      type: 'doc',
      content: [{ type: 'codeBlock', content: [{ type: 'text', text: 'let x = 1' }] }],
    });
    e.commands.setTextSelection(1 + 'let x = 1'.length);
    e.view.pasteText('# Title\n- item');

    const json = toJSON(e);
    // StarterKit's TrailingNode appends an empty paragraph after a doc ending
    // in a codeBlock (as it does after any non-default trailing block) — see
    // the same behavior documented for the details tests.
    expect(json.content?.map((n) => n.type)).toEqual(['codeBlock', 'paragraph']);
    expect(json.content?.[0]?.content?.map((c) => c.text).join('')).toBe('let x = 1# Title\n- item');
  });

  it('leaves a paste inside an inline code mark as literal text', () => {
    const e = make('<p><code>xyz</code></p>');
    const pos = startOfText(e, 'xyz');
    e.commands.setTextSelection(pos + 1);
    e.view.pasteText('**x** y');

    const json = toJSON(e);
    expect(json.content?.length).toBe(1);
    expect(json.content?.[0]?.type).toBe('paragraph');
    const text = (json.content?.[0]?.content ?? []).map((n) => n.text).join('');
    expect(text).toContain('**x** y');
  });

  it('inserts inline markdown inline, merging into the surrounding paragraph', () => {
    const e = make('<p>one two</p>');
    const start = startOfText(e, 'one two');
    // caret between 'one ' and 'two'
    e.commands.setTextSelection(start + 4);
    pasteMarkdown(e, '**bold** word ');

    const json = toJSON(e);
    expect(json.content?.length).toBe(1);
    expect(json.content?.[0]?.type).toBe('paragraph');
    const nodes = json.content?.[0]?.content ?? [];
    const text = nodes.map((n) => n.text).join('');
    expect(text).toBe('one bold word two');
    const boldNode = nodes.find((n) => n.text === 'bold');
    expect(boldNode?.marks?.some((m) => m.type === 'bold')).toBe(true);
  });

  it('inserts block markdown as sibling blocks into an empty doc', () => {
    const e = make('<p></p>');
    e.commands.setTextSelection(1);
    pasteMarkdown(e, '# Title\n\n- a\n- b');

    // StarterKit's TrailingNode appends an empty paragraph after a doc ending
    // in a bulletList, same as after codeBlock/blockquote/details elsewhere.
    const types = (e.getJSON().content ?? []).map((n) => n.type);
    expect(types).toEqual(['heading', 'bulletList', 'paragraph']);
  });

  it('inserts a pasted heading as its own block, not merged into the surrounding paragraph', () => {
    const e = make('<p>ab</p>');
    const start = startOfText(e, 'ab');
    // caret between 'a' and 'b'
    e.commands.setTextSelection(start + 1);
    pasteMarkdown(e, '# Title');

    const types = (toJSON(e).content ?? []).map((n) => n.type);
    expect(types).toEqual(['paragraph', 'heading', 'paragraph']);
    const heading = toJSON(e).content?.[1];
    expect(heading?.content?.map((n) => n.text).join('')).toBe('Title');
    // Never merged into a single paragraph like 'aTitleb'.
    expect(JSON.stringify(toJSON(e))).not.toContain('aTitleb');
  });

  it('inserts a pasted fenced code block as a codeBlock, not merged inline', () => {
    const e = make('<p></p>');
    e.commands.setTextSelection(1);
    pasteMarkdown(e, '```js\nconst x = 1\n```');

    const json = toJSON(e);
    const codeBlock = json.content?.find((n) => n.type === 'codeBlock');
    expect(codeBlock).toBeDefined();
    expect(codeBlock?.content?.map((n) => n.text).join('')).toBe('const x = 1');
  });

  it('is a single undo step', () => {
    const e = make('<p>one two</p>');
    const before = e.getJSON();
    const start = startOfText(e, 'one two');
    e.commands.setTextSelection(start + 4);
    pasteMarkdown(e, '**bold** word ');

    expect(e.getJSON()).not.toEqual(before);
    e.commands.undo();
    expect(e.getJSON()).toEqual(before);
  });

  it('leaves non-markdown plain text alone (falls through to default paste)', () => {
    const e = make('<p></p>');
    e.commands.setTextSelection(1);
    e.view.pasteText('just plain words');

    const json = toJSON(e);
    expect(json.content?.length).toBe(1);
    expect(json.content?.[0]?.type).toBe('paragraph');
    expect(json.content?.[0]?.content?.[0]?.text).toBe('just plain words');
  });

  it('a Shift+paste (plain) of markdown text is left as literal lines', () => {
    const e = make('<p></p>');
    e.commands.setTextSelection(1);
    // pasteText always simulates the "paste as plain text" (Shift) request.
    e.view.pasteText('# Title\n\n- a\n- b');
    const types = (e.getJSON().content ?? []).map((n) => n.type);
    expect(types.every((t) => t === 'paragraph')).toBe(true);
    expect(JSON.stringify(e.getJSON())).toContain('# Title');
  });
});

describe('markdown copy', () => {
  function serialize(e: Editor, from: number, to: number): string {
    e.commands.setTextSelection({ from, to });
    const slice = e.state.selection.content();
    const result = e.view.someProp('clipboardTextSerializer', (f) => f(slice, e.view));
    return result ?? slice.content.textBetween(0, slice.content.size, '\n\n');
  }

  it('copies a partial selection inside a code block as literal characters', () => {
    const e = make({
      type: 'doc',
      content: [{ type: 'codeBlock', content: [{ type: 'text', text: 'a * b_c *' }] }],
    });
    // select "* b_c *" inside the code block (skip leading "a ")
    const from = 1 + 2;
    const to = 1 + 'a * b_c *'.length;
    const text = serialize(e, from, to);
    expect(text).toBe('* b_c *');
  });

  it('copies part of a list item word without the list marker', () => {
    const e = make({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }] }],
        },
      ],
    });
    const start = startOfText(e, 'hello');
    const text = serialize(e, start, start + 3);
    expect(text).toBe('hel');
  });

  it('renders markdown for a selection spanning a heading and a paragraph', () => {
    const e = make({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Body' }] },
      ],
    });
    const text = serialize(e, 0, e.state.doc.content.size);
    expect(text).toContain('# ');
  });

  it('copying two whole list items keeps their list markers', () => {
    const e = make({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }] }] },
          ],
        },
      ],
    });
    const text = serialize(e, 0, e.state.doc.content.size);
    expect(text).toContain('- ');
    expect(text).toContain('one');
    expect(text).toContain('two');
  });

  it('copying a table CellSelection renders a markdown table', () => {
    const e = make(
      `<table><tbody>
        <tr><td>a1</td><td>a2</td></tr>
        <tr><td>b1</td><td>b2</td></tr>
      </tbody></table>`,
      [TableKit],
    );
    const cellPositions: number[] = [];
    e.state.doc.descendants((node, pos) => {
      if (node.type.name === 'tableCell') cellPositions.push(pos);
    });
    // Corner-to-corner selection covering all four cells. CellSelection's
    // anchor/head must resolve at the row's depth (the position right
    // before the cell), not one level deeper inside the cell's own content.
    const anchorCellPos = cellPositions[0];
    const headCellPos = cellPositions[3];
    if (anchorCellPos === undefined || headCellPos === undefined) throw new Error('expected 4 table cells');
    const selection = CellSelection.create(e.state.doc, anchorCellPos, headCellPos);
    e.view.dispatch(e.state.tr.setSelection(selection));

    const slice = e.state.selection.content();
    const result = e.view.someProp('clipboardTextSerializer', (f) => f(slice, e.view));
    expect(result).toContain('|');
    expect(result).toContain('a1');
    expect(result).toContain('b2');
  });
});

describe('markdown paste with an HTML clipboard', () => {
  const VSCODE_HTML =
    '<meta charset="utf-8"><div style="color: #cccccc;background-color: #1f1f1f;font-family: Consolas;font-weight: normal;font-size: 14px;line-height: 19px;white-space: pre;">' +
    '<div><span style="color: #569cd6;font-weight: bold;"># Title</span></div><br>' +
    '<div><span style="color: #6796e6;">-</span><span style="color: #cccccc;"> one</span></div>' +
    '<div><span style="color: #6796e6;">-</span><span style="color: #cccccc;"> two</span></div></div>';
  const MD = '# Title\n\n- one\n- two';

  function pasteEvent(e: Editor, text: string, html: string): void {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    dt.setData('text/html', html);
    e.view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }

  /** Calls only our plugin's `handlePaste`, so other plugins' paste handlers don't mask the result. */
  function ourHandlePaste(e: Editor, text: string, html: string): boolean {
    const plugin = markdownClipboardKey.get(e.state);
    const handler = plugin?.props.handlePaste;
    if (!plugin || !handler) throw new Error('markdownClipboard has no handlePaste');
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    dt.setData('text/html', html);
    const event = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    return handler.call(plugin, e.view, event, Slice.empty) === true;
  }

  const types = (e: Editor): (string | undefined)[] => (toJSON(e).content ?? []).map((n) => n.type);

  it('converts markdown copied from VS Code (styled div/span HTML)', () => {
    const e = make('<p></p>');
    e.commands.setTextSelection(1);
    pasteEvent(e, MD, VSCODE_HTML);
    expect(types(e)).toEqual(['heading', 'bulletList', 'paragraph']);
    expect(JSON.stringify(toJSON(e))).not.toContain('# Title');
  });

  it('converts markdown wrapped in a bare <pre> instead of making a code block', () => {
    const e = make('<p></p>');
    e.commands.setTextSelection(1);
    pasteEvent(e, '# Title\n\n- one', '<pre># Title\n\n- one</pre>');
    expect(types(e)).toEqual(['heading', 'bulletList', 'paragraph']);
  });

  it('leaves rich HTML to ProseMirror', () => {
    const e = make('<p></p>');
    e.commands.setTextSelection(1);
    const html = '<h1>Title</h1><ul><li>one</li></ul>';
    expect(ourHandlePaste(e, '# Title\n\n- one', html)).toBe(false);
    pasteEvent(e, '# Title\n\n- one', html);
    expect(types(e).slice(0, 2)).toEqual(['heading', 'bulletList']);
  });

  it('keeps a highlighted code snippet as code', () => {
    const e = make('<p></p>');
    e.commands.setTextSelection(1);
    const html = '<pre><code class="language-python"># comment\nx = 1</code></pre>';
    expect(ourHandlePaste(e, '# comment\nx = 1', html)).toBe(false);
    pasteEvent(e, '# comment\nx = 1', html);
    expect(types(e)).not.toContain('heading');
  });

  it('does not convert inside a code block', () => {
    const e = make({ type: 'doc', content: [{ type: 'codeBlock', content: [{ type: 'text', text: 'x' }] }] });
    e.commands.setTextSelection(2);
    expect(ourHandlePaste(e, MD, VSCODE_HTML)).toBe(false);
  });

  it('pasting from VS Code is a single undo step', () => {
    const e = make('<p></p>');
    const before = e.getJSON();
    e.commands.setTextSelection(1);
    pasteEvent(e, MD, VSCODE_HTML);
    expect(e.getJSON()).not.toEqual(before);
    e.commands.undo();
    expect(e.getJSON()).toEqual(before);
  });
});

describe('htmlHasStructure', () => {
  it('treats editor-style HTML as unstructured', () => {
    expect(htmlHasStructure('<div style="white-space: pre"><div><span style="color:red"># x</span></div><br></div>')).toBe(false);
    expect(htmlHasStructure('<pre># Title</pre>')).toBe(false);
    expect(htmlHasStructure('<meta charset="utf-8"><p>a</p><div>b</div><span>c</span><br>')).toBe(false);
  });

  it('ignores the Google Docs <b> wrapper', () => {
    expect(htmlHasStructure('<b id="docs-internal-guid-1234" style="font-weight:normal"><p><span>a</span></p></b>')).toBe(false);
  });

  it('detects real structure', () => {
    for (const html of [
      '<h2>x</h2>', '<ul><li>x</li></ul>', '<ol><li>x</li></ol>', '<table><tr><td>x</td></tr></table>',
      '<blockquote>x</blockquote>', '<img src="a.png">', '<a href="https://x">x</a>', '<hr>',
      '<code>x</code>', '<strong>x</strong>', '<em>x</em>', '<i>x</i>', '<u>x</u>', '<s>x</s>', '<b>bold</b>',
      '<span class="hljs-comment"># x</span>',
    ]) {
      expect(htmlHasStructure(html)).toBe(true);
    }
  });
});

describe('Shift+paste with an HTML clipboard', () => {
  it('pastes literal text', () => {
    const e = make('<p></p>');
    e.commands.setTextSelection(1);
    e.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', keyCode: 16, shiftKey: true, bubbles: true }));
    const dt = new DataTransfer();
    dt.setData('text/plain', '# Title\n\n- one');
    dt.setData('text/html', '<div style="white-space: pre"><div># Title</div><br><div>- one</div></div>');
    e.view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    e.view.dom.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', keyCode: 16, bubbles: true }));
    const types = (e.getJSON().content ?? []).map((n) => n.type);
    expect(types.every((t) => t === 'paragraph')).toBe(true);
    expect(JSON.stringify(e.getJSON())).toContain('# Title');
  });
});
