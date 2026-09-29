#!/usr/bin/env node
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.argv[2] ?? path.join(root, 'output', 'public-source'));
const allowed = path.relative(path.join(root, 'output'), output);
if (!allowed || allowed.startsWith('..') || path.isAbsolute(allowed)) throw new Error('公开快照必须位于项目 output 的独立子目录中');
try {
  if ((await readdir(output)).length) throw new Error('公开快照目标必须为空目录，避免覆盖已有文件');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await mkdir(output, { recursive: true });

// Explicit allowlist: development notes, original Git history, accounts and
// generated artifacts never enter the public repository.
const entries = [
  '.gitignore', '.gitattributes', '.github', 'README.md', 'CHANGELOG.md',
  'package.json', 'package-lock.json', 'index.html', 'tsconfig.json',
  'tsconfig.node.json', 'vite.config.ts', 'vitest.config.ts',
  'electron', 'src', 'public', 'scripts', 'skills',
  'docs/images', 'docs/release-validation.md'
];
for (const entry of entries) await cp(path.join(root, entry), path.join(output, entry), { recursive: true });

const manifest = [];
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('公开快照不允许包含符号链接');
    if (entry.isDirectory()) await collect(file);
    else if (entry.isFile()) {
      const bytes = await readFile(file);
      manifest.push({ path: path.relative(output, file).split(path.sep).join('/'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  }
}
await collect(output);
manifest.sort((a, b) => a.path.localeCompare(b.path));
await writeFile(`${output}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Public source: ${output}; files: ${manifest.length}`);
