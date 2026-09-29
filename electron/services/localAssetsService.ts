import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  LocalAssetKind,
  LocalAssetScanResult,
  LocalAssetSource,
  LocalManagedAsset
} from '../../src/shared/types.js';

const MAX_ASSET_BYTES = 2 * 1024 * 1024;
const MAX_ASSETS = 5000;
const TEXT_EXTENSIONS = new Set(['.md', '.mdc', '.txt', '.json', '.toml', '.yaml', '.yml']);
const SENSITIVE_KEY = /(token|api[_-]?key|secret|password|authorization|cookie|credential|private[_-]?key)/i;

interface LocalAssetsServiceOptions {
  homeDir?: string;
  codexHome?: string;
}

export function createLocalAssetsService(options: LocalAssetsServiceOptions = {}) {
  const homeDir = path.resolve(options.homeDir ?? os.homedir());
  const codexHome = path.resolve(options.codexHome ?? process.env.CODEX_HOME ?? path.join(homeDir, '.codex'));
  const allowedAssetPaths = new Set<string>();

  async function scanLocalMemories() {
    return scanAssets('memory');
  }

  async function scanLocalPlugins() {
    return scanAssets('plugin');
  }

  async function scanLocalAgents() {
    return scanAssets('agent');
  }

  async function scanAssets(kind: LocalAssetKind): Promise<LocalAssetScanResult> {
    const sources = getSources(kind);
    let items: LocalManagedAsset[] = [];
    for (const source of sources) {
      if (!source.exists || items.length >= MAX_ASSETS) continue;
      try {
        if (kind === 'plugin') items.push(...await scanPluginSource(source));
        else if (kind === 'agent') items.push(...await scanAgentSource(source));
        else items.push(...await scanMemorySource(source));
      } catch {
        // An invalid or inaccessible source should not block other local tools.
      }
    }
    if (kind === 'plugin') items = keepLatestPlugins(items);
    items.sort((left, right) => right.lastModified - left.lastModified || left.name.localeCompare(right.name, 'zh-CN'));
    for (const item of items) {
      allowedAssetPaths.add(normalizePathKey(item.localPath));
      allowedAssetPaths.add(normalizePathKey(item.configPath));
    }
    return { kind, sources, items, scannedAt: Date.now() };
  }

  async function readLocalAsset(assetPath: string) {
    const safePath = await resolveAssetPath(assetPath);
    const fileStat = await stat(safePath);
    if (fileStat.size > MAX_ASSET_BYTES) throw new Error('文件超过 2 MB，无法在应用内查看');
    const content = await readFile(safePath, 'utf8');
    const extension = path.extname(safePath).toLowerCase();
    if (extension === '.json') return redactJson(content);
    if (extension === '.toml' || extension === '.yaml' || extension === '.yml') return redactStructuredText(content);
    return content;
  }

  async function resolveAssetPath(assetPath: string) {
    const safePath = await resolveAssetResourcePath(assetPath);
    const fileStat = await stat(safePath);
    if (!fileStat.isFile()) throw new Error('配置文件不存在');
    return safePath;
  }

  async function resolveAssetResourcePath(assetPath: string) {
    if (typeof assetPath !== 'string' || !assetPath.trim()) throw new Error('文件路径不能为空');
    const normalizedPath = path.resolve(assetPath.trim());
    const isKnownFile = allowedAssetPaths.has(normalizePathKey(normalizedPath));
    const isKnownSource = (['memory', 'plugin', 'agent'] as LocalAssetKind[])
      .flatMap((kind) => getSources(kind))
      .some((source) => source.exists && samePath(source.path, normalizedPath));
    if (!isKnownFile && !isKnownSource) throw new Error('请先扫描模块后再打开位置');
    return realpath(normalizedPath);
  }

  function getSources(kind: LocalAssetKind): LocalAssetSource[] {
    const definitions = kind === 'memory'
      ? [
          ['codex-memory', 'Codex Memories', path.join(codexHome, 'memories')],
          ['claude-project-memory', 'Claude Project Memory', path.join(homeDir, '.claude', 'projects')],
          ['claude-memory', 'Claude Memory', path.join(homeDir, '.claude', 'memory')],
          ['openclaw-memory', 'OpenClaw Memory', path.join(homeDir, '.openclaw', 'memory')]
        ]
      : kind === 'plugin'
        ? [
            ['codex-plugins', 'Codex Plugins', path.join(codexHome, 'plugins', 'cache')],
            ['claude-plugins', 'Claude Plugins', path.join(homeDir, '.claude', 'plugins', 'marketplaces')],
            ['openclaw-plugins', 'OpenClaw Plugins', path.join(homeDir, '.openclaw', 'plugins')]
          ]
        : [
            ['codex-agents', 'Codex Agents', path.join(codexHome, 'agents')],
            ['claude-agents', 'Claude Agents', path.join(homeDir, '.claude', 'agents')],
            ['gemini-agents', 'Gemini Agents', path.join(homeDir, '.gemini', 'agents')],
            ['openclaw-agents', 'OpenClaw Agents', path.join(homeDir, '.openclaw', 'agents')],
            ['kiro-agents', 'Kiro Agents', path.join(homeDir, '.kiro', 'agents')]
          ];
    return definitions.map(([id, label, sourcePath]) => ({
      id,
      kind,
      label,
      path: path.resolve(sourcePath),
      exists: existsSync(sourcePath)
    }));
  }

  return { scanLocalMemories, scanLocalPlugins, scanLocalAgents, readLocalAsset, resolveAssetPath, resolveAssetResourcePath };
}

async function scanMemorySource(source: LocalAssetSource) {
  const files = await collectFiles(source.path, (filePath) => {
    if (!TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return false;
    if (source.id !== 'claude-project-memory') return true;
    return path.relative(source.path, filePath).split(path.sep).some((segment) => segment.toLowerCase() === 'memory');
  });
  return Promise.all(files.map(async (filePath) => createTextAsset('memory', source, filePath)));
}

async function scanAgentSource(source: LocalAssetSource) {
  const files = await collectFiles(source.path, (filePath) => TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase()));
  const groups = new Map<string, string[]>();
  for (const filePath of files) {
    const key = path.join(path.dirname(filePath), path.basename(filePath, path.extname(filePath)));
    groups.set(normalizePathKey(key), [...(groups.get(normalizePathKey(key)) ?? []), filePath]);
  }
  const assets: LocalManagedAsset[] = [];
  for (const groupedFiles of groups.values()) {
    const configPath = pickConfigFile(groupedFiles);
    const definitionPath = groupedFiles.find((filePath) => path.extname(filePath).toLowerCase() === '.md') ?? configPath;
    const fileStat = await stat(configPath);
    const groupedStats = await Promise.all(groupedFiles.map((filePath) => stat(filePath)));
    const content = fileStat.size <= MAX_ASSET_BYTES ? await readFile(configPath, 'utf8') : '';
    const extensions = groupedFiles.map((filePath) => path.extname(filePath).slice(1).toUpperCase()).sort();
    assets.push({
      id: createId(`${source.id}\0${path.relative(source.path, configPath)}`),
      kind: 'agent',
      name: path.basename(configPath, path.extname(configPath)),
      description: extractDescription(content),
      sourceId: source.id,
      sourceLabel: source.label,
      localPath: definitionPath,
      configPath,
      relativePath: path.relative(source.path, configPath),
      resourceType: extensions.join(' + '),
      version: extractVersion(content),
      size: groupedStats.reduce((total, groupedStat) => total + groupedStat.size, 0),
      lastModified: fileStat.mtimeMs
    });
  }
  return assets;
}

async function scanPluginSource(source: LocalAssetSource) {
  if (source.id === 'openclaw-plugins') return scanOpenClawPlugins(source);
  const manifests = await collectFiles(source.path, (filePath) => {
    const normalized = filePath.replaceAll('\\', '/');
    return normalized.endsWith('/.codex-plugin/plugin.json') || normalized.endsWith('/.claude-plugin/plugin.json');
  });
  const assets: LocalManagedAsset[] = [];
  for (const manifestPath of manifests) {
    const fileStat = await stat(manifestPath);
    if (fileStat.size > MAX_ASSET_BYTES) continue;
    const content = await readFile(manifestPath, 'utf8');
    const manifest = parseJsonRecord(content);
    const pluginRoot = path.dirname(path.dirname(manifestPath));
    const relativeParts = path.relative(source.path, pluginRoot).split(path.sep);
    const fallbackName = relativeParts.at(-2) ?? path.basename(pluginRoot);
    assets.push({
      id: createId(`${source.id}\0${manifestPath}`),
      kind: 'plugin',
      name: stringValue(manifest.name) ?? fallbackName,
      description: stringValue(manifest.description) ?? '暂无描述',
      sourceId: source.id,
      sourceLabel: source.label,
      localPath: manifestPath,
      configPath: manifestPath,
      relativePath: path.relative(source.path, manifestPath),
      resourceType: 'Plugin Manifest',
      version: stringValue(manifest.version) ?? relativeParts.at(-1),
      size: fileStat.size,
      lastModified: fileStat.mtimeMs
    });
  }
  return assets;
}

async function scanOpenClawPlugins(source: LocalAssetSource) {
  const registryPath = path.join(source.path, 'installs.json');
  if (!existsSync(registryPath)) return [];
  const fileStat = await stat(registryPath);
  if (fileStat.size > MAX_ASSET_BYTES) return [];
  const registry = parseJsonRecord(await readFile(registryPath, 'utf8'));
  const plugins = Array.isArray(registry.plugins) ? registry.plugins : [];
  return plugins.flatMap((rawPlugin): LocalManagedAsset[] => {
    if (!isRecord(rawPlugin)) return [];
    const manifestPath = stringValue(rawPlugin.manifestPath);
    const configPath = manifestPath && existsSync(manifestPath) ? path.resolve(manifestPath) : registryPath;
    const packageJson = isRecord(rawPlugin.packageJson) ? rawPlugin.packageJson : {};
    return [{
      id: createId(`${source.id}\0${stringValue(rawPlugin.pluginId) ?? configPath}`),
      kind: 'plugin',
      name: stringValue(rawPlugin.pluginId) ?? stringValue(rawPlugin.packageName) ?? 'OpenClaw Plugin',
      description: stringValue(packageJson.description) ?? stringValue(rawPlugin.origin) ?? '暂无描述',
      sourceId: source.id,
      sourceLabel: source.label,
      localPath: configPath,
      configPath,
      relativePath: path.relative(source.path, configPath),
      resourceType: 'OpenClaw Plugin',
      version: stringValue(rawPlugin.packageVersion),
      size: fileStat.size,
      lastModified: fileStat.mtimeMs
    }];
  });
}

async function createTextAsset(kind: LocalAssetKind, source: LocalAssetSource, filePath: string): Promise<LocalManagedAsset> {
  const fileStat = await stat(filePath);
  const content = fileStat.size <= MAX_ASSET_BYTES ? await readFile(filePath, 'utf8') : '';
  return {
    id: createId(`${source.id}\0${path.relative(source.path, filePath)}`),
    kind,
    name: path.basename(filePath, path.extname(filePath)),
    description: extractDescription(content),
    sourceId: source.id,
    sourceLabel: source.label,
    localPath: filePath,
    configPath: filePath,
    relativePath: path.relative(source.path, filePath),
    resourceType: path.extname(filePath).slice(1).toUpperCase() || 'TEXT',
    version: extractVersion(content),
    size: fileStat.size,
    lastModified: fileStat.mtimeMs
  };
}

async function collectFiles(rootPath: string, include: (filePath: string) => boolean) {
  const files: string[] = [];
  async function walk(directoryPath: string) {
    if (files.length >= MAX_ASSETS) return;
    const entries = await readdir(directoryPath, { withFileTypes: true });
    for (const entry of entries) {
      if (files.length >= MAX_ASSETS) return;
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name.includes('staging')) continue;
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) await walk(entryPath);
      else if (entry.isFile() && include(entryPath)) files.push(entryPath);
    }
  }
  await walk(rootPath);
  return files;
}

function keepLatestPlugins(items: LocalManagedAsset[]) {
  const latest = new Map<string, LocalManagedAsset>();
  for (const item of items) {
    const key = `${item.sourceId}\0${item.name.toLowerCase()}`;
    const current = latest.get(key);
    const versionComparison = current ? compareVersions(item.version, current.version) : 1;
    if (!current || versionComparison > 0 || (versionComparison === 0 && item.lastModified > current.lastModified)) latest.set(key, item);
  }
  return [...latest.values()];
}

function compareVersions(left?: string, right?: string) {
  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

function pickConfigFile(files: string[]) {
  const priority = ['.toml', '.json', '.yaml', '.yml', '.md', '.txt'];
  return [...files].sort((left, right) => priority.indexOf(path.extname(left).toLowerCase()) - priority.indexOf(path.extname(right).toLowerCase()))[0];
}

function extractDescription(content: string) {
  const frontmatter = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  const frontmatterDescription = frontmatter?.[1]?.match(/^description\s*:\s*(.+)$/im)?.[1];
  const structuredDescription = content.match(/^\s*description\s*=\s*["']{1,3}([^\r\n"']+)/im)?.[1];
  const firstLine = content
    .replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#') && !line.startsWith('<!--'));
  return trimText(frontmatterDescription ?? structuredDescription ?? firstLine ?? '暂无描述', 180);
}

function extractVersion(content: string) {
  return content.match(/^\s*version\s*[:=]\s*["']?([^\s"']+)/im)?.[1];
}

function redactJson(content: string) {
  try {
    return JSON.stringify(redactValue(JSON.parse(content)), null, 2);
  } catch {
    return '配置文件不是有效 JSON，无法安全展示；请通过资源管理器打开原文件。';
  }
}

function redactValue(value: unknown, key = ''): unknown {
  if (SENSITIVE_KEY.test(key)) return '••••••••';
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, redactValue(childValue, childKey)]));
}

function redactStructuredText(content: string) {
  return content.split(/\r?\n/).map((line) => {
    const match = line.match(/^(\s*)([\w.-]+)(\s*[:=]\s*)(.*)$/);
    return match && (SENSITIVE_KEY.test(match[2]) || SENSITIVE_KEY.test(match[4]))
      ? `${match[1]}${match[2]}${match[3]}"••••••••"`
      : line;
  }).join('\n');
}

function parseJsonRecord(content: string) {
  try {
    const value = JSON.parse(content);
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function trimText(value: string, maxLength: number) {
  const cleaned = value.trim().replace(/^['"]|['"]$/g, '').replace(/\s+/g, ' ');
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 3)}...` : cleaned;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function createId(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function normalizePathKey(value: string) {
  const normalized = path.resolve(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function samePath(left: string, right: string) {
  return normalizePathKey(left) === normalizePathKey(right);
}
