import { describe, it, expect } from 'bun:test';
import { looksLikeMarkdown } from '../src/custom/markdown/clipboard';

describe('looksLikeMarkdown', () => {
  it.each([
    '# Title', '- item', '1. first', '> quote', '```js', '---', '**bold** text',
    '[a](https://x.y)', '- [ ] task', '| a | b |', '==mark==', '[[Alpha]]', '$$\nx\n$$', ':::details S',
  ])('detects %p', (s) => expect(looksLikeMarkdown(s)).toBe(true));

  it.each(['plain words', 'a ** b ** c', '__init__', 'costs $5 and $6'])('ignores %p', (s) =>
    expect(looksLikeMarkdown(s)).toBe(false));
});
