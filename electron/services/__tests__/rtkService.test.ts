import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const mocks = vi.hoisted(() => ({ exec: vi.fn() }));
vi.mock('node:child_process', () => ({ execFile: mocks.exec }));
import { createRtkService } from '../rtkService.js';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'rtk-other-user-中文-'));
  vi.spyOn(os, 'homedir').mockReturnValue(root);
  vi.stubEnv('CODEX_HOME', path.join(root, 'custom-codex'));
  vi.stubEnv('LOCALAPPDATA', path.join(root, 'AppData', 'Local'));
  mocks.exec.mockImplementation((_command, args, _options, callback) => {
    const output = args[0] === '--version' ? 'rtk 0.28.2' : args.includes('--help') ? '--codex --global' : args[0] === 'gain' ? 'Tokens saved: 120 (60%)' : 'initialized';
    callback(null, output, '');
    return { stdin: { end: vi.fn() } };
  });
});
afterEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllEnvs(); mocks.exec.mockReset();
  await rm(root, { recursive: true, force: true });
});
describe('RTK integration', () => {
  it('detects without initializing and reads measured output', async () => {
    const service = createRtkService();
    expect(await service.execute('status')).toContain('安装不等于已启用');
    expect(mocks.exec.mock.calls.some((call) => call[1][0] === 'init')).toBe(false);
    expect(await service.execute('gain')).toContain('120');
  });
  it('reports absent RTK without claiming zero savings', async () => {
    mocks.exec.mockImplementation((_command, _args, _options, callback) => { callback(new Error('ENOENT'), '', ''); return {}; });
    await expect(createRtkService().execute('gain')).rejects.toThrow('未检测到可用 RTK');
  });
  it('backs up custom Codex configuration before initialization', async () => {
    const config = path.join(root, 'custom-codex');
    await mkdir(config);
    await writeFile(path.join(config, 'AGENTS.md'), 'user rules');
    const result = await createRtkService().execute('enable', 'codex');
    expect(result).toContain('初始化命令已完成');
    const backups = path.join(root, '.skills-manager', 'rtk-backups');
    const [name] = await readdir(backups);
    expect(await readFile(path.join(backups, name, 'AGENTS.md'), 'utf8')).toBe('user rules');
    expect(mocks.exec.mock.calls.some((call) => JSON.stringify(call[1]) === JSON.stringify(['init', '-g', '--codex']))).toBe(true);
  });
  it('rejects unsupported Codex versions and arbitrary commands', async () => {
    mocks.exec.mockImplementation((_command, args, _options, callback) => { callback(null, args[0] === '--version' ? 'rtk 0.1.0' : '', ''); return {}; });
    const service = createRtkService();
    await expect(service.execute('enable', 'codex')).rejects.toThrow('不支持 Codex');
    await expect(service.execute('shell' as 'status')).rejects.toThrow('无效');
  });
  it('installs only the official package without shell interpolation', async () => {
    if (process.platform !== 'win32') return;
    await createRtkService().execute('install');
    const call = mocks.exec.mock.calls.find((item) => item[1][0] === 'install');
    expect(call?.[1]).toContain('rtk-ai.rtk');
    expect(call?.[2].shell).toBeUndefined();
    expect(call?.[2].windowsHide).toBe(true);
  });
  it('requires auto patch support for Claude instead of reporting a skipped patch as success', async () => {
    await expect(createRtkService().execute('enable', 'claude')).rejects.toThrow('不支持无人值守配置');
  });
});
