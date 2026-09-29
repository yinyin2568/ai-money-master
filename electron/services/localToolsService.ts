import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type {
  LocalCliScanResult,
  LocalCliTool,
  LocalConfigFile,
  LocalMcpScanResult,
  LocalMcpServer
} from '../../src/shared/types.js';

const execFileAsync = promisify(execFile);
const MAX_CONFIG_BYTES = 2 * 1024 * 1024;
const SENSITIVE_KEY = /(token|api[_-]?key|secret|password|authorization|cookie|credential|private[_-]?key)/i;

interface LocalToolsServiceOptions {
  homeDir?: string;
  codexHome?: string;
  appDataDir?: string;
}

interface CliDefinition {
  id: string;
  name: string;
  command: string;
  versionArgs: string[];
  configClientIds: string[];
}

const CLI_DEFINITIONS: CliDefinition[] = [
  { id: 'codex', name: 'Codex CLI', command: 'codex', versionArgs: ['--version'], configClientIds: ['codex'] },
  { id: 'claude', name: 'Claude Code', command: 'claude', versionArgs: ['--version'], configClientIds: ['claude'] },
  { id: 'gemini', name: 'Gemini CLI', command: 'gemini', versionArgs: ['--version'], configClientIds: ['gemini'] },
  { id: 'openclaw', name: 'OpenClaw', command: 'openclaw', versionArgs: ['--version'], configClientIds: ['openclaw'] },
  { id: 'node', name: 'Node.js', command: 'node', versionArgs: ['--version'], configClientIds: [] },
  { id: 'npm', name: 'npm', command: 'npm', versionArgs: ['--version'], configClientIds: [] },
  { id: 'npx', name: 'npx', command: 'npx', versionArgs: ['--version'], configClientIds: [] },
  { id: 'python', name: 'Python', command: 'python', versionArgs: ['--version'], configClientIds: [] },
  { id: 'uv', name: 'uv', command: 'uv', versionArgs: ['--version'], configClientIds: [] },
  { id: 'uvx', name: 'uvx', command: 'uvx', versionArgs: ['--version'], configClientIds: [] },
  { id: 'git', name: 'Git', command: 'git', versionArgs: ['--version'], configClientIds: [] },
  { id: 'gh', name: 'GitHub CLI', command: 'gh', versionArgs: ['--version'], configClientIds: [] }
];

export function createLocalToolsService(options: LocalToolsServiceOptions = {}) {
  const homeDir = path.resolve(options.homeDir ?? os.homedir());
  const codexHome = path.resolve(options.codexHome ?? process.env.CODEX_HOME ?? path.join(homeDir, '.codex'));
  const appDataDir = path.resolve(options.appDataDir ?? process.env.APPDATA ?? path.join(homeDir, 'AppData', 'Roaming'));

  async function getConfigFiles(): Promise<LocalConfigFile[]> {
    const candidates = buildConfigCandidates(homeDir, codexHome, appDataDir);
    const files: LocalConfigFile[] = [];
    for (const candidate of candidates) {
      if (!existsSync(candidate.path)) {
        files.push({ ...candidate, exists: false });
        continue;
      }
      try {
        const fileStat = await stat(candidate.path);
        files.push({
          ...candidate,
          exists: fileStat.isFile(),
          size: fileStat.isFile() ? fileStat.size : undefined,
          lastModified: fileStat.isFile() ? fileStat.mtimeMs : undefined
        });
      } catch {
        files.push({ ...candidate, exists: false });
      }
    }
    return files;
  }

  async function scanLocalClis(): Promise<LocalCliScanResult> {
    const configFiles = await getConfigFiles();
    const tools = await Promise.all(
      CLI_DEFINITIONS.map(async (definition): Promise<LocalCliTool> => {
        const executablePath = await resolveCommandPath(definition.command);
        return {
          id: definition.id,
          name: definition.name,
          command: definition.command,
          installed: Boolean(executablePath),
          executablePath,
          version: executablePath ? await readCommandVersion(executablePath, definition.versionArgs) : undefined,
          configFiles: configFiles.filter((file) => definition.configClientIds.includes(file.clientId))
        };
      })
    );
    return { tools, scannedAt: Date.now() };
  }

  async function scanLocalMcps(): Promise<LocalMcpScanResult> {
    const configFiles = await getConfigFiles();
    const servers: LocalMcpServer[] = [];
    for (const configFile of configFiles) {
      if (!configFile.exists || (configFile.size ?? 0) > MAX_CONFIG_BYTES) continue;
      try {
        const content = await readFile(configFile.path, 'utf8');
        servers.push(
          ...(configFile.format === 'json'
            ? parseJsonMcpServers(configFile, content)
            : parseTomlMcpServers(configFile, content))
        );
      } catch {
        // Invalid or inaccessible configuration files remain visible in the source list.
      }
    }
    servers.sort((left, right) => left.clientLabel.localeCompare(right.clientLabel, 'zh-CN') || left.name.localeCompare(right.name, 'zh-CN'));
    return { configFiles, servers, scannedAt: Date.now() };
  }

  async function readLocalConfig(configPath: string) {
    const safePath = await resolveConfigPath(configPath);
    const fileStat = await stat(safePath);
    if (fileStat.size > MAX_CONFIG_BYTES) throw new Error('配置文件超过 2 MB，无法在应用内查看');
    const content = await readFile(safePath, 'utf8');
    return path.extname(safePath).toLowerCase() === '.json' ? redactJsonText(content) : redactTomlText(content);
  }

  async function resolveManagedResource(resourcePath: string) {
    if (typeof resourcePath !== 'string' || !resourcePath.trim()) throw new Error('资源路径不能为空');
    const normalizedPath = path.resolve(resourcePath.trim());
    const configFiles = await getConfigFiles();
    const exactConfig = configFiles.find((file) => samePath(file.path, normalizedPath) && file.exists);
    if (exactConfig) return realpath(normalizedPath);

    const commandPaths = await Promise.all(CLI_DEFINITIONS.map((definition) => resolveCommandPath(definition.command)));
    if (commandPaths.some((commandPath) => commandPath && samePath(commandPath, normalizedPath))) {
      return realpath(normalizedPath);
    }
    throw new Error('拒绝打开未纳入管理的本地资源');
  }

  async function resolveConfigPath(configPath: string) {
    if (typeof configPath !== 'string' || !configPath.trim()) throw new Error('配置路径不能为空');
    const normalizedPath = path.resolve(configPath.trim());
    const configFiles = await getConfigFiles();
    if (!configFiles.some((file) => file.exists && samePath(file.path, normalizedPath))) {
      throw new Error('拒绝读取未纳入管理的配置文件');
    }
    return realpath(normalizedPath);
  }

  return { scanLocalClis, scanLocalMcps, readLocalConfig, resolveManagedResource };
}

function buildConfigCandidates(homeDir: string, codexHome: string, appDataDir: string): Omit<LocalConfigFile, 'exists'>[] {
  const values = [
    configCandidate('codex', 'Codex', 'Codex config.toml', path.join(codexHome, 'config.toml'), 'toml'),
    configCandidate('codex', 'Codex', 'Codex 用户配置', path.join(homeDir, '.codex', 'config.toml'), 'toml'),
    configCandidate('claude', 'Claude Code', 'Claude 全局配置', path.join(homeDir, '.claude.json'), 'json'),
    configCandidate('claude', 'Claude Code', 'Claude settings.json', path.join(homeDir, '.claude', 'settings.json'), 'json'),
    configCandidate('cursor', 'Cursor', 'Cursor mcp.json', path.join(homeDir, '.cursor', 'mcp.json'), 'json'),
    configCandidate('gemini', 'Gemini CLI', 'Gemini settings.json', path.join(homeDir, '.gemini', 'settings.json'), 'json'),
    configCandidate('trae', 'Trae', 'Trae mcp.json', path.join(homeDir, '.trae', 'mcp.json'), 'json'),
    configCandidate('openclaw', 'OpenClaw', 'OpenClaw config', path.join(homeDir, '.openclaw', 'openclaw.json'), 'json'),
    configCandidate('kiro', 'Kiro', 'Kiro mcp.json', path.join(homeDir, '.kiro', 'settings', 'mcp.json'), 'json'),
    configCandidate('vscode', 'VS Code', 'VS Code mcp.json', path.join(appDataDir, 'Code', 'User', 'mcp.json'), 'json'),
    configCandidate('cursor', 'Cursor', 'Cursor 用户 mcp.json', path.join(appDataDir, 'Cursor', 'User', 'mcp.json'), 'json')
  ];
  const seen = new Set<string>();
  return values.filter((file) => {
    file.path = path.resolve(file.path);
    const key = normalizePathKey(file.path);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function configCandidate(
  clientId: string,
  clientLabel: string,
  label: string,
  filePath: string,
  format: LocalConfigFile['format']
): Omit<LocalConfigFile, 'exists'> {
  return {
    id: createId(`${clientId}\0${filePath}`),
    clientId,
    clientLabel,
    label,
    path: filePath,
    format
  };
}

async function resolveCommandPath(command: string) {
  try {
    const { stdout } = await execFileAsync('where.exe', [command], { timeout: 3000, windowsHide: true });
    const candidates = stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    return candidates.find((value) => ['.exe', '.cmd', '.bat'].includes(path.extname(value).toLowerCase()))
      ?? candidates.find((value) => !value.toLowerCase().endsWith('.ps1'))
      ?? candidates[0];
  } catch {
    return undefined;
  }
}

async function readCommandVersion(executablePath: string, versionArgs: string[]) {
  try {
    const extension = path.extname(executablePath).toLowerCase();
    const result = extension === '.cmd' || extension === '.bat'
      ? await execFileAsync('cmd.exe', ['/d', '/c', 'call', executablePath, ...versionArgs], {
          timeout: 5000,
          windowsHide: true,
          maxBuffer: 256 * 1024
        })
      : await execFileAsync(executablePath, versionArgs, { timeout: 5000, windowsHide: true, maxBuffer: 256 * 1024 });
    return normalizeVersionOutput(`${result.stdout}\n${result.stderr}`);
  } catch (error) {
    const output = error && typeof error === 'object'
      ? `${'stdout' in error ? String(error.stdout ?? '') : ''}\n${'stderr' in error ? String(error.stderr ?? '') : ''}`
      : '';
    return normalizeVersionOutput(output) || '版本读取失败';
  }
}

function normalizeVersionOutput(output: string) {
  return output.split(/\r?\n/).map((line) => line.trim()).find(Boolean)?.slice(0, 180) ?? '';
}

function parseJsonMcpServers(configFile: LocalConfigFile, content: string): LocalMcpServer[] {
  const parsed = JSON.parse(content) as Record<string, unknown>;
  const serverMap = findJsonServerMap(parsed);
  if (!serverMap) return [];
  return Object.entries(serverMap).flatMap(([name, rawValue]) => {
    if (!isRecord(rawValue)) return [];
    const command = typeof rawValue.command === 'string' ? rawValue.command : undefined;
    const args = Array.isArray(rawValue.args) ? rawValue.args.filter((value): value is string => typeof value === 'string') : [];
    const url = firstString(rawValue.url, rawValue.httpUrl, rawValue.http_url, rawValue.sseUrl);
    const transport = firstString(rawValue.type, rawValue.transport) ?? (url ? 'http' : 'stdio');
    return [{
      id: createId(`${configFile.path}\0${name}`),
      name,
      clientId: configFile.clientId,
      clientLabel: configFile.clientLabel,
      configPath: configFile.path,
      transport,
      command,
      args: redactArgumentList(args) as string[],
      url: url ? redactString(url) : undefined,
      version: inferMcpVersion(rawValue, command, args, url),
      enabled: rawValue.disabled !== true && rawValue.enabled !== false,
      redactedConfig: JSON.stringify(redactValue(rawValue), null, 2)
    }];
  });
}

function findJsonServerMap(parsed: Record<string, unknown>) {
  const directCandidates = [parsed.mcpServers, parsed.mcp_servers];
  for (const candidate of directCandidates) if (isRecord(candidate)) return candidate;
  if (isRecord(parsed.mcp) && isRecord(parsed.mcp.servers)) return parsed.mcp.servers;
  return undefined;
}

function parseTomlMcpServers(configFile: LocalConfigFile, content: string): LocalMcpServer[] {
  const lines = content.split(/\r?\n/);
  const servers: LocalMcpServer[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*\[mcp_servers\.(?:"([^"]+)"|([^\].]+))\]\s*(?:#.*)?$/);
    if (!match) continue;
    const name = match[1] ?? match[2];
    const blockLines = [lines[index]];
    let cursor = index + 1;
    for (; cursor < lines.length; cursor += 1) {
      if (/^\s*\[mcp_servers\.(?:"[^"]+"|[^\].]+)\]\s*(?:#.*)?$/.test(lines[cursor])) break;
      if (/^\s*\[/.test(lines[cursor]) && !/^\s*\[mcp_servers\./.test(lines[cursor])) break;
      blockLines.push(lines[cursor]);
    }
    index = cursor - 1;
    const block = blockLines.join('\n');
    const command = readTomlString(block, 'command');
    const url = readTomlString(block, 'url');
    const args = readTomlArray(block, 'args');
    const enabled = !/^\s*(?:disabled\s*=\s*true|enabled\s*=\s*false)/im.test(block);
    const explicitVersion = readTomlString(block, 'version');
    servers.push({
      id: createId(`${configFile.path}\0${name}`),
      name,
      clientId: configFile.clientId,
      clientLabel: configFile.clientLabel,
      configPath: configFile.path,
      transport: readTomlString(block, 'transport') ?? (url ? 'http' : 'stdio'),
      command,
      args: redactArgumentList(args) as string[],
      url: url ? redactString(url) : undefined,
      version: explicitVersion ?? inferVersionFromCommand(command, args, url),
      enabled,
      redactedConfig: redactTomlText(block)
    });
  }
  return servers;
}

function readTomlString(block: string, key: string) {
  const match = block.match(new RegExp(`^\\s*${key}\\s*=\\s*["']([^"']*)["']`, 'im'));
  return match?.[1];
}

function readTomlArray(block: string, key: string) {
  const match = block.match(new RegExp(`^\\s*${key}\\s*=\\s*\\[([\\s\\S]*?)\\]`, 'im'));
  return match ? Array.from(match[1].matchAll(/["']([^"']*)["']/g), (value) => value[1]) : [];
}

function inferMcpVersion(config: Record<string, unknown>, command?: string, args: string[] = [], url?: string) {
  if (typeof config.version === 'string' && config.version.trim()) return config.version.trim();
  return inferVersionFromCommand(command, args, url);
}

function inferVersionFromCommand(command?: string, args: string[] = [], url?: string) {
  const tokens = [command ?? '', ...args];
  for (const token of tokens) {
    const scoped = token.match(/^@[\w.-]+\/[\w.-]+@([^/\s]+)$/);
    if (scoped) return scoped[1];
    const regular = token.match(/^[\w.-]+@([^/\s]+)$/);
    if (regular) return regular[1];
  }
  if (url) return '远程服务';
  return '未固定';
}

function redactJsonText(content: string) {
  try {
    return JSON.stringify(redactValue(JSON.parse(content)), null, 2);
  } catch {
    return '配置文件不是有效 JSON，无法安全展示；请通过资源管理器打开原文件。';
  }
}

function redactValue(value: unknown, key = ''): unknown {
  if (SENSITIVE_KEY.test(key)) return '••••••••';
  if (Array.isArray(value)) return key.toLowerCase() === 'args' ? redactArgumentList(value) : value.map((item) => redactValue(item));
  if (typeof value === 'string') return redactString(value);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, redactValue(childValue, childKey)]));
}

function redactTomlText(content: string) {
  return content
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^(\s*)([\w.-]+)(\s*=\s*)(.*)$/);
      if (!match) return line;
      if (SENSITIVE_KEY.test(match[2]) || SENSITIVE_KEY.test(match[4])) {
        return `${match[1]}${match[2]}${match[3]}"••••••••"`;
      }
      const quotedValue = match[4].match(/^(["'])(.*)\1\s*(?:#.*)?$/);
      return quotedValue
        ? `${match[1]}${match[2]}${match[3]}${quotedValue[1]}${redactString(quotedValue[2])}${quotedValue[1]}`
        : line;
    })
    .join('\n');
}

function redactArgumentList(values: unknown[]) {
  let redactNext = false;
  return values.map((value) => {
    if (typeof value !== 'string') return redactValue(value);
    if (redactNext) {
      redactNext = false;
      return '••••••••';
    }
    if (/^--?(?:token|api[_-]?key|secret|password|authorization|cookie)$/i.test(value)) {
      redactNext = true;
      return value;
    }
    if (/^--?(?:token|api[_-]?key|secret|password|authorization|cookie)=/i.test(value)) {
      return `${value.split('=')[0]}=••••••••`;
    }
    return redactString(value);
  });
}

function redactString(value: string) {
  if (/^bearer\s+/i.test(value)) return 'Bearer ••••••••';
  try {
    const target = new URL(value);
    if (!['http:', 'https:'].includes(target.protocol)) return value;
    if (target.username || target.password) {
      target.username = '••••';
      target.password = '••••';
    }
    for (const key of [...target.searchParams.keys()]) {
      if (SENSITIVE_KEY.test(key)) target.searchParams.set(key, '••••••••');
    }
    return target.toString();
  } catch {
    return value;
  }
}

function firstString(...values: unknown[]) {
  return values.find((value): value is string => typeof value === 'string' && Boolean(value.trim()));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function createId(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function samePath(left: string, right: string) {
  return normalizePathKey(path.resolve(left)) === normalizePathKey(path.resolve(right));
}

function normalizePathKey(value: string) {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}
