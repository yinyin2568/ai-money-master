import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { getTokenUsageReport } from '../tokenUsageService.js';

let root: string;
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });

it('通过随包 ccusage 读取非默认目录的 Codex 会话，避免误读成 Claude 空数据', async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'token-usage-'));
  const codex = path.join(root, 'Codex 会话');
  await mkdir(path.join(codex, 'sessions'), { recursive: true });
  const timestamp = '2026-09-21T01:00:00.000Z';
  const usage = { input_tokens: 100, cached_input_tokens: 60, output_tokens: 20, reasoning_output_tokens: 5, total_tokens: 120 };
  await writeFile(path.join(codex, 'sessions', 'rollout-test.jsonl'), [
    { timestamp, type: 'session_meta', payload: { id: 'usage-fixture', cwd: root } },
    { timestamp, type: 'turn_context', payload: { model: 'gpt-5' } },
    { timestamp, type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: usage, last_token_usage: usage } } }
  ].map((row) => JSON.stringify(row)).join('\n') + '\n');
  const report = await getTokenUsageReport(30, { codexHomes: [codex], now: new Date(timestamp) });
  expect(report.error).toBeUndefined();
  expect(report.totals.totalTokens).toBe(120);
  expect(report.totals.cacheReadTokens).toBe(60);
  expect(report.sessions).toHaveLength(1);
  expect(report.modules).toEqual([expect.objectContaining({ name: 'Codex', totalTokens: 120, sessionCount: 1 })]);
  expect(report.days[0]).toMatchObject({ date: '2026-09-21', totalTokens: 120 });
}, 30_000);
