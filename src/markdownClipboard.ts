import { DOMParser as PMDOMParser, DOMSerializer, Slice, type Schema } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import { marked } from 'marked';
import TurndownService from 'turndown';

/**
 * Clipboard bridging between markdown text and the editor's node tree.
 *
 * Both directions deliberately route through HTML rather than a markdown-aware
 * Tiptap extension. The schema already knows how to parse and serialise every
 * node it owns — including the custom wiki-link and math nodes — so reusing
 * that avoids maintaining a second, parallel set of node rules.
 */

/**
 * Markers that indicate the pasted text is markdown rather than prose that
 * merely contains punctuation. Kept conservative: a false positive rewrites
 * text the user wanted verbatim, which is worse than a missed conversion.
 */
const MARKDOWN_PATTERNS: RegExp[] = [
  /^#{1,6}\s+\S/m,            // headings
  /^\s*[-*+]\s+\S/m,          // bullet list
  /^\s*\d+\.\s+\S/m,          // ordered list
  /^\s*>\s+\S/m,              // blockquote
  /^\s*```/m,                 // fenced code
  /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/m, // horizontal rule
  // Emphasis can't open with whitespace, so `a ** b ** c` (exponentiation)
  // is not a match. Underscore-bold is deliberately absent: `__init__` and
  // similar identifiers are far more common in pasted text than `__bold__`,
  // and any real markdown document will trip one of the other patterns.
  /\*\*\S[^*\n]*\*\*/,        // bold
  /\[[^\]\n]+\]\([^)\n]+\)/,  // link
  /^\s*[-*+]\s+\[[ xX]\]\s/m, // task list
  /^\s*\|.+\|\s*$/m,          // table row
];

export function looksLikeMarkdown(text: string): boolean {
  return MARKDOWN_PATTERNS.some((re) => re.test(text));
}

let turndown: TurndownService | null = null;

function getTurndown(): TurndownService {
  if (turndown) return turndown;

  turndown = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**',
  });

  // Task items carry their state in `data-checked`; without this they'd
  // serialise as ordinary bullets and lose the checkbox.
  turndown.addRule('taskItem', {
    filter: (node) => node.nodeName === 'LI' && node.hasAttribute('data-checked'),
    replacement: (content, node) => {
      const checked = (node as HTMLElement).getAttribute('data-checked') === 'true';
      const body = content.replace(/^\n+/, '').replace(/\n+$/, '').replace(/\n/g, '\n  ');
      return `- [${checked ? 'x' : ' '}] ${body}\n`;
    },
  });

  // Wiki links render as plain display text, so the [[…]] syntax has to be
  // rebuilt from the node's attributes.
  turndown.addRule('wikiLink', {
    filter: (node) => node.nodeName === 'SPAN' && node.hasAttribute('data-wiki-link'),
    replacement: (content, node) => {
      const el = node as HTMLElement;
      const label = el.getAttribute('label') ?? el.getAttribute('data-label') ?? content;
      return `[[${label}]]`;
    },
  });

  // Math nodes already render their own $…$ / $$…$$ delimiters as text
  // content; passing them through unchanged preserves the source.
  turndown.addRule('math', {
    filter: (node) =>
      node.hasAttribute?.('data-math-inline') || node.hasAttribute?.('data-math-block'),
    replacement: (content) => content,
  });

  return turndown;
}

/** Parses markdown into a slice using the editor's own HTML parse rules. */
export function markdownToSlice(markdown: string, schema: Schema): Slice {
  const html = marked.parse(markdown, { async: false, gfm: true, breaks: false }) as string;
  const doc = new window.DOMParser().parseFromString(html, 'text/html');
  return PMDOMParser.fromSchema(schema).parseSlice(doc.body, {
    preserveWhitespace: false,
  });
}

/** Serialises a copied slice back to markdown text. */
export function sliceToMarkdown(slice: Slice, schema: Schema): string {
  const fragment = DOMSerializer.fromSchema(schema).serializeFragment(slice.content);
  const container = document.createElement('div');
  container.appendChild(fragment);
  return getTurndown().turndown(container.innerHTML);
}

/**
 * `editorProps` fragment wiring both directions into Tiptap.
 *
 * Paste only intercepts plain text: when the clipboard also carries HTML the
 * source was already rich, and ProseMirror's own parsing beats round-tripping
 * through markdown.
 */
export const markdownClipboardProps = {
  handlePaste(view: EditorView, event: ClipboardEvent): boolean {
    const data = event.clipboardData;
    if (!data) return false;
    if (Array.from(data.types).includes('text/html')) return false;

    const text = data.getData('text/plain');
    if (!text || !looksLikeMarkdown(text)) return false;

    try {
      const slice = markdownToSlice(text, view.state.schema);
      view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
      event.preventDefault();
      return true;
    } catch {
      // Fall back to the default plain-text paste rather than dropping input.
      return false;
    }
  },

  clipboardTextSerializer(slice: Slice, view: EditorView): string {
    try {
      return sliceToMarkdown(slice, view.state.schema);
    } catch {
      return slice.content.textBetween(0, slice.content.size, '\n\n');
    }
  },
};
