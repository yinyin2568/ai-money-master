import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, realpath, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { LocalGitProvider, LocalGitRepository, LocalGitScanResult } from '../../src/shared/types.js';

const execFileAsync = promisify(execFile);
const MAX_SCAN_DEPTH = 5;
const MAX_REPOSITORIES = 500;
const SKIPPED_DIRECTORIES = new Set([
  '.git', '.cache', '.next', '.nuxt', '.pnpm-store', '.venv',
  'appdata', 'build', 'coverage', 'dist', 'node_modules', 'release', 'target', 'vendor'
]);

interface LocalGitServiceOptions {
  homeDir?: string;
  defaultRoots?: string[];
}

export function createLocalGitService(options: LocalGitServiceOptions = {}) {
  const homeDir = path.resolve(options.homeDir ?? os.homedir());
  const allowedRepositoryPaths = new Set<string>();

  async function scanLocalRepositories(rootPath?: string): Promise<LocalGitScanResult> {
    const roots = await resolveScanRoots(rootPath);
    const repositoryPaths = new Set<string>();
    for (const root of roots) {
      await findRepositories(root, 0, repositoryPaths);
      const containingRepository = await findContainingRepository(root);
      if (containingRepository) repositoryPaths.add(containingRepository);
      if (repositoryPaths.size >= MAX_REPOSITORIES) break;
    }

    const repositories = (await mapWithConcurrency([...repositoryPaths], 8, readRepository))
      .filter((repository): repository is LocalGitRepository => Boolean(repository));
    repositories.forEach((repository) => allowedRepositoryPaths.add(normalizePathKey(repository.localPath)));
    repositories.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN') || left.localPath.localeCompare(right.localPath, 'zh-CN'));
    return { roots, repositories, scannedAt: Date.now() };
  }

  async function resolveRepositoryPath(repositoryPath: string) {
    if (typeof repositoryPath !== 'string' || !repositoryPath.trim()) throw new Error('仓库路径不能为空');
    const normalizedPath = path.resolve(repositoryPath.trim());
    if (!allowedRepositoryPaths.has(normalizePathKey(normalizedPath))) throw new Error('请先扫描本地仓库后再打开目录');
    const repositoryStat = await stat(normalizedPath);
    if (!repositoryStat.isDirectory()) throw new Error('本地仓库目录不存在');
    return realpath(normalizedPath);
  }

  async function resolveScanRoots(rootPath?: string) {
    const candidates = rootPath
      ? [rootPath]
      : options.defaultRoots ?? [
          path.join(homeDir, 'Documents'),
          path.join(homeDir, 'Desktop')
        ];
    const roots: string[] = [];
    const seen = new Set<string>();
    for (const candidate of candidates) {
      const normalizedPath = path.resolve(candidate);
      const key = normalizePathKey(normalizedPath);
      if (seen.has(key) || !existsSync(normalizedPath)) continue;
      try {
        const candidateStat = await stat(normalizedPath);
        if (!candidateStat.isDirectory()) continue;
        roots.push(await realpath(normalizedPath));
        seen.add(key);
      } catch {
        // Inaccessible roots are omitted from the scan summary.
      }
    }
    return roots;
  }

  async function findRepositories(directoryPath: string, depth: number, repositories: Set<string>): Promise<void> {
    if (depth > MAX_SCAN_DEPTH || repositories.size >= MAX_REPOSITORIES) return;
    if (existsSync(path.join(directoryPath, '.git'))) {
      repositories.add(await realpath(directoryPath));
      return;
    }
    let entries;
    try {
      entries = await readdir(directoryPath, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (repositories.size >= MAX_REPOSITORIES) return;
      if (!entry.isDirectory() || shouldSkipDirectory(entry.name)) continue;
      await findRepositories(path.join(directoryPath, entry.name), depth + 1, repositories);
    }
  }

  async function findContainingRepository(startPath: string) {
    let currentPath = path.resolve(startPath);
    while (true) {
      if (existsSync(path.join(currentPath, '.git'))) return realpath(currentPath);
      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) return undefined;
      currentPath = parentPath;
    }
  }

  return { scanLocalRepositories, resolveRepositoryPath };
}

async function readRepository(repositoryPath: string): Promise<LocalGitRepository | undefined> {
  const branch = await gitOutput(repositoryPath, ['symbolic-ref', '--short', '-q', 'HEAD'])
    || await gitOutput(repositoryPath, ['rev-parse', '--short', 'HEAD']);
  if (!branch) return undefined;
  const [remoteUrl, logOutput] = await Promise.all([
    gitOutput(repositoryPath, ['remote', 'get-url', 'origin']),
    gitOutput(repositoryPath, ['log', '-1', '--format=%s%x00%cI'])
  ]);
  const [lastCommit, lastCommitAt] = logOutput.split('\0');
  return {
    id: createId(repositoryPath),
    name: path.basename(repositoryPath),
    localPath: repositoryPath,
    currentBranch: branch,
    remoteUrl: remoteUrl || undefined,
    provider: getProvider(remoteUrl),
    lastCommit: lastCommit || undefined,
    lastCommitAt: lastCommitAt || undefined
  };
}

async function gitOutput(repositoryPath: string, args: string[]) {
  try {
    const { stdout } = await execFileAsync('git.exe', ['-C', repositoryPath, ...args], {
      windowsHide: true,
      timeout: 5000,
      maxBuffer: 512 * 1024
    });
    return stdout.trim();
  } catch {
    return '';
  }
}

function getProvider(remoteUrl: string): LocalGitProvider {
  const normalizedUrl = remoteUrl.toLowerCase();
  if (!normalizedUrl) return 'local';
  if (normalizedUrl.includes('github.com')) return 'github';
  if (normalizedUrl.includes('gitee.com')) return 'gitee';
  return 'other';
}

function shouldSkipDirectory(name: string) {
  const normalizedName = name.toLowerCase();
  return SKIPPED_DIRECTORIES.has(normalizedName) || (normalizedName.startsWith('.') && normalizedName !== '.worktrees');
}

function createId(value: string) {
  return createHash('sha1').update(value.toLowerCase()).digest('hex').slice(0, 16);
}

function normalizePathKey(value: string) {
  return path.resolve(value).replaceAll('/', '\\').toLowerCase();
}

async function mapWithConcurrency<TInput, TOutput>(
  values: TInput[],
  concurrency: number,
  operation: (value: TInput) => Promise<TOutput>
) {
  const results: TOutput[] = [];
  for (let index = 0; index < values.length; index += concurrency) {
    results.push(...await Promise.all(values.slice(index, index + concurrency).map(operation)));
  }
  return results;
}
