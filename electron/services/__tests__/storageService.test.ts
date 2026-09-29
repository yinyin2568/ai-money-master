import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, realpath, writeFile, rm, symlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { createStorageService, resolveDataDirectory, withStorageLock } from '../storageService.js';
import { createSkillsService } from '../skillsService.js';
import { createSceneMemoryService } from '../sceneMemoryService.js';
import { createPromptsService } from '../promptsService.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const homeDir = await realpath(await mkdtemp(path.join(os.tmpdir(), 'manager-storage-')));
  roots.push(homeDir);
  const root = path.join(homeDir, '.skills-manager');
  await mkdir(path.join(root, 'state'), { recursive: true });
  await writeFile(path.join(root, 'state', 'skills.json'), JSON.stringify({ gitee: { repositories: { 'a/b': { fullName: 'a/b', tags: ['工作'] } } }, customDirectories: [{ path: path.join(root, 'modules', 'demo') }] }));
  return { homeDir, root, service: createStorageService({ homeDir }) };
}

it('migrates data, rebases managed paths and leaves originals intact across restart', async () => {
  const { homeDir, root, service } = await fixture();
  const original = await readFile(path.join(root, 'state', 'skills.json'), 'utf8');
  const target = path.join(homeDir, '独立数据');
  await service.switchDirectory({ directory: target, mode: 'migrate' });
  expect(resolveDataDirectory(homeDir)).toBe(target);
  const saved = JSON.parse(await readFile(path.join(target, 'state', 'skills.json'), 'utf8'));
  expect(saved.gitee.repositories['a/b'].tags).toEqual(['工作']);
  expect(saved.customDirectories[0].path).toBe(path.join(target, 'modules', 'demo'));
  expect(await readFile(path.join(root, 'state', 'skills.json'), 'utf8')).toBe(original);
  expect(createStorageService({ homeDir }).getSettings().directory).toBe(target);
});

it('refuses nonempty, nested and installation targets without changing the pointer', async () => {
  const { homeDir, root } = await fixture();
  const install = path.join(homeDir, 'app');
  const service = createStorageService({ homeDir, installDir: install });
  const occupied = path.join(homeDir, 'occupied');
  await mkdir(occupied); await writeFile(path.join(occupied, 'keep.txt'), 'keep');
  for (const directory of [occupied, path.join(root, 'nested'), homeDir, path.join(install, 'data')]) {
    await expect(service.switchDirectory({ directory, mode: 'migrate' })).rejects.toThrow();
    expect(resolveDataDirectory(homeDir)).toBe(root);
  }
  expect(await readFile(path.join(occupied, 'keep.txt'), 'utf8')).toBe('keep');
});

it('restores an existing data directory after the pointer is lost without overwriting preferences', async () => {
  const { homeDir, service } = await fixture();
  await service.loadPreferences({ 'skills-manager:selected-modules': '["old"]' });
  await service.savePreference('skills-manager:selected-modules', '["new"]');
  const target = path.join(homeDir, 'data');
  await service.switchDirectory({ directory: target, mode: 'migrate' });
  await rm(path.join(homeDir, '.skills-manager-storage.json'));
  const restored = createStorageService({ homeDir });
  await restored.switchDirectory({ directory: target, mode: 'restore' });
  expect((await restored.loadPreferences({ 'skills-manager:selected-modules': '["stale"]' }))['skills-manager:selected-modules']).toBe('["new"]');
});

it('rejects corrupted recovery data and keeps the active directory', async () => {
  const { homeDir, root, service } = await fixture();
  const target = path.join(homeDir, 'broken');
  await mkdir(path.join(target, 'state'), { recursive: true });
  await writeFile(path.join(target, 'state', 'skills.json'), '{bad');
  await expect(service.switchDirectory({ directory: target, mode: 'restore' })).rejects.toThrow();
  expect(resolveDataDirectory(homeDir)).toBe(root);
});

it('serializes concurrent storage operations and releases locks after failure', async () => {
  const { homeDir } = await fixture();
  const events: number[] = [];
  await Promise.all([
    withStorageLock(homeDir, async () => { events.push(1); await new Promise(r => setTimeout(r, 30)); events.push(2); }),
    withStorageLock(homeDir, async () => { events.push(3); })
  ]);
  expect(events).toEqual([1, 2, 3]);
  await expect(withStorageLock(homeDir, async () => { throw new Error('failed'); })).rejects.toThrow('failed');
  await withStorageLock(homeDir, async () => { events.push(4); });
  expect(events).toEqual([1, 2, 3, 4]);
});

it('keeps real collections, scenes and guides across migration and writes new data only to the selected folder', async () => {
  const { homeDir, root, service } = await fixture();
  const skills = createSkillsService({ homeDir });
  await skills.saveGiteeRepository({ fullName: 'example/project' });
  await skills.updateGiteeRepoMeta({ fullName: 'example/project', tags: ['保留'], favorite: true });
  await skills.saveGithubStarCredentials({ token: 'test-token', username: 'tester' });
  const scenes = createSceneMemoryService({ homeDir });
  const scene = await scenes.saveReusableScene({ title: '测试场景', clientId: 'codex', task: '检查迁移', context: '业务背景', tags: ['回归'], memories: [] });
  await createPromptsService({ homeDir }).exportTokenSavingGuide();
  const originalState = await readFile(path.join(root, 'state', 'skills.json'), 'utf8');
  const target = path.join(homeDir, 'saved-data');
  await withStorageLock(homeDir, () => service.switchDirectory({ directory: target, mode: 'migrate' }));
  const restarted = createSkillsService({ homeDir });
  expect(await restarted.listGiteeStars()).toContainEqual(expect.objectContaining({ fullName: 'example/project', tags: ['保留'], favorite: true }));
  expect((await restarted.getGithubStarSettings()).username).toBe('tester');
  expect((await createSceneMemoryService({ homeDir }).listReusableScenes()).scenes).toContainEqual(scene);
  const guide = await createPromptsService({ homeDir }).exportTokenSavingGuide();
  expect(JSON.stringify(guide)).toContain(target.replace(/\\/g, '\\\\'));
  await restarted.saveGiteeRepository({ fullName: 'example/new' });
  expect(await readFile(path.join(root, 'state', 'skills.json'), 'utf8')).toBe(originalState);
  expect((await createSkillsService({ homeDir }).listGiteeStars()).some(repo => repo.fullName === 'example/new')).toBe(true);
});

it('does not silently create a new store when the configured drive is unavailable', async () => {
  const { homeDir, service } = await fixture();
  const target = path.join(homeDir, 'removed-drive');
  await service.switchDirectory({ directory: target, mode: 'migrate' });
  await rm(target, { recursive: true, force: true });
  expect(() => createSkillsService({ homeDir })).toThrow('不可访问');
  expect(service.getSettings().error).toContain('不可访问');
});

it('blocks invalid state instead of migrating an empty database', async () => {
  const { homeDir, root, service } = await fixture();
  await writeFile(path.join(root, 'state', 'skills.json'), 'not json');
  await expect(service.switchDirectory({ directory: path.join(homeDir, 'target'), mode: 'migrate' })).rejects.toThrow();
  expect(resolveDataDirectory(homeDir)).toBe(root);
  await expect(createSkillsService({ homeDir }).listGiteeStars()).rejects.toThrow('损坏');
});

it('preserves managed Skill tags and usage when its path changes', async () => {
  const { homeDir, root, service } = await fixture();
  const skillPath = path.join(root, 'modules', 'demo');
  await mkdir(skillPath, { recursive: true });
  await writeFile(path.join(skillPath, 'SKILL.md'), '---\nname: demo\ndescription: Example\n---\n# Demo');
  const skills = createSkillsService({ homeDir });
  await skills.saveCustomDirectories([{ id: 'demo', label: 'demo', path: skillPath, product: 'custom', enabled: true, builtIn: false }]);
  const [skill] = await skills.scanSkills();
  await skills.updateSkillUserMeta(skill.id, { tags: ['keep'], favorite: true });
  await skills.recordUsage(skill.id);
  await service.switchDirectory({ directory: path.join(homeDir, 'migrated'), mode: 'migrate' });
  const [migrated] = await createSkillsService({ homeDir }).scanSkills();
  expect(migrated.tags).toEqual(['keep']);
  expect(migrated.favorite).toBe(true);
  expect(migrated.callCount).toBe(1);
});

it('waits for a separate process holding the data lock', async () => {
  const { homeDir } = await fixture();
  const lock = path.join(homeDir, '.skills-manager-storage.lock');
  const marker = path.join(homeDir, 'finished');
  const child = spawn(process.execPath, ['-e', `const fs=require('node:fs'),path=require('node:path'); const [lock,marker]=process.argv.slice(1); fs.mkdirSync(lock);const owner=path.join(lock,process.pid+'-abcd.owner');fs.writeFileSync(owner,''); console.log('ready'); setTimeout(()=>{fs.writeFileSync(marker,'done');fs.unlinkSync(owner);fs.rmdirSync(lock);},200);`, lock, marker], { windowsHide: true });
  try {
    await new Promise<void>((resolve, reject) => {
      child.stdout.once('data', () => resolve());
      child.once('error', reject);
      child.once('exit', code => { if (code) reject(new Error(`child failed: ${code}`)); });
    });
    await withStorageLock(homeDir, async () => {
      expect(await readFile(marker, 'utf8')).toBe('done');
    });
  } finally { child.kill(); }
});

it('keeps the old directory active if copying encounters an unsupported link', async () => {
  const { homeDir, root, service } = await fixture();
  const external = path.join(homeDir, 'external');
  await mkdir(external);
  await symlink(external, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await expect(service.switchDirectory({ directory: path.join(homeDir, 'copy-failed'), mode: 'migrate' })).rejects.toThrow('链接');
  expect(resolveDataDirectory(homeDir)).toBe(root);
});

it.each([
  ['preferences.json', { version: 1, values: { 'skills-manager:invalid': 42 } }],
  ['reusable-scenes.json', { version: 1, scenes: [null] }]
])('rejects malformed %s before committing the recovery pointer', async (name, data) => {
  const { homeDir, root, service } = await fixture();
  const target = path.join(homeDir, 'bad-data');
  await mkdir(path.join(target, 'state'), { recursive: true });
  await writeFile(path.join(target, 'state', String(name)), JSON.stringify(data));
  await expect(service.switchDirectory({ directory: target, mode: 'restore' })).rejects.toThrow('格式无效');
  expect(resolveDataDirectory(homeDir)).toBe(root);
});
