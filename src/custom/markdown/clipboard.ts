import { Extension, type JSONContent } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

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

/**
 * Plain-text paste that looks like markdown becomes real nodes through the
 * official Markdown extension; copying produces markdown text. Rich (HTML)
 * pastes and file pastes are left to ProseMirror and FileHandler.
 */
export const MarkdownClipboard = Extension.create({
  name: 'markdownClipboard',

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey('markdownClipboard'),
        props: {
          handlePaste(_view, event) {
            const data = event.clipboardData;
            if (!data || data.files.length > 0) return false;
            if (Array.from(data.types).includes('text/html')) return false;
            const text = data.getData('text/plain');
            if (!text || !looksLikeMarkdown(text)) return false;
            try {
              return editor.commands.insertContent(text, { contentType: 'markdown' });
            } catch {
              return false;
            }
          },
          clipboardTextSerializer(slice) {
            try {
              const manager = editor.markdown;
              if (!manager) throw new Error('markdown manager missing');
              return manager.serialize({ type: 'doc', content: slice.content.toJSON() as JSONContent[] });
            } catch {
              return slice.content.textBetween(0, slice.content.size, '\n\n');
            }
          },
        },
      }),
    ];
  },
});
