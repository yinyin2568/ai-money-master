import { constants, existsSync, readFileSync, statSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, realpath, rename, rm, rmdir, stat, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createSkillId } from '../../src/shared/skillIdentity.js';
import type { StorageSettings, SwitchStorageInput } from '../../src/shared/types.js';

const pointerPath = (home: string) => path.join(home, '.skills-manager-storage.json');
const queues = new Map<string, Promise<unknown>>();
const preferenceKey = (key: string) => /^(ai-money-master:|skills-manager:|test-ai-assistant\.prompt-workflow\.)/.test(key) || key === 'test-ai-assistant.pending-scene-context.v1';

export function resolveDataDirectory(homeDir = os.homedir()): string {
  const pointer = pointerPath(homeDir);
  if (!existsSync(pointer)) return path.join(homeDir, '.skills-manager');
  const config = JSON.parse(readFileSync(pointer, 'utf8'));
  if (config.version !== 1 || typeof config.directory !== 'string' || !path.isAbsolute(config.directory)) {
    throw new Error('本地数据目录配置损坏，请在设置中重新选择数据目录');
  }
  if (!existsSync(config.directory) || !statSync(config.directory).isDirectory()) {
    throw new Error(`数据目录不可访问，请连接对应磁盘或在设置中恢复：${config.directory}`);
  }
  return config.directory;
}

/** Shared by desktop IPC and CLI: hold for an entire operation, including reads. */
export function withStorageLock<T>(homeDir: string, operation: () => Promise<T>): Promise<T> {
  const lock = path.join(homeDir, '.skills-manager-storage.lock');
  const previous = queues.get(lock) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(async () => {
    await mkdir(homeDir, { recursive: true });
    const owner = `${process.pid}-${randomUUID()}.owner`;
    const pending = `${lock}.${randomUUID()}.pending`;
    await mkdir(pending);
    await writeFile(path.join(pending, owner), '');
    const deadline = Date.now() + 30_000;
    let acquired = false;
    try {
      while (!acquired) {
        try {
          // Publish a NONEMPTY directory atomically. A competing rename cannot
          // overwrite another owner's nonempty directory on Windows or POSIX.
          await rename(pending, lock);
          acquired = true;
        } catch (error) {
          if (!['EEXIST', 'ENOTEMPTY', 'EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
          const owners = await readdir(lock).catch(() => [] as string[]);
          for (const name of owners) {
            if (!/^\d+-[a-f0-9-]+\.owner$/.test(name)) continue;
            const pid = Number(name.split('-')[0]);
            try { process.kill(pid, 0); }
            catch (probe) {
              if ((probe as NodeJS.ErrnoException).code !== 'ESRCH') continue;
              // Only the process that unlinks this specific dead-owner token
              // may try rmdir. Never recursively delete the shared lock.
              try {
                await unlink(path.join(lock, name));
                await rmdir(lock).catch(() => undefined);
              } catch { /* Another contender already removed this owner. */ }
            }
          }
          if (Date.now() >= deadline) throw new Error('其他进程正在使用本地数据，请稍后重试');
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      return await operation();
    } finally {
      const ownedDirectory = acquired ? lock : pending;
      await unlink(path.join(ownedDirectory, owner)).catch(() => undefined);
      await rmdir(ownedDirectory).catch(() => undefined);
    }
  });
  queues.set(lock, result.catch(() => undefined));
  return result;
}

async function atomicJson(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, file);
  } finally { await rm(temporary, { force: true }); }
}

function inside(parent: string, child: string) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function canonical(directory: string): Promise<string> {
  try { return await realpath(directory); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const parent = path.dirname(directory);
    if (parent === directory) throw error;
    return path.join(await canonical(parent), path.basename(directory));
  }
}

async function validateData(directory: string, requireExisting: boolean) {
  let found = false;
  for (const name of ['skills.json', 'reusable-scenes.json', 'preferences.json']) {
    const file = path.join(directory, 'state', name);
    if (!existsSync(file)) continue;
    const value = JSON.parse(await readFile(file, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`数据文件格式无效：${name}`);
    if (name === 'reusable-scenes.json' && (value.version !== 1 || !Array.isArray(value.scenes) || value.scenes.length > 500 || value.scenes.some((scene: Record<string, unknown> | null) =>
      !scene || ['id', 'title', 'task', 'createdAt', 'updatedAt'].some(key => typeof scene[key] !== 'string') || !['codex', 'claude', 'gemini', 'openclaw', 'other'].includes(String(scene.clientId)) || !Array.isArray(scene.tags) || !Array.isArray(scene.memories)
    ))) throw new Error('场景文件格式无效');
    if (name === 'preferences.json' && (value.version !== 1 || !value.values || typeof value.values !== 'object' || Array.isArray(value.values) || Object.values(value.values).some(item => typeof item !== 'string'))) throw new Error('偏好文件格式无效');
    if (name === 'skills.json' && !['gitee', 'githubStars', 'defaultDirectories', 'customDirectories', 'userMeta', 'appSettings'].some(key => key in value)) throw new Error('收藏及配置文件格式无效');
    found = true;
  }
  if (requireExisting && !found) throw new Error('所选文件夹中没有可恢复的应用数据');
}

function rebase(value: unknown, source: string, target: string): unknown {
  if (typeof value === 'string') {
    return path.isAbsolute(value) && inside(source, value) ? path.join(target, path.relative(source, value)) : value;
  }
  if (Array.isArray(value)) return value.map(item => rebase(item, source, target));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rebase(item, source, target)]));
  return value;
}

async function copyVerified(source: string, target: string, sourceRoot = source, targetRoot = target) {
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`数据目录包含链接，无法安全迁移：${from}`);
    if (entry.isDirectory()) { await copyVerified(from, to, sourceRoot, targetRoot); continue; }
    if (!entry.isFile()) throw new Error(`不支持迁移此文件：${from}`);
    await copyFile(from, to, constants.COPYFILE_EXCL);
    const original = await readFile(from);
    const copied = await readFile(to);
    const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');
    if (hash(original) !== hash(copied)) throw new Error(`复制校验失败：${from}`);
    const relative = path.relative(sourceRoot, from);
    if (relative.startsWith(`state${path.sep}`) && entry.name.endsWith('.json')) {
      await atomicJson(to, rebase(JSON.parse(copied.toString('utf8')), sourceRoot, targetRoot));
    } else if (entry.name.endsWith('.md') || entry.name === 'SKILL.md.disabled') {
      const text = copied.toString('utf8');
      const rebased = text.split(sourceRoot).join(targetRoot).split(sourceRoot.replace(/\\/g, '/')).join(targetRoot.replace(/\\/g, '/'));
      if (rebased !== text) await writeFile(to, rebased, 'utf8');
    }
  }
}

async function migrateSkillIdentities(target: string) {
  const file = path.join(target, 'state', 'skills.json');
  if (!existsSync(file)) return;
  const state = JSON.parse(await readFile(file, 'utf8'));
  if (!state.userMeta) return;
  for (const [oldId, raw] of Object.entries(state.userMeta)) {
    const meta = raw as { localPath?: string; skillId: string; usageEvents?: Array<{ skillId: string }> };
    if (!meta.localPath || !inside(target, meta.localPath)) continue;
    const skillFile = ['SKILL.md', 'SKILL.md.disabled'].map(name => path.join(meta.localPath!, name)).find(existsSync);
    if (!skillFile) continue;
    const id = createSkillId({ localPath: meta.localPath, content: await readFile(skillFile, 'utf8') });
    if (id === oldId) continue;
    state.userMeta[id] = { ...meta, skillId: id, usageEvents: meta.usageEvents?.map(event => ({ ...event, skillId: id })) ?? [] };
    delete state.userMeta[oldId];
  }
  await atomicJson(file, state);
}

export function createStorageService(options: { homeDir?: string; installDir?: string } = {}) {
  const home = path.resolve(options.homeDir ?? os.homedir());
  function getSettings(): StorageSettings {
    try { return { directory: resolveDataDirectory(home), defaultDirectory: path.join(home, '.skills-manager') }; }
    catch (error) { return { directory: '', defaultDirectory: path.join(home, '.skills-manager'), error: String(error instanceof Error ? error.message : error) }; }
  }
  async function switchDirectory(input: SwitchStorageInput): Promise<StorageSettings> {
    if (!['migrate', 'restore'].includes(input.mode) || typeof input.directory !== 'string' || !path.isAbsolute(input.directory.trim())) throw new Error('请选择有效的绝对路径');
    const target = await canonical(path.resolve(input.directory.trim()));
    if (options.installDir && inside(await canonical(path.resolve(options.installDir)), target)) throw new Error('数据目录不能位于程序安装目录中');
    if (target === path.parse(target).root || target === home) throw new Error('请选择专用的数据文件夹');
    if (input.mode === 'migrate') {
      const source = await canonical(resolveDataDirectory(home));
      if (inside(source, target) || inside(target, source)) throw new Error('新旧数据目录不能相同或互相包含');
      if (existsSync(target) && (await readdir(target)).length > 0) throw new Error('目标目录非空，请选择空目录，或使用“恢复已有数据”');
      await validateData(source, false);
      await mkdir(target, { recursive: true });
      if (existsSync(source)) await copyVerified(source, target);
      await migrateSkillIdentities(target);
      await validateData(target, false);
    } else {
      if (!(await stat(target)).isDirectory()) throw new Error('请选择数据文件夹');
      await validateData(target, true);
      // A legacy backup may predate file-based preferences. Never import the
      // current installation's browser cache into a different recovered store.
      const preferences = path.join(target, 'state', 'preferences.json');
      if (!existsSync(preferences)) await atomicJson(preferences, { version: 1, values: {} });
    }
    const probe = path.join(target, `.write-check-${randomUUID()}`);
    await writeFile(probe, '', { flag: 'wx' });
    await rm(probe);
    await atomicJson(pointerPath(home), { version: 1, directory: target });
    return getSettings();
  }
  async function loadPreferences(legacy: Record<string, string> = {}): Promise<Record<string, string>> {
    const directory = resolveDataDirectory(home);
    await validateData(directory, false);
    const file = path.join(directory, 'state', 'preferences.json');
    if (!existsSync(file)) {
      const values = Object.fromEntries(Object.entries(legacy).filter(([key, value]) => preferenceKey(key) && typeof value === 'string'));
      await atomicJson(file, { version: 1, values });
      return values;
    }
    const store = JSON.parse(await readFile(file, 'utf8'));
    if (store.version !== 1 || !store.values || typeof store.values !== 'object' || Array.isArray(store.values) || Object.values(store.values).some(value => typeof value !== 'string')) throw new Error('偏好数据文件格式无效');
    return store.values;
  }
  async function savePreference(key: string, value: string | null) {
    if (!preferenceKey(key) || (value !== null && typeof value !== 'string')) throw new Error('无效的偏好设置');
    const values = await loadPreferences();
    if (value === null) delete values[key]; else values[key] = value;
    await atomicJson(path.join(resolveDataDirectory(home), 'state', 'preferences.json'), { version: 1, values });
  }
  return { getSettings, switchDirectory, loadPreferences, savePreference };
}
