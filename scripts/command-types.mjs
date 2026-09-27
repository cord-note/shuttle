// Makes the editor's commands typed for hosts.
//
// Tiptap types commands (toggleBold, toggleTaskList, …) by augmenting
// `@tiptap/core` from each extension's declarations, which only load when
// something references that extension's types. Hosts call commands on the
// Editor handed to `onReady`, so the main declaration file references every
// extension Shuttle builds with. Only `index.d.ts`: `doc.d.ts` stays free of
// Tiptap.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXTENSIONS = [
  '@tiptap/starter-kit',
  '@tiptap/extensions',
  '@tiptap/extension-list',
  '@tiptap/extension-code-block-lowlight',
  '@tiptap/extension-mathematics',
  '@tiptap/extension-image',
  '@tiptap/extension-youtube',
  '@tiptap/extension-twitch',
  '@tiptap/extension-table',
  '@tiptap/extension-details',
  '@tiptap/extension-highlight',
  '@tiptap/extension-subscript',
  '@tiptap/extension-superscript',
  '@tiptap/extension-find-and-replace',
  '@tiptap/extension-table-of-contents',
  '@tiptap/extension-unique-id',
  '@tiptap/extension-file-handler',
  '@tiptap/extension-mention',
];

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = resolve(root, 'dist/index.d.ts');
const references = EXTENSIONS.map((p) => `/// <reference types="${p}" />`).join('\n');

const current = readFileSync(file, 'utf8');
if (!current.startsWith(references)) writeFileSync(file, `${references}\n${current}`);
console.log(`referenced ${EXTENSIONS.length} extensions' command types in ${file}`);
