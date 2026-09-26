import { describe, it, expect } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC_DIR = join(import.meta.dir, '..', 'src');
const CSS_PATH = join(import.meta.dir, '..', 'src', 'styles', 'shuttle.css');

/**
 * Tokens that are intentionally unstyled: dynamic prefixes with no literal
 * class of their own, or data-attributes (which the extraction regex never
 * matches since it excludes anything preceded by `data-`, but are listed
 * here for clarity when they show up adjacent to a `sh-` run).
 */
const IGNORED = new Set<string>([
  'sh-mode', // `sh-mode-${mode}` — the two concrete values are sh-mode-note / sh-mode-notepad, both checked explicitly below.
]);

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      collectFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function extractTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  // Matches `sh-foo-bar` runs, but not when immediately preceded by `data-`
  // (e.g. `data-sh-gutter`), since those are data-attribute names, not CSS
  // classes we style with a class selector.
  const re = /data-sh-[a-z0-9-]+|\bsh-[a-z0-9-]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[0].startsWith('data-')) continue;
    tokens.add(m[0]);
  }
  return tokens;
}

function cssHasClass(css: string, token: string): boolean {
  // Word-boundary-ish check: `.token` not immediately followed by another
  // class-name character, so `.sh-wikilink` doesn't spuriously match inside
  // `.sh-wikilink-label`.
  const re = new RegExp(`\\.${token.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(?![a-zA-Z0-9_-])`);
  return re.test(css);
}

describe('shuttle.css covers every sh- class used in src/', () => {
  const css = readFileSync(CSS_PATH, 'utf8');
  const files = collectFiles(SRC_DIR);

  const allTokens = new Set<string>();
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const t of extractTokens(text)) allTokens.add(t);
  }

  // Dynamic `sh-mode-${mode}` template: check the concrete values directly.
  it('styles sh-mode-note and sh-mode-notepad', () => {
    expect(cssHasClass(css, 'sh-mode-note')).toBe(true);
    expect(cssHasClass(css, 'sh-mode-notepad')).toBe(true);
  });

  for (const token of Array.from(allTokens).sort()) {
    if (IGNORED.has(token)) continue;
    // Skip incomplete tokens produced by a dynamic prefix (e.g. `sh-mode-`
    // captured just before a template `${...}` expression), which are
    // covered explicitly above.
    if (token.endsWith('-')) continue;

    it(`styles .${token}`, () => {
      expect(cssHasClass(css, token)).toBe(true);
    });
  }

  // Suggestion popups (mention/slash/wikilink lists) are portalled onto
  // document.body by Tiptap's suggestion plugin, landing outside `.sh-root`.
  // The `--sh-*` variables must therefore also be declared on a rule whose
  // selector list includes `.sh-popup-anchor`, or they fall back to their
  // neutral defaults for every popup.
  it('declares --sh-bg on a selector list including .sh-popup-anchor', () => {
    // Find each `<selector list> { <body> }` rule and check any whose
    // selector list contains `.sh-popup-anchor` also declares `--sh-bg`.
    const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
    let match: RegExpExecArray | null;
    let found = false;
    while ((match = ruleRe.exec(css))) {
      const selectorList = match[1] ?? '';
      const body = match[2] ?? '';
      if (selectorList.includes('.sh-popup-anchor') && /--sh-bg\s*:/.test(body)) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});

describe('shuttle.css prose layout', () => {
  const css = readFileSync(CSS_PATH, 'utf8');

  it('resets browser paragraph margins inside the editor', () => {
    expect(css).toMatch(/\.sh-prose \.ProseMirror :where\([^)]*\bp\b[^)]*\)\s*\{[^}]*margin:\s*0/);
  });

  it('gives the task checkbox label a one-line height so it lines up with the text', () => {
    expect(css).toMatch(/li\[data-checked\]\s*>\s*label\s*\{[^}]*height:\s*1lh/);
  });
});

describe('shuttle.css block math alignment', () => {
  const css = readFileSync(CSS_PATH, 'utf8');
  it('left-aligns both the KaTeX display and its inner formula', () => {
    expect(css).toMatch(/\[data-align='left'\] \.katex-display > \.katex[^{]*\{[^}]*text-align:\s*left/);
  });
});
