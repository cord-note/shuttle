import { Node, mergeAttributes, InputRule } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { MathInlineView, MathBlockView } from './MathViews';

export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { latex: { default: '' } };
  },

  parseHTML() {
    return [{ tag: 'span[data-math-inline]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-math-inline': '' }, HTMLAttributes), `$${node.attrs.latex}$`];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathInlineView);
  },

  addInputRules() {
    return [
      new InputRule({
        find: /\$([^$\n]+)\$$/,
        handler: ({ state, range, match }) => {
          const latex = match[1] ?? '';
          const nodeType = state.schema.nodes.mathInline;
          if (!nodeType) return;
          const { tr } = state;
          tr.replaceWith(range.from, range.to, [nodeType.create({ latex })]);
        },
      }),
    ];
  },
});

export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return { latex: { default: '' } };
  },

  parseHTML() {
    return [{ tag: 'div[data-math-block]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-math-block': '' }, HTMLAttributes), `$$${node.attrs.latex}$$`];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathBlockView);
  },

  addInputRules() {
    return [
      new InputRule({
        find: /\$\$([^$]+)\$\$$/,
        handler: ({ state, range, match }) => {
          const latex = match[1] ?? '';
          const nodeType = state.schema.nodes.mathBlock;
          if (!nodeType) return;
          const { tr } = state;
          tr.replaceWith(range.from, range.to, [nodeType.create({ latex })]);
        },
      }),
    ];
  },
});
