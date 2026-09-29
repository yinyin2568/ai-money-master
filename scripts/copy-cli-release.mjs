#!/usr/bin/env node
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const distElectron = path.join(projectRoot, 'dist-electron');
const defaultOutput = path.join(projectRoot, 'release', 'cli');
const outputPath = path.resolve(process.env.SKILLS_MANAGER_CLI_RELEASE_DIR ?? defaultOutput);
assertSafeOutputPath(outputPath);

if (!existsSync(distElectron)) {
  throw new Error('dist-electron 不存在，请先运行 npm run electron:compile');
}

await rm(outputPath, { recursive: true, force: true });
await mkdir(path.join(outputPath, 'dist-electron'), { recursive: true });

const copyOptions = { recursive: true, filter: (source) => !source.split(path.sep).includes('__tests__') };
await cp(path.join(distElectron, 'electron'), path.join(outputPath, 'dist-electron', 'electron'), copyOptions);
await cp(path.join(distElectron, 'src'), path.join(outputPath, 'dist-electron', 'src'), copyOptions);
await cp(path.join(projectRoot, 'package.json'), path.join(outputPath, 'package.json'));
await cp(path.join(projectRoot, 'package-lock.json'), path.join(outputPath, 'package-lock.json'));

await writeFile(
  path.join(outputPath, 'skills-manager.cmd'),
  ['@echo off', 'node "%~dp0dist-electron\\electron\\cli.js" %*', ''].join('\r\n'),
  'ascii'
);

const unixShim = path.join(outputPath, 'skills-manager');
await writeFile(
  unixShim,
  ['#!/usr/bin/env sh', 'DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"', 'exec node "$DIR/dist-electron/electron/cli.js" "$@"', ''].join('\n'),
  'utf8'
);

try {
  await import('node:fs/promises').then(({ chmod }) => chmod(unixShim, 0o755));
} catch {
  // chmod is best-effort on Windows.
}

console.log(`CLI release path: ${outputPath}`);

function assertSafeOutputPath(candidate) {
  const resolved = path.resolve(candidate);
  const root = path.parse(resolved).root;
  const forbidden = [root, projectRoot, os.homedir()].map((item) => path.resolve(item).toLowerCase());
  if (forbidden.includes(resolved.toLowerCase())) {
    throw new Error(`拒绝清理不安全的 CLI 输出目录：${resolved}`);
  }

  const depth = resolved.slice(root.length).split(path.sep).filter(Boolean).length;
  if (depth < 2) throw new Error(`CLI 输出目录层级过浅：${resolved}`);
}
