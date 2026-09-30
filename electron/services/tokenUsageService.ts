import { execFile } from 'node:child_process';
import { chmodSync, existsSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { TokenUsageReport, TokenUsageSession, TokenUsageDay, TokenUsageModule } from '../../src/shared/types.js';

const execFileAsync = promisify(execFile);

interface TokenUsageOptions {
  codexHomes?: string[];
  now?: Date;
  command?: string;
}

export async function getTokenUsageReport(days = 30, options: TokenUsageOptions = {}): Promise<TokenUsageReport> {
  const safeDays = Math.max(1, Math.min(366, Math.floor(days)));
  const until = options.now ? new Date(options.now) : new Date();
  const since = new Date(until);
  since.setDate(until.getDate() - safeDays + 1);
  const sinceArg = formatDateArg(since);
  const untilArg = formatDateArg(until);
  const command = options.command ?? resolveCcusageCommand();
  const codexHomes = options.codexHomes ?? resolveCodexHomes();
  const env = { ...process.env, CODEX_HOME: codexHomes.join(path.delimiter) };

  try {
    const [dailyOutput, sessionOutput] = await Promise.all([
      runCcusage(command, ['codex', 'daily', '--json', '--since', sinceArg, '--until', untilArg, '--offline'], env),
      runCcusage(command, ['codex', 'session', '--json', '--since', sinceArg, '--until', untilArg, '--offline'], env)
    ]);
    const daysData = normalizeDays(parseJson(dailyOutput));
    const sessions = normalizeSessions(parseJson(sessionOutput));
    return {
      source: 'ccusage',
      fetchedAt: Date.now(),
      since: toIsoDate(since),
      until: toIsoDate(until),
      days: daysData,
      sessions,
      modules: groupModules(sessions),
      totals: sumUsage(daysData)
    };
  } catch (error) {
    return {
      source: 'ccusage',
      fetchedAt: Date.now(),
      since: toIsoDate(since),
      until: toIsoDate(until),
      days: [],
      sessions: [],
      modules: [],
      totals: emptyUsage(),
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function resolveCcusageCommand() {
  const executable = process.platform === 'win32' ? 'ccusage.cmd' : 'ccusage';
  const nativeExecutable = process.platform === 'win32' ? 'ccusage.exe' : 'ccusage';
  const nativePackage = `ccusage-${process.platform}-${process.arch}`;
  const candidates = [
    process.env.AI_MONEY_MASTER_CCUSAGE,
    path.join(process.cwd(), 'node_modules', '@ccusage', nativePackage, 'bin', nativeExecutable),
    path.join(process.cwd(), 'node_modules', '.bin', executable),
    process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@ccusage', nativePackage, 'bin', nativeExecutable) : undefined,
    process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '.bin', executable) : undefined,
    process.resourcesPath ? path.join(process.resourcesPath, 'app.asar', 'node_modules', '.bin', executable) : undefined,
    process.resourcesPath ? path.join(process.resourcesPath, 'app', 'node_modules', '.bin', executable) : undefined
  ].filter((candidate): candidate is string => Boolean(candidate));
  const local = candidates.find((candidate) => existsSync(candidate));
  if (local) return local;
  return executable;
}

function resolveCodexHomes() {
  const configured = (process.env.CODEX_HOME ?? '').split(path.delimiter).map((value) => value.trim()).filter(Boolean);
  return configured.length > 0 ? configured : [path.join(os.homedir(), '.codex')];
}

async function runCcusage(command: string, args: string[], env: NodeJS.ProcessEnv) {
  const nativeSuffix = `/node_modules/@ccusage/ccusage-${process.platform}-${process.arch}/bin/ccusage`;
  if (process.platform !== 'win32' && command.replace(/\\/g, '/').endsWith(nativeSuffix)) {
    // The npm package's own launcher repairs missing executable bits too.
    // We invoke its native binary directly because Electron cannot use that Node launcher.
    const mode = statSync(command).mode;
    if ((mode & 0o100) === 0) chmodSync(command, mode | 0o100);
  }
  const result = await execFileAsync(command, args, {
    windowsHide: true,
    shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(command),
    env,
    maxBuffer: 32 * 1024 * 1024
  });
  return String(result.stdout ?? '');
}

function parseJson(stdout: string): unknown {
  const start = [...stdout].findIndex((char) => char === '{' || char === '[');
  if (start < 0) throw new Error('ccusage 未返回 JSON 数据');
  try { return JSON.parse(stdout.slice(start)); } catch { throw new Error('ccusage JSON 解析失败'); }
}

function normalizeDays(value: unknown): TokenUsageDay[] {
  const rows = Array.isArray(value) ? value : objectArray(value, ['daily', 'data', 'days']);
  return rows.map((row) => normalizeUsage(row, String(getValue(row, ['date', 'day', 'period']) ?? '未知日期')))
    .filter((row) => row.date !== '未知日期')
    .sort((left, right) => left.date.localeCompare(right.date));
}

function normalizeSessions(value: unknown): TokenUsageSession[] {
  const rows = Array.isArray(value) ? value : objectArray(value, ['sessions', 'data']);
  return rows.map((row) => {
    const sessionId = String(getValue(row, ['sessionId', 'session_id', 'id']) ?? '');
    const project = String(getValue(row, ['project', 'projectName', 'instance', 'instanceName']) ?? 'Codex');
    return { id: sessionId, name: project, project, ...normalizeUsage(row, String(getValue(row, ['date', 'day', 'period', 'lastActivity']) ?? '')) };
  }).filter((row) => row.totalTokens > 0 || row.totalCost > 0);
}

function normalizeUsage(row: unknown, date: string): TokenUsageDay {
  return {
    date: date.includes('T') ? date.slice(0, 10) : date,
    inputTokens: numberValue(row, ['inputTokens', 'input_tokens', 'input']),
    outputTokens: numberValue(row, ['outputTokens', 'output_tokens', 'output']),
    cacheCreationTokens: numberValue(row, ['cacheCreationTokens', 'cache_creation_input_tokens']),
    cacheReadTokens: numberValue(row, ['cacheReadTokens', 'cache_read_input_tokens']),
    totalTokens: numberValue(row, ['totalTokens', 'total_tokens', 'tokens']),
    totalCost: numberValue(row, ['totalCost', 'total_cost', 'costUSD', 'cost'])
  };
}

function groupModules(sessions: TokenUsageSession[]): TokenUsageModule[] {
  const grouped = new Map<string, TokenUsageModule>();
  for (const session of sessions) {
    const key = session.project || 'Codex';
    const current = grouped.get(key) ?? { name: key, sessionCount: 0, ...emptyUsage() };
    current.sessionCount += 1;
    current.inputTokens += session.inputTokens;
    current.outputTokens += session.outputTokens;
    current.cacheCreationTokens += session.cacheCreationTokens;
    current.cacheReadTokens += session.cacheReadTokens;
    current.totalTokens += session.totalTokens;
    current.totalCost += session.totalCost;
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((left, right) => right.totalTokens - left.totalTokens);
}

function sumUsage(rows: TokenUsageDay[]) {
  return rows.reduce((total, row) => ({
    inputTokens: total.inputTokens + row.inputTokens,
    outputTokens: total.outputTokens + row.outputTokens,
    cacheCreationTokens: total.cacheCreationTokens + row.cacheCreationTokens,
    cacheReadTokens: total.cacheReadTokens + row.cacheReadTokens,
    totalTokens: total.totalTokens + row.totalTokens,
    totalCost: total.totalCost + row.totalCost
  }), emptyUsage());
}

function emptyUsage() { return { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 0, totalCost: 0 }; }
function objectArray(value: unknown, keys: string[]): unknown[] {
  if (!value || typeof value !== 'object') return [];
  for (const key of keys) { const candidate = (value as Record<string, unknown>)[key]; if (Array.isArray(candidate)) return candidate; }
  return [];
}
function getValue(row: unknown, keys: string[]) {
  if (!row || typeof row !== 'object') return undefined;
  const object = row as Record<string, unknown>;
  return keys.map((key) => object[key]).find((value) => value !== undefined && value !== null);
}
function numberValue(row: unknown, keys: string[]) {
  const value = Number(getValue(row, keys) ?? 0);
  return Number.isFinite(value) ? value : 0;
}
function formatDateArg(value: Date) { return value.toISOString().slice(0, 10).replaceAll('-', ''); }
function toIsoDate(value: Date) { return value.toISOString().slice(0, 10); }
