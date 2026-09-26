import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Slice } from '@tiptap/pm/model';

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
 *
 * Paste goes through `clipboardTextParser` rather than `handlePaste`:
 * `handlePaste` only sees the raw event and would have to reimplement
 * ProseMirror's plain/code/context handling itself, whereas
 * `clipboardTextParser` is called by ProseMirror's own paste pipeline with
 * the resolved drop context already computed, and returning a falsy value
 * (even though the type declares a non-nullable `Slice` return) tells
 * ProseMirror to fall back to its default plain-text handling — that runtime
 * behavior is confirmed in prosemirror-view's `parseFromClipboard`.
 */
export const MarkdownClipboard = Extension.create({
  name: 'markdownClipboard',

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey('markdownClipboard'),
        props: {
          clipboardTextParser(text, $context, plain, view) {
            // Shift-paste (plain) always takes the default plain-text path.
            if (plain) return null as unknown as Slice;
            if (!looksLikeMarkdown(text)) return null as unknown as Slice;
            // ProseMirror already routes code-block pastes as plain text
            // before ever calling this hook, but an inline code mark at the
            // caret isn't caught by that check, so both are guarded here.
            if ($context.parent.type.spec.code) return null as unknown as Slice;
            if ($context.marks().some((m) => m.type.spec.code)) return null as unknown as Slice;
            try {
              const manager = editor.markdown;
              const json = manager?.parse(text);
              if (!json) return null as unknown as Slice;
              const doc = view.state.schema.nodeFromJSON(json);
              const onlyChild = doc.childCount === 1 ? doc.firstChild : null;
              const paragraphType = view.state.schema.nodes['paragraph'];
              if (onlyChild && paragraphType && onlyChild.type === paragraphType) {
                // A single plain paragraph (e.g. one line of inline markdown)
                // is inserted inline at the caret rather than as a sibling
                // block. Any OTHER single block — heading, codeBlock,
                // blockquote — keeps its own type rather than being merged
                // into the surrounding paragraph's inline content.
                return Slice.maxOpen(doc.content);
              }
              return new Slice(doc.content, 0, 0);
            } catch {
              return null as unknown as Slice;
            }
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
