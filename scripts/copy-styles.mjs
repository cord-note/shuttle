// Copies the stylesheet into dist/ so it ships as `shuttle-editor/styles.css`.
// A node script rather than `cp`, because pnpm runs scripts through cmd.exe on Windows.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = resolve(root, 'src/styles/shuttle.css');
const to = resolve(root, 'dist/styles.css');

mkdirSync(dirname(to), { recursive: true });
copyFileSync(from, to);
console.log(`copied ${from} -> ${to}`);
