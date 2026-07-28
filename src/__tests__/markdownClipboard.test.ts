import { describe, expect, test } from 'bun:test';
import { looksLikeMarkdown } from '../markdownClipboard';

// A false positive here silently rewrites text the user pasted verbatim, so
// the negative cases matter more than the positive ones.

describe('looksLikeMarkdown', () => {
  describe('recognises markdown', () => {
    const cases: [string, string][] = [
      ['heading',        '# Title'],
      ['deep heading',   '### Section'],
      ['bullet list',    '- first\n- second'],
      ['star bullet',    '* first'],
      ['ordered list',   '1. first\n2. second'],
      ['blockquote',     '> quoted'],
      ['fenced code',    '```ts\nconst a = 1;\n```'],
      ['horizontal rule','before\n\n---\n\nafter'],
      ['bold',           'some **bold** text'],
      ['link',           'see [docs](https://example.com)'],
      ['task list',      '- [ ] todo\n- [x] done'],
      ['table',          '| a | b |\n| - | - |'],
      ['mixed document', '# Notes\n\nSome text with a [link](x) and:\n\n- a bullet'],
    ];

    for (const [name, input] of cases) {
      test(name, () => {
        expect(looksLikeMarkdown(input)).toBe(true);
      });
    }
  });

  describe('leaves plain text alone', () => {
    const cases: [string, string][] = [
      ['empty',             ''],
      ['single word',       'hello'],
      ['sentence',          'The meeting is at 3pm tomorrow.'],
      ['paragraphs',        'First paragraph.\n\nSecond paragraph.'],
      ['hash without space','#hashtag and #another'],
      ['bare url',          'https://example.com/a-b-c'],
      ['maths minus',       'x - y = z'],
      ['single asterisk',   'a * b * c'],
      ['dashed words',      'well-known copy-paste round-trip'],
      ['dunder identifier', 'call foo_bar_baz() then __init__'],
      ['exponent operator', 'result = a ** b ** c'],
      ['decimal',           'version 1. 5 released'],
      ['windows path',      'C:\\Users\\me\\notes.txt'],
    ];

    for (const [name, input] of cases) {
      test(name, () => {
        expect(looksLikeMarkdown(input)).toBe(false);
      });
    }
  });
});
