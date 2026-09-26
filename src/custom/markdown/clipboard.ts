/**
 * Markdown paste: clipboard content that looks like markdown is parsed into
 * document nodes, whether or not the clipboard also carries HTML.
 *
 * Text-only clipboards go through `clipboardTextParser`. Most real sources
 * also attach text/html, which ProseMirror prefers, so `handlePaste` checks
 * that HTML: if it has real structure (headings, lists, tables, links,
 * inline formatting, or any `class` attribute, which is how syntax
 * highlighters on web pages mark code), ProseMirror's HTML parse stands. If
 * it is only a rendering of plain text (VS Code's styled div/span lines, a
 * bare `<pre>` from Notepad++ and similar editors), the text/plain side is
 * converted as markdown instead. Shift+paste always pastes literal text.
 */
import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Slice } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';

/**
 * Conservative markers that plain text is markdown rather than prose with
 * punctuation. A false positive rewrites text the user wanted verbatim, which
 * is worse than a missed conversion.
 */
const MARKDOWN_PATTERNS: RegExp[] = [
  /^#{1,6}\s+\S/m,
  /^\s*[-*+]\s+\S/m,
  /^\s*\d+\.\s+\S/m,
  /^\s*>\s+\S/m,
  /^\s*```/m,
  /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/m,
  /\*\*\S[^*\n]*\*\*/,
  /\[[^\]\n]+\]\([^)\n]+\)/,
  /^\s*[-*+]\s+\[[ xX]\]\s/m,
  /^\s*\|.+\|\s*$/m,
  /==\S[^=\n]*==/,
  /\[\[[^[\]\n]+\]\]/,
  /^\s*\$\$/m,
  /^:::details/m,
];

export function looksLikeMarkdown(text: string): boolean {
  return MARKDOWN_PATTERNS.some((re) => re.test(text));
}

/** Elements that mean the HTML is a real rich-text document, not a rendering of plain text. */
const STRUCTURE_SELECTOR =
  'h1,h2,h3,h4,h5,h6,ul,ol,li,table,blockquote,img,a[href],hr,code,strong,em,i,u,s,[class]';

/**
 * Whether clipboard HTML carries structure worth keeping. Code editors put a
 * styled rendering of the plain text on the clipboard (div/span/br with
 * inline `style`, or a bare `<pre>`); that has no structure, and its
 * text/plain side is the markdown the user copied. Any `class` attribute
 * counts as structure because syntax highlighters on web pages use classes,
 * and a snippet copied from GitHub or StackOverflow must stay code. Google
 * Docs wraps everything in `<b id="docs-internal-guid-...">`, which is not bold.
 */
export function htmlHasStructure(html: string): boolean {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (doc.querySelector(STRUCTURE_SELECTOR)) return true;
  return Array.from(doc.querySelectorAll('b')).some((b) => !(b.getAttribute('id') ?? '').startsWith('docs-internal-guid'));
}

/**
 * The slice a markdown paste inserts, shared by the text-only and HTML paths
 * so both agree. A single plain paragraph (e.g. one line of inline markdown)
 * is inserted inline at the caret rather than as a sibling block; any other
 * content — including a single heading, codeBlock or blockquote — keeps its
 * own block type. Null when the text cannot be parsed.
 */
export function markdownSlice(text: string, view: EditorView, editor: Editor): Slice | null {
  try {
    const json = editor.markdown?.parse(text);
    if (!json) return null;
    const doc = view.state.schema.nodeFromJSON(json);
    const onlyChild = doc.childCount === 1 ? doc.firstChild : null;
    const paragraphType = view.state.schema.nodes['paragraph'];
    if (onlyChild && paragraphType && onlyChild.type === paragraphType) return Slice.maxOpen(doc.content);
    return new Slice(doc.content, 0, 0);
  } catch {
    return null;
  }
}

export const markdownClipboardKey = new PluginKey('markdownClipboard');

/**
 * Pasted text that looks like markdown becomes real nodes through the
 * official Markdown extension; copying produces markdown text. Structured
 * HTML pastes and file pastes are left to ProseMirror and FileHandler.
 *
 * Text-only clipboards go through `clipboardTextParser`, which ProseMirror's
 * own paste pipeline calls with the resolved context; returning a falsy value
 * (even though the type declares a non-nullable `Slice` return) makes it fall
 * back to its default plain-text handling, as `parseFromClipboard` confirms.
 * When the clipboard carries HTML, ProseMirror never calls that parser (except
 * for Shift+paste), so `handlePaste` — which runs after parsing, with the
 * raw event — replaces the HTML result when that HTML has no structure.
 */
export const MarkdownClipboard = Extension.create({
  name: 'markdownClipboard',

  addProseMirrorPlugins() {
    const editor = this.editor;
    let plainParse = false;
    return [
      new Plugin({
        key: markdownClipboardKey,
        props: {
          clipboardTextParser(text, $context, plain, view) {
            // A Shift+paste (plain) is the only way ProseMirror calls this
            // parser for a clipboard that carries HTML, and it does so just
            // before `handlePaste` — which is how that hook knows the user
            // asked for literal text.
            plainParse = plain;
            // Shift-paste (plain) always takes the default plain-text path.
            if (plain) return null as unknown as Slice;
            if (!looksLikeMarkdown(text)) return null as unknown as Slice;
            // ProseMirror already routes code-block pastes as plain text
            // before ever calling this hook, but an inline code mark at the
            // caret isn't caught by that check, so both are guarded here.
            if ($context.parent.type.spec.code) return null as unknown as Slice;
            if ($context.marks().some((m) => m.type.spec.code)) return null as unknown as Slice;
            return markdownSlice(text, view, editor) ?? (null as unknown as Slice);
          },
          handlePaste(view, event) {
            // Runs after ProseMirror has parsed the clipboard; only the case
            // where it chose unstructured HTML over markdown text is taken over.
            const wasPlain = plainParse;
            plainParse = false;
            if (wasPlain) return false;
            const data = event.clipboardData;
            if (!data) return false;
            const html = data.getData('text/html');
            if (!html) return false;
            if (data.files.length > 0) return false;
            const { $from } = view.state.selection;
            if ($from.parent.type.spec.code) return false;
            if ($from.marks().some((m) => m.type.spec.code)) return false;
            const text = data.getData('text/plain');
            if (!looksLikeMarkdown(text)) return false;
            if (htmlHasStructure(html)) return false;
            const slice = markdownSlice(text, view, editor);
            if (!slice) return false;
            view.dispatch(
              view.state.tr.replaceSelection(slice).scrollIntoView().setMeta('paste', true).setMeta('uiEvent', 'paste'),
            );
            return true;
          },
          handleDrop() {
            // A drop also runs the text parser but never calls `handlePaste`.
            plainParse = false;
            return false;
          },
          clipboardTextSerializer(slice, view) {
            try {
              // Decide from the selection, not the slice's shape: a
              // selection that starts and ends in the same textblock parent
              // (a partial-word selection, a line inside a code block) is
              // copied verbatim. Anything else — including a selection
              // spanning several blocks, or a CellSelection over a table,
              // which has no single textblock parent at all — is rendered as
              // markdown so list markers and table pipes survive the copy.
              const { $from, $to } = view.state.selection;
              if ($from.sameParent($to) && $from.parent.isTextblock) {
                return slice.content.textBetween(0, slice.content.size, '\n\n');
              }
              const manager = editor.markdown;
              if (!manager) throw new Error('markdown manager missing');
              return manager.serialize({ type: 'doc', content: slice.content.toJSON() ?? [] });
            } catch {
              return slice.content.textBetween(0, slice.content.size, '\n\n');
            }
          },
        },
      }),
    ];
  },
});
