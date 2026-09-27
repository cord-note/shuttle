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
  'sh-line-width', // `--sh-line-width`, a custom property set inline on the root, not a class.
  'sh-ruler-tick', // `--sh-ruler-tick`, a custom property set inline on the ruler, not a class.
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

describe('shuttle.css stacked children in containers', () => {
  const css = readFileSync(CSS_PATH, 'utf8');
  it('spaces paragraphs inside toggle content and table cells', () => {
    const rule = /\.sh-prose \.ProseMirror :is\(([^)]*(?:\([^)]*\)[^)]*)*)\) > \* \+ \* \{[^}]*margin-top:\s*0\.35em/.exec(css);
    expect(rule).not.toBeNull();
    const list = rule?.[1] ?? '';
    expect(list).toContain("[data-type='detailsContent']");
    expect(list).toMatch(/\btd\b/);
    expect(list).toMatch(/\bth\b/);
  });
});

describe('shuttle.css code highlighting', () => {
  const css = readFileSync(CSS_PATH, 'utf8');
  const TOKENS = ['keyword', 'string', 'comment', 'number', 'function', 'builtin', 'type', 'attr', 'variable',
    'meta', 'tag', 'operator', 'addition', 'deletion'];
  const rules = (): { selector: string; body: string }[] =>
    [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: (m[1] ?? '').trim(), body: m[2] ?? '' }));
  const declares = (selectorTest: (s: string) => boolean, variable: string): boolean =>
    rules().some((r) => selectorTest(r.selector) && new RegExp(`${variable}\s*:`).test(r.body));

  it('defines a light palette on .sh-root', () => {
    for (const t of TOKENS) {
      expect(declares((s) => s.split(',').map((x) => x.trim()).includes('.sh-root'), `--sh-code-${t}`)).toBe(true);
    }
  });

  it('redefines it for an explicit dark scheme and for the system dark preference', () => {
    const media = /@media \(prefers-color-scheme: dark\)\s*\{\s*\.sh-root:not\(\[data-sh-scheme='light'\]\)\s*\{([^}]*)\}/.exec(css);
    expect(media).not.toBeNull();
    for (const t of TOKENS) {
      expect(declares((s) => s === ".sh-root[data-sh-scheme='dark']", `--sh-code-${t}`)).toBe(true);
      expect(media![1]).toMatch(new RegExp(`--sh-code-${t}\s*:`));
    }
  });

  it('colours highlight.js tokens inside code blocks from the palette', () => {
    for (const t of TOKENS) {
      expect(rules().some((r) => r.selector.includes('.sh-prose pre .hljs-') && r.body.includes(`var(--sh-code-${t})`))).toBe(true);
    }
  });

  it('sets code in the monospace font', () => {
    expect(css).toMatch(/--sh-mono\s*:/);
    expect(rules().some((r) => r.selector.includes('.sh-prose code') && r.body.includes('font-family: var(--sh-mono)'))).toBe(true);
  });
});

describe('shuttle.css chrome', () => {
  const css = readFileSync(CSS_PATH, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = (selector: string): string => {
    const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[},])\\s*${esc}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
  };

  it('keeps the toolbar (and the ruler under it) in view while the document scrolls', () => {
    const header = rule('.sh-header');
    expect(header).toMatch(/position:\s*sticky/);
    expect(header).toMatch(/top:\s*0/);
    // Only the toolbar is opaque; the ruler strip under it stays clear.
    expect(header).not.toMatch(/background:/);
    expect(rule('.sh-toolbar')).toMatch(/background:/);
  });

  it('draws the ruler only across the column, plus one tick beyond each edge', () => {
    expect(rule('.sh-ruler-scale')).toMatch(/width:\s*calc\(var\(--sh-line-width\) \+ 2 \* var\(--sh-ruler-tick\)\)/);
    expect(css).not.toMatch(/\.sh-ruler::before/);
  });

  it('centres the toolbar under a host-set column instead of stretching it to the column', () => {
    expect(rule('.sh-root[data-sh-width] .sh-toolbar')).toMatch(/justify-content:\s*center/);
    expect(rule('.sh-root[data-sh-width] .sh-content')).toMatch(/max-width:\s*var\(--sh-line-width\)/);
    expect(css).not.toMatch(/\.sh-root\[data-sh-width\] \.sh-toolbar,/);
  });

  it('draws its own task checkboxes from the theme instead of the native control', () => {
    const box = rule(".sh-prose .ProseMirror li[data-checked] > label input[type='checkbox']");
    expect(box).toMatch(/appearance:\s*none/);
    expect(box).toMatch(/border:[^;]*var\(--sh-/);
    expect(css).toMatch(/input\[type='checkbox'\]:checked\s*\{[^}]*background:\s*var\(--sh-accent\)/);
    expect(css).toMatch(/input\[type='checkbox'\]:checked::after\s*\{/);
  });
});

describe('shuttle.css ruler visibility', () => {
  const css = readFileSync(CSS_PATH, 'utf8');
  it('hides the handles like the ticks until hovered, dragged or focused', () => {
    expect(css).toMatch(/\.sh-ruler-handle \{[^}]*opacity:\s*0;/);
    expect(css).toMatch(/\.sh-ruler:hover \.sh-ruler-handle[^{]*\{[^}]*opacity:\s*1/);
    expect(css).toMatch(/\.sh-ruler-handle:focus-visible[^{]*\{[^}]*opacity:\s*1/);
  });
});

describe('shuttle.css ruler handles', () => {
  const css = readFileSync(CSS_PATH, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  it('draws the handles heavier than the ticks', () => {
    const handle = /\.sh-ruler-handle \{([^}]*)\}/.exec(css)?.[1] ?? '';
    const px = (prop: string): number => Number(new RegExp(`(?:^|[;\\s])${prop}:\\s*([\\d.]+)px`).exec(handle)?.[1] ?? 0);
    expect(px('width')).toBeGreaterThan(1);
    expect(px('height')).toBeGreaterThan(5);
    expect(handle).toMatch(/background:\s*var\(--sh-text\)/);
  });
});
