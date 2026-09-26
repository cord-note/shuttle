import type { JSONContent } from '@tiptap/core';

export const text = (t: string, marks?: JSONContent['marks']): JSONContent => ({ type: 'text', text: t, ...(marks ? { marks } : {}) });
export const para = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content });

/** A document using every node and mark in the schema. */
export const EVERYTHING: JSONContent = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [text('Title')] },
    para(
      text('b', [{ type: 'bold' }]), text('i', [{ type: 'italic' }]), text('u', [{ type: 'underline' }]),
      text('s', [{ type: 'strike' }]), text('c', [{ type: 'code' }]), text('h', [{ type: 'highlight' }]),
      text('sub', [{ type: 'subscript' }]), text('sup', [{ type: 'superscript' }]),
      text('link', [{ type: 'link', attrs: { href: 'https://example.com' } }]),
      { type: 'inlineMath', attrs: { latex: 'x^2' } },
      { type: 'mention', attrs: { id: 'n-alpha', label: 'Alpha', displayText: null, mentionSuggestionChar: '[[' } },
      { type: 'fragmentLink', attrs: { linkId: 'l1', toNoteId: 'n-beta', toFragmentId: null, label: 'Beta' } },
      // Text after the break: a trailing hard break at the end of a block has
      // no markdown form (CommonMark drops it), which is not what this tests.
      { type: 'hardBreak' },
      text('after break'),
    ),
    { type: 'bulletList', content: [{ type: 'listItem', content: [para(text('a'))] }] },
    { type: 'orderedList', content: [{ type: 'listItem', content: [para(text('1'))] }] },
    { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [para(text('done'))] }] },
    { type: 'blockquote', content: [para(text('q'))] },
    { type: 'codeBlock', attrs: { language: 'ts' }, content: [text('const a = 1')] },
    { type: 'blockMath', attrs: { latex: '\\int x' } },
    { type: 'horizontalRule' },
    { type: 'image', attrs: { src: 'attachment:abc', alt: 'pic' } },
    { type: 'youtube', attrs: { src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } },
    { type: 'twitch', attrs: { src: 'https://www.twitch.tv/videos/1234567890' } },
    {
      type: 'table',
      content: [
        { type: 'tableRow', content: [{ type: 'tableHeader', content: [para(text('H'))] }] },
        { type: 'tableRow', content: [{ type: 'tableCell', content: [para(text('C'))] }] },
      ],
    },
    {
      type: 'details',
      content: [
        { type: 'detailsSummary', content: [text('More')] },
        { type: 'detailsContent', content: [para(text('hidden'))] },
      ],
    },
    { type: 'blockRef', attrs: { refBlockId: 'b1', refNoteId: 'n-beta' } },
    para(),
  ],
};
