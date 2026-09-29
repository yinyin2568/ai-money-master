import { resolveDataDirectory } from './storageService.js';
import { execFile } from 'node:child_process';
import { mkdir, copyFile, writeFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export type RtkAction = 'status' | 'install' | 'enable' | 'gain';
export type RtkClient = 'codex' | 'claude';

export function createRtkService() {
  let busy = false;
  const home = os.homedir();
  const local = process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local');
  const env = { ...process.env, RTK_TELEMETRY_DISABLED: '1', PATH: [process.env.PATH, path.join(local, 'Microsoft', 'WinGet', 'Links'), path.join(local, 'Microsoft', 'WindowsApps'), path.join(home, '.local', 'bin'), path.join(home, '.cargo', 'bin')].filter(Boolean).join(path.delimiter) };
  async function run(command: string, args: string[], timeout = 20000) {
    return new Promise<string>((resolve, reject) => {
      const child = execFile(command, args, { windowsHide: true, timeout, maxBuffer: 1024 * 1024, env, cwd: home }, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve(`${stdout}\n${stderr}`.trim());
      });
      child.stdin?.end();
    });
  }
  async function binary() {
    const candidates = process.platform === 'win32'
      ? [path.join(local, 'Microsoft', 'WinGet', 'Links', 'rtk.exe'), path.join(home, '.local', 'bin', 'rtk.exe'), path.join(home, '.cargo', 'bin', 'rtk.exe'), 'rtk.exe']
      : ['rtk', path.join(home, '.local', 'bin', 'rtk'), path.join(home, '.cargo', 'bin', 'rtk')];
    for (const candidate of candidates) {
      try {
        const version = await run(candidate, ['--version']);
        if (!/^rtk\s+\d/i.test(version)) continue;
        await run(candidate, ['gain']);
        return { command: candidate, version };
      } catch { /* Try the next supported location. */ }
    }
    throw new Error('未检测到可用 RTK；请安装后重新检测。需要官方 rtk-ai/rtk（支持 gain 命令）。');
  }
  async function execute(action: RtkAction, client: RtkClient = 'codex'): Promise<string> {
    if (!['status', 'install', 'enable', 'gain'].includes(action) || !['codex', 'claude'].includes(client)) throw new Error('无效 RTK 操作');
    if (busy) throw new Error('RTK 操作正在执行，请稍候');
    busy = true;
    try {
      if (action === 'install') {
        if (process.platform !== 'win32') throw new Error('当前一键安装仅支持 Windows，请按 RTK 官方说明安装');
        const winget = path.join(local, 'Microsoft', 'WindowsApps', 'winget.exe');
        try {
          await run(winget, ['install', '--id', 'rtk-ai.rtk', '--exact', '--source', 'winget', '--accept-source-agreements', '--accept-package-agreements', '--disable-interactivity'], 300000);
        } catch (error) {
          throw new Error(`RTK 安装未完成：请检查网络和 Windows 应用安装程序（winget），或从官方 Releases 安装。${error instanceof Error ? error.message : error}`);
        }
      }
      const found = await binary();
      if (action === 'status' || action === 'install') return `已检测到 ${found.version}\n位置：${found.command}\n安装不等于已启用；请选择客户端后点击开启 RTK。`;
      if (action === 'gain') return await run(found.command, ['gain']);
      const help = await run(found.command, ['init', '--help']);
      if (client === 'codex' && !help.includes('--codex')) throw new Error('此 RTK 版本不支持 Codex，请先升级 RTK');
      if (client === 'claude' && !help.includes('--auto-patch')) throw new Error('此 RTK 版本不支持无人值守配置，请先升级 RTK 或在终端运行 rtk init -g');
      const root = client === 'codex' ? path.resolve(process.env.CODEX_HOME ?? path.join(home, '.codex')) : path.join(home, '.claude');
      const backup = path.join(resolveDataDirectory(home), 'rtk-backups', `${Date.now()}-${client}`);
      await mkdir(backup, { recursive: true });
      const manifest: Record<string, boolean> = {};
      for (const name of ['AGENTS.md', 'CLAUDE.md', 'RTK.md', 'settings.json', 'hooks.json', 'config.toml']) {
        const source = path.join(root, name);
        try {
          await stat(source);
          await copyFile(source, path.join(backup, name));
          manifest[source] = true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          manifest[source] = false;
        }
      }
      await writeFile(path.join(backup, 'manifest.json'), JSON.stringify(manifest, null, 2));
      try {
        const output = await run(found.command, ['init', '-g', ...(client === 'codex' ? ['--codex'] : ['--auto-patch']), ...(help.includes('--no-trust-filters') ? ['--no-trust-filters'] : [])], 60000);
        if (/MANUAL STEP|non-interactive mode, defaulting to N/i.test(output)) throw new Error(`还需要手动完成配置：${output}`);
        return `RTK 初始化命令已完成（${client}）。请重启对应 AI 客户端，在新会话执行命令后查看收益确认是否生效。\n配置快照：${backup}\n${output}`;
      } catch (error) {
        throw new Error(`RTK 初始化失败，可能存在部分修改。配置快照：${backup}\n${error instanceof Error ? error.message : error}`);
      }
    } finally { busy = false; }
  }
  return { execute };
}
