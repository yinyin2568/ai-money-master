import { execFile } from 'node:child_process';
import { access, lstat, mkdtemp, mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { createSkillsService } from '../skillsService.js';

const execFileAsync = promisify(execFile);
let tempRoot: string | undefined;
const GIT_TEST_TIMEOUT = 20_000;

afterEach(async () => {
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

async function createTempHome() {
  // Windows runners may expose TEMP through an 8.3 alias; services return real paths.
  tempRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), 'skills-manager-test-')));
  return tempRoot;
}

describe('createSkillsService', () => {
  it('scans Claude global skills from the provided home directory', async () => {
    const homeDir = await createTempHome();
    const skillDir = path.join(homeDir, '.claude', 'skills', 'code-review');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      path.join(skillDir, 'SKILL.md'),
      ['---', 'name: code-review', 'description: 代码审查助手', '---', '', '# Code Review'].join('\n'),
      'utf8'
    );

    const service = createSkillsService({ homeDir });
    const skills = await service.scanSkills();

    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      name: 'code-review',
      description: '代码审查助手',
      product: 'claude',
      favorite: false,
      tags: [],
      callCount: 0
    });
  });

  it('persists favorite, tags, and manual usage events in local state', async () => {
    const homeDir = await createTempHome();
    const skillDir = path.join(homeDir, '.codex', 'skills', 'doc-helper');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: doc-helper\ndescription: 写文档\n---', 'utf8');

    const service = createSkillsService({ homeDir });
    const [skill] = await service.scanSkills();
    await service.updateSkillUserMeta(skill.id, { favorite: true, tags: ['常用', '写文档'] });
    await service.recordUsage(skill.id, 'manualCall', 'manual');

    const [updated] = await service.scanSkills();
    expect(updated.favorite).toBe(true);
    expect(updated.tags).toEqual(['常用', '写文档']);
    expect(updated.callCount).toBe(1);
    expect(updated.lastCalledAt).toBeTypeOf('number');

    const state = await readFile(path.join(homeDir, '.skills-manager', 'state', 'skills.json'), 'utf8');
    expect(state).toContain('doc-helper');
  });

  it('records manager events without increasing skill call count', async () => {
    const homeDir = await createTempHome();
    const skillDir = path.join(homeDir, '.codex', 'skills', 'security-helper');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: security-helper\ndescription: 安全扫描\n---', 'utf8');

    const service = createSkillsService({ homeDir });
    const [skill] = await service.scanSkills();
    await service.recordUsage(skill.id, 'view', 'manager');
    await service.recordUsage(skill.id, 'openFolder', 'manager');
    await service.scanSkillSecurity(skill.localPath, skill.id);

    const [updated] = await service.scanSkills();
    expect(updated.callCount).toBe(0);
    expect(updated.lastCalledAt).toBeUndefined();
    expect(updated.securityLevel).toBe('safe');
  });

  it('adds repository-style local source directories as custom directories without copying skills', async () => {
    const homeDir = await createTempHome();
    const sourceRoot = path.join(homeDir, 'skills-source');
    const firstSkill = path.join(sourceRoot, 'skills', 'api-helper');
    const secondSkill = path.join(sourceRoot, 'skills', 'web-helper');
    const templateSkill = path.join(sourceRoot, 'templates', 'skill-template');
    await mkdir(firstSkill, { recursive: true });
    await mkdir(secondSkill, { recursive: true });
    await mkdir(templateSkill, { recursive: true });
    await writeFile(path.join(firstSkill, 'SKILL.md'), '---\nname: api-helper\ndescription: API 分析\n---', 'utf8');
    await writeFile(path.join(secondSkill, 'SKILL.md'), '---\nname: web-helper\ndescription: Web 分析\n---', 'utf8');
    await writeFile(path.join(templateSkill, 'SKILL.md'), '---\nname: skill-template\ndescription: 模板\n---', 'utf8');

    const service = createSkillsService({ homeDir });
    const result = await service.importLocalSkill(sourceRoot, 'codex');
    const skills = await service.scanSkills();
    const directories = await service.getDirectories();

    expect(result.message).toContain('已添加自定义目录');
    expect(directories).toContainEqual(
      expect.objectContaining({
        product: 'custom',
        path: sourceRoot,
        enabled: true,
        builtIn: false
      })
    );
    expect(skills.map((skill) => skill.name).sort()).toEqual(['api-helper', 'skill-template', 'web-helper']);
    expect(skills.every((skill) => skill.localPath.startsWith(sourceRoot))).toBe(true);
  });

  it('imports a single local skill folder by copying it into the selected module', async () => {
    const homeDir = await createTempHome();
    const sourceSkill = path.join(homeDir, 'downloads', 'copy-helper');
    await mkdir(path.join(homeDir, '.claude', 'skills'), { recursive: true });
    await mkdir(sourceSkill, { recursive: true });
    await writeFile(path.join(sourceSkill, 'SKILL.md'), '---\nname: copy-helper\ndescription: 复制导入\n---', 'utf8');

    const service = createSkillsService({ homeDir });
    const result = await service.importLocalSkill(sourceSkill, 'claude');
    const skills = await service.scanSkills();

    expect(result.message).toContain(path.join(homeDir, '.claude', 'skills', 'copy-helper'));
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      name: 'copy-helper',
      product: 'claude',
      storageKind: 'full'
    });
    expect(skills[0].localPath).toBe(path.join(homeDir, '.claude', 'skills', 'copy-helper'));
  });

  it('syncs a skill into another module as a compatible symlink', async () => {
    const homeDir = await createTempHome();
    const sourceSkill = path.join(homeDir, '.codex', 'skills', 'sync-helper');
    const targetRoot = path.join(homeDir, 'modules', 'team-module');
    await mkdir(sourceSkill, { recursive: true });
    await writeFile(path.join(sourceSkill, 'SKILL.md'), '---\nname: sync-helper\ndescription: 同步测试\n---', 'utf8');

    const service = createSkillsService({ homeDir });
    await service.saveCustomDirectories([
      {
        id: 'team-module',
        label: '团队模块',
        product: 'custom',
        path: targetRoot,
        enabled: true,
        builtIn: false
      }
    ]);

    const [source] = await service.scanSkills();
    const result = await service.syncSkillToDirectory(source.localPath, 'team-module', 'symlink');
    const targetPath = path.join(targetRoot, 'sync-helper');
    const targetStat = await lstat(targetPath);
    const skills = await service.scanSkills();
    const linked = skills.find((skill) => skill.directoryId === 'team-module');
    const original = skills.find((skill) => skill.directoryId === 'codex');

    expect(result.message).toContain('已软连接同步到');
    expect(targetStat.isSymbolicLink()).toBe(true);
    expect(original).toMatchObject({ storageKind: 'full' });
    expect(linked).toMatchObject({
      name: 'sync-helper',
      storageKind: 'symlink',
      localPath: targetPath
    });
    expect(linked?.linkTarget?.toLowerCase()).toBe(source.localPath.toLowerCase());
  });

  it('syncs a skill into another module as a full copy when requested', async () => {
    const homeDir = await createTempHome();
    const sourceSkill = path.join(homeDir, '.codex', 'skills', 'copy-sync-helper');
    const targetRoot = path.join(homeDir, 'modules', 'team-module');
    await mkdir(sourceSkill, { recursive: true });
    await writeFile(path.join(sourceSkill, 'SKILL.md'), '---\nname: copy-sync-helper\ndescription: 完整复制\n---', 'utf8');

    const service = createSkillsService({ homeDir });
    await service.saveCustomDirectories([
      {
        id: 'team-module',
        label: '团队模块',
        product: 'custom',
        path: targetRoot,
        enabled: true,
        builtIn: false
      }
    ]);

    const [source] = await service.scanSkills();
    const result = await service.syncSkillToDirectory(source.localPath, 'team-module', 'copy');
    const targetPath = path.join(targetRoot, 'copy-sync-helper');
    const targetStat = await lstat(targetPath);
    const skills = await service.scanSkills();
    const copied = skills.find((skill) => skill.directoryId === 'team-module');

    expect(result.message).toContain('已完整复制到');
    expect(targetStat.isSymbolicLink()).toBe(false);
    expect(copied).toMatchObject({
      name: 'copy-sync-helper',
      storageKind: 'full',
      localPath: targetPath
    });
    expect(copied?.linkTarget).toBeUndefined();
  });

  it('lists default module paths for common local AI tools', async () => {
    const homeDir = await createTempHome();
    await mkdir(path.join(homeDir, '.codex', 'skills'), { recursive: true });
    await mkdir(path.join(homeDir, '.claude', 'skills'), { recursive: true });

    const service = createSkillsService({ homeDir });
    const candidates = await service.getDefaultModuleCandidates();
    const labels = candidates.map((candidate) => candidate.label);

    expect(candidates.length).toBeGreaterThanOrEqual(29);
    expect(labels).toEqual(
      expect.arrayContaining([
        'Codex',
        'Claude Code',
        'Cursor',
        'Gemini CLI',
        'Windsurf',
        'Trae',
        'Cline',
        'Augment',
        'Goose',
        'OpenClaw'
      ])
    );
    expect(candidates).toContainEqual(
      expect.objectContaining({
        productId: 'codex',
        path: path.join(homeDir, '.codex', 'skills'),
        exists: true
      })
    );
    expect(candidates).toContainEqual(
      expect.objectContaining({
        productId: 'claude',
        path: path.join(homeDir, '.claude', 'skills'),
        exists: true
      })
    );
  });

  it('only activates default modules whose local paths exist', async () => {
    const homeDir = await createTempHome();
    await mkdir(path.join(homeDir, '.codex', 'skills'), { recursive: true });
    await mkdir(path.join(homeDir, '.cursor', 'skills'), { recursive: true });

    const service = createSkillsService({ homeDir });
    const directories = await service.getDirectories();
    const defaultDirectories = directories.filter((directory) => directory.builtIn);

    expect(defaultDirectories.map((directory) => directory.id).sort()).toEqual(['codex', 'cursor']);
    expect(defaultDirectories).not.toContainEqual(expect.objectContaining({ id: 'claude' }));
    expect(defaultDirectories).not.toContainEqual(expect.objectContaining({ id: 'gemini' }));
  });

  it('saves editable default module paths and scans from the edited location', async () => {
    const homeDir = await createTempHome();
    const editedRoot = path.join(homeDir, 'portable-claude', 'skills');
    const editedSkill = path.join(editedRoot, 'edited-default-helper');
    const disabledRoot = path.join(homeDir, 'disabled-codex', 'skills');
    const disabledSkill = path.join(disabledRoot, 'disabled-helper');
    await mkdir(editedSkill, { recursive: true });
    await mkdir(disabledSkill, { recursive: true });
    await writeFile(path.join(editedSkill, 'SKILL.md'), '---\nname: edited-default-helper\ndescription: 手动路径\n---', 'utf8');
    await writeFile(path.join(disabledSkill, 'SKILL.md'), '---\nname: disabled-helper\ndescription: 禁用路径\n---', 'utf8');

    const service = createSkillsService({ homeDir });
    await service.saveDefaultDirectories([
      {
        id: 'claude',
        label: 'Claude Code',
        product: 'claude',
        path: editedRoot,
        enabled: true,
        builtIn: true
      },
      {
        id: 'codex',
        label: 'Codex',
        product: 'codex',
        path: disabledRoot,
        enabled: false,
        builtIn: true
      }
    ]);

    const directories = await service.getDirectories();
    const skills = await service.scanSkills();

    expect(directories).toContainEqual(
      expect.objectContaining({
        id: 'claude',
        path: editedRoot,
        builtIn: true,
        enabled: true
      })
    );
    expect(skills.map((skill) => skill.name)).toEqual(['edited-default-helper']);
  });

  it('merges newly supported default tools into older saved default directory settings', async () => {
    const homeDir = await createTempHome();
    await mkdir(path.join(homeDir, '.claude', 'skills'), { recursive: true });
    await mkdir(path.join(homeDir, '.codex', 'skills'), { recursive: true });
    await mkdir(path.join(homeDir, '.cursor', 'skills'), { recursive: true });
    await mkdir(path.join(homeDir, '.gemini', 'skills'), { recursive: true });
    const service = createSkillsService({ homeDir });
    await service.saveDefaultDirectories([
      {
        id: 'claude',
        label: 'Claude Code',
        product: 'claude',
        path: path.join(homeDir, '.claude', 'skills'),
        enabled: true,
        builtIn: true
      },
      {
        id: 'codex',
        label: 'Codex',
        product: 'codex',
        path: path.join(homeDir, '.codex', 'skills'),
        enabled: true,
        builtIn: true
      }
    ]);

    const directories = await service.getDirectories();

    expect(directories.length).toBe(4);
    expect(directories).toContainEqual(expect.objectContaining({ id: 'cursor', label: 'Cursor' }));
    expect(directories).toContainEqual(expect.objectContaining({ id: 'gemini', label: 'Gemini CLI' }));
  });

  it('disables and enables a skill inside a specific tool directory', async () => {
    const homeDir = await createTempHome();
    const skillDir = path.join(homeDir, '.codex', 'skills', 'tool-toggle-helper');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: tool-toggle-helper\ndescription: 工具级启停\n---', 'utf8');

    const service = createSkillsService({ homeDir });
    const [skill] = await service.scanSkills();
    const disabled = await service.setSkillEnabled(skill.localPath, false);
    const [disabledSkill] = await service.scanSkills();

    expect(disabled.message).toContain('已禁用');
    await expect(access(path.join(skillDir, 'SKILL.md'))).rejects.toThrow();
    await expect(access(path.join(skillDir, 'SKILL.md.disabled'))).resolves.toBeUndefined();
    expect(disabledSkill).toMatchObject({ name: 'tool-toggle-helper', disabled: true, product: 'codex' });

    const enabled = await service.setSkillEnabled(skill.localPath, true);
    const [enabledSkill] = await service.scanSkills();

    expect(enabled.message).toContain('已启用');
    await expect(access(path.join(skillDir, 'SKILL.md'))).resolves.toBeUndefined();
    expect(enabledSkill.disabled).toBe(false);
  });

  it('toggles call tracking injection and reads call count from the skill-local usage file', async () => {
    const homeDir = await createTempHome();
    const skillDir = path.join(homeDir, '.codex', 'skills', 'counted-helper');
    const usagePath = path.join(skillDir, '.skills-memory', 'usage.json');
    const recorderPath = path.join(skillDir, '.skills-memory', 'record-call.mjs');
    const originalContent = '---\nname: counted-helper\ndescription: 调用统计\n---';
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), originalContent, 'utf8');

    const service = createSkillsService({ homeDir });
    const [skill] = await service.scanSkills();
    await service.recordUsage(skill.id, 'manualCall', 'manual');
    const enabled = await service.setSkillCallTracking(skill.localPath, skill.id, true);

    expect(enabled.message).toContain('调用统计已启用');
    await expect(access(usagePath)).resolves.toBeUndefined();

    const injected = await readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
    expect(injected).toContain('skills-manager:call-tracking:start');
    expect(injected).toContain(`统计文件：${usagePath}`);
    expect(injected).toContain(`Skill 根路径：${skillDir}`);
    expect(injected).toContain('node .skills-memory/record-call.mjs --source codex');
    expect(injected).not.toContain('skills-manager-releases');
    expect(injected).not.toContain('skills-manager.cmd');

    await expect(access(recorderPath)).resolves.toBeUndefined();
    await execFileAsync(process.execPath, [recorderPath, '--source', 'codex'], { cwd: skillDir });
    const scriptUsage = JSON.parse(await readFile(usagePath, 'utf8')) as { callCount: number; source: string };
    expect(scriptUsage.callCount).toBe(1);
    expect(scriptUsage.source).toBe('codex');

    const recorded = await service.recordSkillCall(skill.localPath, 'codex');
    const firstUsage = JSON.parse(await readFile(usagePath, 'utf8')) as { callCount: number; source: string };
    expect(recorded.message).toContain('已记录 Skill 调用');
    expect(firstUsage.callCount).toBe(2);
    expect(firstUsage.source).toBe('codex');

    await writeFile(usagePath, JSON.stringify({ callCount: 7, lastCalledAt: 1_718_000_000_000 }, null, 2), 'utf8');

    const [trackedSkill] = await service.scanSkills();
    expect(trackedSkill.callTrackingEnabled).toBe(true);
    expect(trackedSkill.callCount).toBe(7);
    expect(trackedSkill.lastCalledAt).toBe(1_718_000_000_000);

    const disabled = await service.setSkillCallTracking(trackedSkill.localPath, trackedSkill.id, false);
    const cleaned = await readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
    const [untrackedSkill] = await service.scanSkills();

    expect(disabled.message).toContain('调用统计已停用');
    expect(cleaned).not.toContain('skills-manager:call-tracking:start');
    expect(cleaned.trimEnd()).toBe(originalContent);
    await expect(access(usagePath)).rejects.toThrow();
    await expect(access(recorderPath)).rejects.toThrow();
    expect(untrackedSkill.callTrackingEnabled).toBe(false);
    expect(untrackedSkill.callCount).toBe(0);
    expect(untrackedSkill.lastCalledAt).toBeUndefined();
  });

  it('lists and shares built-in marketplace skills', async () => {
    const homeDir = await createTempHome();
    const service = createSkillsService({ homeDir });

    const items = await service.listMarketplaceSkills();
    const result = await service.shareMarketplaceSkill('khazix-skills');

    expect(items.length).toBeGreaterThan(0);
    expect(items).toContainEqual(expect.objectContaining({ id: 'khazix-skills', repoUrl: 'https://github.com/KKKKhazix/Khazix-Skills' }));
    expect(result.message).toContain('Khazix-Skills');
  });

  it('adds and removes manually collected cloud marketplace projects', async () => {
    const homeDir = await createTempHome();
    const service = createSkillsService({ homeDir });

    const added = await service.addMarketplaceSkill({
      repoUrl: 'https://gitee.com/proxy-ip/ipdodo',
      name: 'ipdodo',
      tags: ['Gitee', '代理IP']
    });
    const withCustom = await service.listMarketplaceSkills();

    expect(added.message).toContain('已收藏云端项目');
    expect(withCustom).toContainEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^custom_/),
        name: 'ipdodo',
        repoUrl: 'https://gitee.com/proxy-ip/ipdodo',
        author: 'proxy-ip',
        custom: true,
        tags: ['Gitee', '代理IP']
      })
    );

    const customItem = withCustom.find((item) => item.repoUrl === 'https://gitee.com/proxy-ip/ipdodo');
    expect(customItem).toBeTruthy();
    await service.removeMarketplaceSkill(customItem!.id);
    const afterRemove = await service.listMarketplaceSkills();

    expect(afterRemove).not.toContainEqual(expect.objectContaining({ repoUrl: 'https://gitee.com/proxy-ip/ipdodo' }));
  });

  it('imports all nested skills from a GitHub repository source', async () => {
    const homeDir = await createTempHome();
    const sourceRepo = path.join(homeDir, 'community-skills-source');
    await mkdir(path.join(homeDir, '.codex', 'skills'), { recursive: true });
    await createGitRepository(sourceRepo, {
      'skills/first-helper/SKILL.md': '---\nname: first-helper\ndescription: 第一个社区技能\n---',
      'packs/second-helper/SKILL.md': '---\nname: second-helper\ndescription: 第二个社区技能\n---'
    });

    const service = createSkillsService({ homeDir });
    const result = await service.importGithubSkill(sourceRepo, 'codex');
    const skills = await service.scanSkills();

    expect(result.message).toContain('导入 2 个 Skills');
    expect(skills.map((skill) => skill.name).sort()).toEqual(['first-helper', 'second-helper']);
    await expect(access(path.join(homeDir, '.codex', 'skills', 'first-helper', 'SKILL.md'))).resolves.toBeUndefined();
    await expect(access(path.join(homeDir, '.codex', 'skills', 'second-helper', 'SKILL.md'))).resolves.toBeUndefined();
  }, GIT_TEST_TIMEOUT);

  it('installs a manually entered local marketplace project path', async () => {
    const homeDir = await createTempHome();
    await mkdir(path.join(homeDir, '.codex', 'skills'), { recursive: true });
    const projectRoot = path.join(homeDir, 'local-market-source');
    await mkdir(path.join(projectRoot, 'skills', 'manual-helper'), { recursive: true });
    await writeFile(
      path.join(projectRoot, 'skills', 'manual-helper', 'SKILL.md'),
      '---\nname: manual-helper\ndescription: 手动市场路径\n---',
      'utf8'
    );

    const service = createSkillsService({ homeDir });
    const result = await service.installMarketplaceSkill({
      id: '',
      localPath: projectRoot,
      targetDirectoryId: 'codex'
    } as any);
    const directories = await service.getDirectories();
    const skills = await service.scanSkills();

    expect(result.message).toContain('已添加自定义目录');
    expect(directories).toContainEqual(expect.objectContaining({ builtIn: false, path: projectRoot, enabled: true }));
    expect(skills).toContainEqual(expect.objectContaining({ name: 'manual-helper', localPath: path.join(projectRoot, 'skills', 'manual-helper') }));
  });

  it('creates a named module from a local directory and scans its nested skills', async () => {
    const homeDir = await createTempHome();
    const sourceRoot = path.join(homeDir, 'skills-source');
    const skillDir = path.join(sourceRoot, 'skills', 'named-module-helper');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: named-module-helper\ndescription: 命名模块\n---', 'utf8');

    const service = createSkillsService({ homeDir });
    const result = await service.createModule({
      name: '阿里云 Skills 源',
      mode: 'local',
      localPath: sourceRoot
    });
    const directories = await service.getDirectories();
    const skills = await service.scanSkills();

    expect(result.message).toContain('已新增模块：阿里云 Skills 源');
    expect(directories).toContainEqual(
      expect.objectContaining({
        label: '阿里云 Skills 源',
        path: sourceRoot,
        enabled: true,
        builtIn: false
      })
    );
    expect(skills).toContainEqual(
      expect.objectContaining({
        name: 'named-module-helper',
        localPath: skillDir
      })
    );
  });

  it('creates a named module from a selected default path', async () => {
    const homeDir = await createTempHome();
    const traeRoot = path.join(homeDir, '.trae', 'skills');
    const skillDir = path.join(traeRoot, 'trae-helper');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: trae-helper\ndescription: Trae 默认目录\n---', 'utf8');

    const service = createSkillsService({ homeDir });
    const result = await service.createModule({
      name: 'Trae 默认 Skills',
      mode: 'default',
      defaultPath: traeRoot
    });
    const skills = await service.scanSkills();

    expect(result.message).toContain('已启用默认模块：Trae 默认 Skills');
    expect(skills).toContainEqual(
      expect.objectContaining({
        name: 'trae-helper',
        localPath: skillDir
      })
    );
  });

  it('rejects duplicate module paths when creating or editing modules', async () => {
    const homeDir = await createTempHome();
    const sourceRoot = path.join(homeDir, 'skills-source');
    await mkdir(sourceRoot, { recursive: true });

    const service = createSkillsService({ homeDir });
    await service.createModule({
      name: '主仓库',
      mode: 'local',
      localPath: sourceRoot
    });

    await expect(
      service.createModule({
        name: '重复仓库',
        mode: 'local',
        localPath: sourceRoot
      })
    ).rejects.toThrow('模块路径已存在');

    await expect(
      service.saveCustomDirectories([
        {
          id: 'first-module',
          label: '第一个模块',
          product: 'custom',
          path: path.join(homeDir, 'first'),
          enabled: true,
          builtIn: false
        },
        {
          id: 'second-module',
          label: '第二个模块',
          product: 'custom',
          path: path.join(homeDir, 'first'),
          enabled: true,
          builtIn: false
        }
      ])
    ).rejects.toThrow('模块路径不能重复');
  });

  it('persists module tags for default and custom module path settings', async () => {
    const homeDir = await createTempHome();
    const defaultPath = path.join(homeDir, '.claude', 'skills');
    const customPath = path.join(homeDir, 'team-skills');
    await mkdir(defaultPath, { recursive: true });
    const service = createSkillsService({ homeDir });

    await service.saveDefaultDirectories([
      {
        id: 'claude',
        label: 'Claude Code',
        product: 'claude',
        path: defaultPath,
        enabled: true,
        builtIn: true,
        tags: ['官方', '常用']
      }
    ]);
    await service.saveCustomDirectories([
      {
        id: 'team',
        label: '团队模块',
        product: 'custom',
        path: customPath,
        enabled: true,
        builtIn: false,
        tags: ['团队', '研发']
      }
    ]);

    const directories = await service.getDirectories();

    expect(directories).toContainEqual(expect.objectContaining({ label: 'Claude Code', tags: ['官方', '常用'] }));
    expect(directories).toContainEqual(expect.objectContaining({ label: '团队模块', tags: ['团队', '研发'] }));
  });

  it('creates local modules with configured module tags', async () => {
    const homeDir = await createTempHome();
    const modulePath = path.join(homeDir, 'tagged-skills');
    await mkdir(modulePath, { recursive: true });
    const service = createSkillsService({ homeDir });

    await service.createModule({
      name: '带标签模块',
      mode: 'local',
      localPath: modulePath,
      tags: ['团队', '沉淀']
    });

    const directories = await service.getDirectories();

    expect(directories).toContainEqual(expect.objectContaining({ label: '带标签模块', tags: ['团队', '沉淀'] }));
  });

  it('normalizes module tags split by Chinese and English separators', async () => {
    const homeDir = await createTempHome();
    const modulePath = path.join(homeDir, 'mixed-tag-skills');
    await mkdir(modulePath, { recursive: true });
    const service = createSkillsService({ homeDir });

    await service.createModule({
      name: '混合标签模块',
      mode: 'local',
      localPath: modulePath,
      tags: ['团队,常用，查询、AI;沉淀']
    });

    const directories = await service.getDirectories();

    expect(directories).toContainEqual(
      expect.objectContaining({ label: '混合标签模块', tags: ['团队', '常用', '查询', 'AI', '沉淀'] })
    );
  });

  it('exposes module tags on scanned skills', async () => {
    const homeDir = await createTempHome();
    const modulePath = path.join(homeDir, 'tagged-skills');
    const skillPath = path.join(modulePath, 'query-helper');
    await mkdir(skillPath, { recursive: true });
    await writeFile(path.join(skillPath, 'SKILL.md'), '---\nname: query-helper\ndescription: 查询助手\n---', 'utf8');
    const service = createSkillsService({ homeDir });

    await service.createModule({
      name: '带标签模块',
      mode: 'local',
      localPath: modulePath,
      tags: ['团队', '沉淀']
    });

    const skills = await service.scanSkills();

    expect(skills).toContainEqual(expect.objectContaining({ name: 'query-helper', moduleTags: ['团队', '沉淀'] }));
  });

  it('stores GitHub Star credentials without exposing the token', async () => {
    const homeDir = await createTempHome();
    const service = createSkillsService({ homeDir });

    const settings = await service.saveGithubStarCredentials({ username: 'octocat', token: 'ghp_secret_token' });
    const state = await readFile(path.join(homeDir, '.skills-manager', 'state', 'skills.json'), 'utf8');

    expect(settings).toMatchObject({ username: 'octocat', tokenConfigured: true });
    expect(JSON.stringify(settings)).not.toContain('ghp_secret_token');
    expect(state).toContain('ghp_secret_token');
  });

  it('syncs GitHub Stars while keeping local tags and detecting pushed updates', async () => {
    const homeDir = await createTempHome();
    const service = createSkillsService({
      homeDir,
      githubFetch: async () => ({
        status: 200,
        ok: true,
        json: async () => [
          {
            starred_at: '2026-06-20T08:00:00Z',
            repo: {
              id: 1,
              full_name: 'octocat/Hello-World',
              name: 'Hello-World',
              owner: { login: 'octocat' },
              description: 'Demo repo',
              html_url: 'https://github.com/octocat/Hello-World',
              clone_url: 'https://github.com/octocat/Hello-World.git',
              language: 'TypeScript',
              topics: ['demo'],
              stargazers_count: 80,
              forks_count: 9,
              open_issues_count: 1,
              private: false,
              archived: false,
              pushed_at: '2026-06-20T09:00:00Z',
              updated_at: '2026-06-20T09:30:00Z'
            }
          }
        ]
      })
    });

    await service.saveGithubStarCredentials({ username: 'octocat', token: 'ghp_secret_token' });
    await service.syncGithubStars({ pages: 1 });
    await service.updateGithubStarMeta({ fullName: 'octocat/Hello-World', tags: ['工具', 'AI'], favorite: true });
    await service.syncGithubStars({ pages: 1 });

    const [repo] = await service.listGithubStars();

    expect(repo.tags).toEqual(['工具', 'AI']);
    expect(repo.favorite).toBe(true);
    expect(repo.hasUpdate).toBe(false);

    const serviceWithUpdate = createSkillsService({
      homeDir,
      githubFetch: async () => ({
        status: 200,
        ok: true,
        json: async () => [
          {
            starred_at: '2026-06-20T08:00:00Z',
            repo: {
              id: 1,
              full_name: 'octocat/Hello-World',
              name: 'Hello-World',
              owner: { login: 'octocat' },
              description: 'Demo repo',
              html_url: 'https://github.com/octocat/Hello-World',
              clone_url: 'https://github.com/octocat/Hello-World.git',
              language: 'TypeScript',
              topics: ['demo'],
              stargazers_count: 80,
              forks_count: 9,
              open_issues_count: 1,
              private: false,
              archived: false,
              pushed_at: '2026-06-22T09:00:00Z',
              updated_at: '2026-06-22T09:30:00Z'
            }
          }
        ]
      })
    });

    await serviceWithUpdate.syncGithubStars({ pages: 1 });
    const [updatedRepo] = await serviceWithUpdate.listGithubStars();

    expect(updatedRepo.tags).toEqual(['工具', 'AI']);
    expect(updatedRepo.hasUpdate).toBe(true);
  });

  it('searches high-star GitHub repository recommendations', async () => {
    const homeDir = await createTempHome();
    const requestedUrls: string[] = [];
    const service = createSkillsService({
      homeDir,
      githubFetch: async (url) => {
        requestedUrls.push(url);
        return {
          status: 200,
          ok: true,
          json: async () => ({
            items: [
              {
                id: 2,
                full_name: 'modelcontextprotocol/servers',
                name: 'servers',
                owner: { login: 'modelcontextprotocol' },
                description: 'MCP servers',
                html_url: 'https://github.com/modelcontextprotocol/servers',
                clone_url: 'https://github.com/modelcontextprotocol/servers.git',
                language: 'TypeScript',
                topics: ['mcp', 'ai'],
                stargazers_count: 12000,
                forks_count: 900,
                open_issues_count: 12,
                private: false,
                archived: false,
                pushed_at: '2026-06-22T09:00:00Z',
                updated_at: '2026-06-22T09:30:00Z',
                score: 1
              }
            ]
          })
        };
      }
    });

    const results = await service.searchGithubRepositories({ query: 'mcp skills', minStars: 5000, perPage: 10 });
    const decodedUrl = decodeURIComponent(requestedUrls[0]).replace(/\+/g, ' ');

    expect(requestedUrls[0]).toContain('/search/repositories');
    expect(decodedUrl).toContain('mcp skills stars:>=5000');
    expect(results).toContainEqual(
      expect.objectContaining({
        fullName: 'modelcontextprotocol/servers',
        stars: 12000,
        topics: ['mcp', 'ai']
      })
    );
  });

  it('stars a recommended GitHub repository and stores it locally', async () => {
    const homeDir = await createTempHome();
    const requests: Array<{ url: string; method?: string }> = [];
    const service = createSkillsService({
      homeDir,
      githubFetch: async (url, init) => {
        requests.push({ url, method: init?.method });
        return {
          status: init?.method === 'PUT' ? 204 : 200,
          ok: true,
          json: async () => ({})
        };
      }
    });

    await service.saveGithubStarCredentials({ username: 'octocat', token: 'ghp_secret_token' });
    const result = await service.starGithubRepository({
      fullName: 'modelcontextprotocol/servers',
      repository: {
        id: 2,
        fullName: 'modelcontextprotocol/servers',
        name: 'servers',
        owner: 'modelcontextprotocol',
        description: 'MCP servers',
        htmlUrl: 'https://github.com/modelcontextprotocol/servers',
        cloneUrl: 'https://github.com/modelcontextprotocol/servers.git',
        language: 'TypeScript',
        topics: ['mcp', 'ai'],
        stars: 12000,
        forks: 900,
        openIssues: 12,
        private: false,
        archived: false,
        pushedAt: '2026-06-22T09:00:00Z',
        updatedAt: '2026-06-22T09:30:00Z'
      }
    });
    const repos = await service.listGithubStars();

    expect(requests).toContainEqual(
      expect.objectContaining({
        url: 'https://api.github.com/user/starred/modelcontextprotocol/servers',
        method: 'PUT'
      })
    );
    expect(result.message).toContain('已加星');
    expect(repos).toContainEqual(expect.objectContaining({ fullName: 'modelcontextprotocol/servers', hasUpdate: false }));
  });

  it('searches high-star Gitee repository recommendations', async () => {
    const homeDir = await createTempHome();
    const requestedUrls: string[] = [];
    const service = createSkillsService({
      homeDir,
      githubFetch: async (url) => {
        requestedUrls.push(url);
        return {
          status: 200,
          ok: true,
          json: async () => [
            {
              id: 2026,
              full_name: 'openeuler/iSulad',
              name: 'iSulad',
              namespace: { path: 'openeuler' },
              description: 'Lightweight container runtime',
              html_url: 'https://gitee.com/openeuler/iSulad',
              clone_url: 'https://gitee.com/openeuler/iSulad.git',
              language: 'C',
              stargazers_count: 7800,
              forks_count: 560,
              open_issues_count: 12,
              private: false,
              pushed_at: '2026-06-23T10:30:00Z',
              updated_at: '2026-06-23T11:00:00Z'
            }
          ]
        };
      }
    });

    const repositories = await service.searchGiteeRepositories({ query: '容器', minStars: 5000, perPage: 5 });
    const decodedUrl = decodeURIComponent(requestedUrls[0]).replace(/\+/g, ' ');

    expect(requestedUrls[0]).toContain('https://gitee.com/api/v5/search/repositories');
    expect(decodedUrl).toContain('容器 stars:>=5000');
    expect(repositories).toContainEqual(
      expect.objectContaining({
        fullName: 'openeuler/iSulad',
        owner: 'openeuler',
        stars: 7800,
        htmlUrl: 'https://gitee.com/openeuler/iSulad'
      })
    );
  });

  it('saves a Gitee link locally without credentials or network and persists it', async () => {
    const homeDir = await createTempHome();
    const service = createSkillsService({
      homeDir,
      githubFetch: async () => { throw new Error('Local collection must not access the network'); }
    });
    const result = await service.saveGiteeRepository({ fullName: ' https://gitee.com/proxy-ip/ipdodo.git ' });
    expect(result.success).toBe(true);
    const repositories = await createSkillsService({ homeDir }).listGiteeStars();
    expect(repositories).toHaveLength(1);
    expect(repositories[0]).toMatchObject({
      fullName: 'proxy-ip/ipdodo',
      htmlUrl: 'https://gitee.com/proxy-ip/ipdodo',
      cloneUrl: 'https://gitee.com/proxy-ip/ipdodo.git'
    });
  });

  it('preserves existing Gitee metadata when collecting the same repository locally again', async () => {
    const homeDir = await createTempHome();
    const service = createSkillsService({ homeDir });
    await service.saveGiteeRepository({ fullName: 'proxy-ip/ipdodo' });
    await service.updateGiteeRepoMeta({ fullName: 'proxy-ip/ipdodo', tags: ['工作'], favorite: true, watchBranches: true });
    const before = await service.listGiteeStars();
    await service.saveGiteeRepository({ fullName: 'https://gitee.com/proxy-ip/ipdodo' });
    expect(await service.listGiteeStars()).toEqual(before);
  });

  it.each(['', 'owner', 'https://github.com/owner/repo'])('rejects invalid local Gitee collection: %s', async (fullName) => {
    const homeDir = await createTempHome();
    const service = createSkillsService({ homeDir });
    await expect(service.saveGiteeRepository({ fullName })).rejects.toThrow('owner/repo');
    expect(await service.listGiteeStars()).toEqual([]);
  });

  it('stars a recommended Gitee repository and stores it locally', async () => {
    const homeDir = await createTempHome();
    const requests: Array<{ url: string; method?: string }> = [];
    const service = createSkillsService({
      homeDir,
      githubFetch: async (url, init) => {
        requests.push({ url, method: init?.method });
        return {
          status: 204,
          ok: true,
          json: async () => ({})
        };
      }
    });

    await service.saveGiteeCredentials({ username: 'tester', token: 'gitee_token' });
    const result = await service.starGiteeRepository({
      fullName: 'openeuler/iSulad',
      repository: {
        id: 2026,
        fullName: 'openeuler/iSulad',
        name: 'iSulad',
        owner: 'openeuler',
        description: 'Lightweight container runtime',
        htmlUrl: 'https://gitee.com/openeuler/iSulad',
        cloneUrl: 'https://gitee.com/openeuler/iSulad.git',
        language: 'C',
        topics: ['container'],
        stars: 7800,
        forks: 560,
        openIssues: 12,
        private: false,
        pushedAt: '2026-06-23T10:30:00Z',
        updatedAt: '2026-06-23T11:00:00Z'
      }
    });
    const repositories = await service.listGiteeStars();

    expect(requests).toContainEqual(
      expect.objectContaining({
        url: expect.stringContaining('https://gitee.com/api/v5/user/starred/openeuler/iSulad'),
        method: 'PUT'
      })
    );
    expect(result.message).toContain('已收藏');
    expect(repositories).toContainEqual(
      expect.objectContaining({ fullName: 'openeuler/iSulad', tags: [], favorite: false, hasUpdate: false })
    );
  });

  it('stars a pasted Gitee repository url and stores the normalized repository name', async () => {
    const homeDir = await createTempHome();
    const requests: Array<{ url: string; method?: string }> = [];
    const service = createSkillsService({
      homeDir,
      githubFetch: async (url, init) => {
        requests.push({ url, method: init?.method });
        return {
          status: 204,
          ok: true,
          json: async () => ({})
        };
      }
    });

    await service.saveGiteeCredentials({ username: 'tester', token: 'gitee_token' });
    await service.starGiteeRepository({ fullName: 'https://gitee.com/proxy-ip/ipdodo.git' });
    const repositories = await service.listGiteeStars();

    expect(requests).toContainEqual(
      expect.objectContaining({
        url: expect.stringContaining('https://gitee.com/api/v5/user/starred/proxy-ip/ipdodo'),
        method: 'PUT'
      })
    );
    expect(repositories).toContainEqual(expect.objectContaining({ fullName: 'proxy-ip/ipdodo' }));
  });

  it('syncs Gitee stars while keeping local tags and detecting pushed updates', async () => {
    const homeDir = await createTempHome();
    let pushedAt = '2026-06-20T09:00:00Z';
    const service = createSkillsService({
      homeDir,
      githubFetch: async () => ({
        status: 200,
        ok: true,
        json: async () => [
          {
            id: 9,
            full_name: 'mindspore/mindspore',
            name: 'mindspore',
            namespace: { path: 'mindspore' },
            description: 'AI framework',
            html_url: 'https://gitee.com/mindspore/mindspore',
            clone_url: 'https://gitee.com/mindspore/mindspore.git',
            language: 'C++',
            stargazers_count: 12000,
            forks_count: 3100,
            open_issues_count: 3,
            private: false,
            pushed_at: pushedAt,
            updated_at: pushedAt
          }
        ]
      })
    });

    await service.saveGiteeCredentials({ username: 'tester', token: 'gitee_token' });
    await service.syncGiteeStars({ pages: 1 });
    await service.updateGiteeRepoMeta({ fullName: 'mindspore/mindspore', tags: ['AI，框架'], favorite: true });
    pushedAt = '2026-06-24T09:00:00Z';
    await service.syncGiteeStars({ pages: 1 });

    const [repo] = await service.listGiteeStars();
    const settings = await service.getGiteeSettings();

    expect(repo.tags).toEqual(['AI', '框架']);
    expect(repo.favorite).toBe(true);
    expect(repo.hasUpdate).toBe(true);
    expect(settings).toMatchObject({ repositoryCount: 1, tagCount: 2, updatedCount: 1, tokenConfigured: true });
  });

  it('checks all branches for favorite Gitee repositories that enable branch monitoring', async () => {
    const homeDir = await createTempHome();
    const requestedUrls: string[] = [];
    let branchSha = 'sha-main-1';
    const service = createSkillsService({
      homeDir,
      githubFetch: async (url) => {
        requestedUrls.push(url);
        const payload = url.includes('/repos/mindspore/mindspore/branches')
          ? [
              { name: 'master', commit: { sha: branchSha } },
              { name: 'release-2.3', commit: { sha: 'sha-release-stable' } }
            ]
          : url.includes('/user/starred')
            ? [
                {
                  id: 9,
                  full_name: 'mindspore/mindspore',
                  name: 'mindspore',
                  namespace: { path: 'mindspore' },
                  description: 'AI framework',
                  html_url: 'https://gitee.com/mindspore/mindspore',
                  clone_url: 'https://gitee.com/mindspore/mindspore.git',
                  language: 'C++',
                  stargazers_count: 12000,
                  forks_count: 3100,
                  open_issues_count: 3,
                  private: false,
                  pushed_at: '2026-06-20T09:00:00Z',
                  updated_at: '2026-06-20T09:00:00Z'
                }
              ]
            : [];
        return {
          status: 200,
          ok: true,
          json: async () => payload
        };
      }
    });

    await service.saveGiteeCredentials({ username: 'tester', token: 'gitee_token' });
    await service.syncGiteeStars({ pages: 1 });
    await service.updateGiteeRepoMeta({
      fullName: 'mindspore/mindspore',
      favorite: true,
      watchBranches: true
    });
    await service.syncGiteeStars({ pages: 1 });

    branchSha = 'sha-main-2';
    await service.syncGiteeStars({ pages: 1 });

    const [repo] = await service.listGiteeStars();

    expect(requestedUrls).toEqual(expect.arrayContaining([expect.stringContaining('/repos/mindspore/mindspore/branches')]));
    expect(repo).toMatchObject({
      favorite: true,
      watchBranches: true,
      hasUpdate: true,
      updateBranch: 'master',
      branchUpdateSummary: 'master'
    });
    expect(repo.lastSeenBranches).toEqual({ master: 'sha-main-2', 'release-2.3': 'sha-release-stable' });
  });

  it('syncs Gitee owned repositories when starred repositories are empty', async () => {
    const homeDir = await createTempHome();
    const requestedUrls: string[] = [];
    const service = createSkillsService({
      homeDir,
      githubFetch: async (url) => {
        requestedUrls.push(url);
        const payload = url.includes('/user/repos')
          ? [
              {
                id: 42,
                full_name: 'app_development/ipdodo',
                path: 'ipdodo',
                namespace: { path: 'app_development' },
                description: 'IP service',
                html_url: 'https://gitee.com/app_development/ipdodo',
                clone_url: 'https://gitee.com/app_development/ipdodo.git',
                language: 'JavaScript',
                stargazers_count: 12,
                forks_count: 2,
                open_issues_count: 0,
                private: false,
                pushed_at: '2026-06-24T08:00:00Z',
                updated_at: '2026-06-24T08:00:00Z'
              }
            ]
          : [];
        return {
          status: 200,
          ok: true,
          json: async () => payload
        };
      }
    });

    await service.saveGiteeCredentials({ username: 'tester', token: 'gitee_token' });
    const result = await service.syncGiteeStars({ pages: 1 });
    const repositories = await service.listGiteeStars();

    expect(requestedUrls).toEqual(
      expect.arrayContaining([
        expect.stringContaining('/user/starred'),
        expect.stringContaining('/user/repos')
      ])
    );
    expect(result.message).toContain('我的仓库 1 个');
    expect(repositories).toContainEqual(expect.objectContaining({ fullName: 'app_development/ipdodo' }));
  });

  it('tags all Gitee repositories by namespace prefix', async () => {
    const homeDir = await createTempHome();
    const service = createSkillsService({
      homeDir,
      githubFetch: async (url) => ({
        status: 200,
        ok: true,
        json: async () =>
          url.includes('/user/repos')
            ? [
                {
                  id: 1,
                  full_name: 'proxy-ip/ipdodo',
                  path: 'ipdodo',
                  namespace: { path: 'proxy-ip' },
                  description: 'IP query',
                  html_url: 'https://gitee.com/proxy-ip/ipdodo',
                  clone_url: 'https://gitee.com/proxy-ip/ipdodo.git',
                  private: false,
                  pushed_at: '2026-06-24T08:00:00Z',
                  updated_at: '2026-06-24T08:00:00Z'
                },
                {
                  id: 2,
                  full_name: 'proxy-ip/proxy-pool',
                  path: 'proxy-pool',
                  namespace: { path: 'proxy-ip' },
                  description: 'Proxy pool',
                  html_url: 'https://gitee.com/proxy-ip/proxy-pool',
                  clone_url: 'https://gitee.com/proxy-ip/proxy-pool.git',
                  private: false,
                  pushed_at: '2026-06-24T08:00:00Z',
                  updated_at: '2026-06-24T08:00:00Z'
                },
                {
                  id: 3,
                  full_name: 'other/demo',
                  path: 'demo',
                  namespace: { path: 'other' },
                  description: 'Other repo',
                  html_url: 'https://gitee.com/other/demo',
                  clone_url: 'https://gitee.com/other/demo.git',
                  private: false,
                  pushed_at: '2026-06-24T08:00:00Z',
                  updated_at: '2026-06-24T08:00:00Z'
                }
              ]
            : []
      })
    });

    await service.saveGiteeCredentials({ username: 'tester', token: 'gitee_token' });
    await service.syncGiteeStars({ pages: 1 });
    await service.updateGiteeRepoMeta({ fullName: 'proxy-ip/ipdodo', tags: ['旧标签'] });
    const result = await service.tagGiteeRepositoriesByPrefix({ prefix: 'proxy-ip/', tags: ['ipdodo'] });
    const repositories = await service.listGiteeStars();

    expect(result).toMatchObject({ success: true, matchedCount: 2, updatedCount: 2 });
    expect(repositories.find((repo) => repo.fullName === 'proxy-ip/ipdodo')?.tags).toEqual(['旧标签', 'ipdodo']);
    expect(repositories.find((repo) => repo.fullName === 'proxy-ip/proxy-pool')?.tags).toEqual(['ipdodo']);
    expect(repositories.find((repo) => repo.fullName === 'other/demo')?.tags).toEqual([]);
  });

  it('persists offline mode while keeping local scans available', async () => {
    const homeDir = await createTempHome();
    const skillDir = path.join(homeDir, '.codex', 'skills', 'offline-local-helper');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: offline-local-helper\ndescription: 离线扫描\n---', 'utf8');
    const service = createSkillsService({ homeDir });

    const settings = await service.saveAppSettings({ offlineMode: true });
    const skills = await service.scanSkills();
    const persisted = await service.getAppSettings();

    expect(settings.offlineMode).toBe(true);
    expect(persisted.offlineMode).toBe(true);
    expect(skills).toContainEqual(expect.objectContaining({ name: 'offline-local-helper' }));
  });

  it('blocks cloud and package network actions while offline mode is enabled', async () => {
    const homeDir = await createTempHome();
    let fetchCount = 0;
    const service = createSkillsService({
      homeDir,
      githubFetch: async () => {
        fetchCount += 1;
        return {
          status: 200,
          ok: true,
          json: async () => []
        };
      }
    });

    await service.saveGithubStarCredentials({ username: 'octocat', token: 'ghp_secret_token' });
    await service.saveGiteeCredentials({ username: 'tester', token: 'gitee_token' });
    await service.saveAppSettings({ offlineMode: true });

    await expect(service.searchGithubRepositories({ query: 'mcp' })).rejects.toThrow('离线模式');
    await expect(service.syncGithubStars({ pages: 1 })).rejects.toThrow('离线模式');
    await expect(service.starGithubRepository({ fullName: 'modelcontextprotocol/servers' })).rejects.toThrow('离线模式');
    await expect(service.searchGiteeRepositories({ query: 'AI' })).rejects.toThrow('离线模式');
    await expect(service.syncGiteeStars({ pages: 1 })).rejects.toThrow('离线模式');
    await expect(service.starGiteeRepository({ fullName: 'openeuler/iSulad' })).rejects.toThrow('离线模式');
    await expect(
      service.createModule({ mode: 'github', name: '外部模块', githubUrl: 'https://github.com/example/skills.git' })
    ).rejects.toThrow('离线模式');
    await expect(
      service.createModule({ mode: 'npx', name: 'NPX 模块', packageName: '@example/skills' })
    ).rejects.toThrow('离线模式');
    await expect(
      service.createGithubSkill({ repoUrl: 'https://github.com/example/repo.git', targetDirectoryId: 'claude' })
    ).rejects.toThrow('离线模式');
    expect(fetchCount).toBe(0);
  });

  it('creates a named module from an NPX package that contains nested skills', async () => {
    const homeDir = await createTempHome();
    const packageRoot = path.join(homeDir, 'npx-package');
    const skillDir = path.join(packageRoot, 'skills', 'npx-helper');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      path.join(packageRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'local-npx-skills',
          version: '1.0.0',
          files: ['skills']
        },
        null,
        2
      ),
      'utf8'
    );
    await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: npx-helper\ndescription: NPX 导入\n---', 'utf8');

    const service = createSkillsService({ homeDir });
    const result = await service.createModule({
      name: 'NPX Skills 包',
      mode: 'npx',
      packageName: packageRoot
    });
    const directories = await service.getDirectories();
    const skills = await service.scanSkills();

    expect(result.message).toContain('已新增模块：NPX Skills 包');
    expect(result.message).toContain('发现 1 个 Skills');
    expect(directories).toContainEqual(
      expect.objectContaining({
        label: 'NPX Skills 包',
        product: 'custom',
        enabled: true,
        builtIn: false
      })
    );
    expect(skills).toContainEqual(
      expect.objectContaining({
        name: 'npx-helper',
        description: 'NPX 导入'
      })
    );
  });

  it('honors .skillignore when scanning repository-style modules', async () => {
    const homeDir = await createTempHome();
    const sourceRoot = path.join(homeDir, 'skills-source');
    const readySkill = path.join(sourceRoot, 'ready-helper');
    const ignoredSkill = path.join(sourceRoot, 'draft-helper');
    await mkdir(readySkill, { recursive: true });
    await mkdir(ignoredSkill, { recursive: true });
    await writeFile(path.join(sourceRoot, '.skillignore'), 'draft-helper\n# comment line\n', 'utf8');
    await writeFile(path.join(readySkill, 'SKILL.md'), '---\nname: ready-helper\ndescription: 可复用\n---', 'utf8');
    await writeFile(path.join(ignoredSkill, 'SKILL.md'), '---\nname: draft-helper\ndescription: 草稿\n---', 'utf8');

    const service = createSkillsService({ homeDir });
    await service.saveCustomDirectories([
      {
        id: 'source-module',
        label: '源模块',
        product: 'custom',
        path: sourceRoot,
        enabled: true,
        builtIn: false
      }
    ]);

    const skills = await service.scanSkills();

    expect(skills.map((skill) => skill.name)).toEqual(['ready-helper']);
  });

  it('respects SKILL.md targets before syncing a skill to another module', async () => {
    const homeDir = await createTempHome();
    const sourceSkill = path.join(homeDir, '.codex', 'skills', 'targeted-helper');
    const allowedRoot = path.join(homeDir, 'modules', 'allowed-module');
    const blockedRoot = path.join(homeDir, 'modules', 'blocked-module');
    await mkdir(sourceSkill, { recursive: true });
    await writeFile(
      path.join(sourceSkill, 'SKILL.md'),
      '---\nname: targeted-helper\ndescription: 指定目标\ntargets: allowed-module\n---',
      'utf8'
    );

    const service = createSkillsService({ homeDir });
    await service.saveCustomDirectories([
      {
        id: 'allowed-module',
        label: '允许模块',
        product: 'custom',
        path: allowedRoot,
        enabled: true,
        builtIn: false
      },
      {
        id: 'blocked-module',
        label: '阻止模块',
        product: 'custom',
        path: blockedRoot,
        enabled: true,
        builtIn: false
      }
    ]);

    const [source] = await service.scanSkills();

    await expect(service.syncSkillToDirectory(source.localPath, 'blocked-module', 'copy')).rejects.toThrow(
      'targets 未包含目标模块'
    );
    await expect(service.syncSkillToDirectory(source.localPath, 'allowed-module', 'copy')).resolves.toMatchObject({
      success: true
    });
  });

  it('packages selected skills into a shareable zip export', async () => {
    const homeDir = await createTempHome();
    const firstSkill = path.join(homeDir, '.claude', 'skills', 'wechat-helper');
    const secondSkill = path.join(homeDir, '.codex', 'skills', 'dingtalk-helper');
    await mkdir(firstSkill, { recursive: true });
    await mkdir(secondSkill, { recursive: true });
    await writeFile(path.join(firstSkill, 'SKILL.md'), '---\nname: wechat-helper\ndescription: 微信分享\n---', 'utf8');
    await writeFile(path.join(secondSkill, 'SKILL.md'), '---\nname: dingtalk-helper\ndescription: 钉钉分享\n---', 'utf8');

    const service = createSkillsService({ homeDir });
    const skills = await service.scanSkills();
    const result = await service.packageSkills({
      skillPaths: skills.map((skill) => skill.localPath),
      shareTarget: 'wechat'
    });

    expect(result.message).toContain('已打包');
    expect(result.outputPath).toMatch(/\.zip$/);
    expect(result.outputPath).toContain(path.join('.skills-manager', 'exports'));
    expect((await stat(result.outputPath!)).size).toBeGreaterThan(0);
    await rm(result.outputPath!, { force: true });
  });

  it('syncs a git repository module with one click', async () => {
    const homeDir = await createTempHome();
    const remoteRepo = path.join(homeDir, 'remote.git');
    const seedRepo = path.join(homeDir, 'seed');
    const cloneRepo = path.join(homeDir, 'clone');
    await git(['init', '--bare', remoteRepo]);
    await mkdir(seedRepo, { recursive: true });
    await git(['init'], seedRepo);
    await git(['config', 'user.email', 'tester@example.com'], seedRepo);
    await git(['config', 'user.name', 'Tester'], seedRepo);
    await mkdir(path.join(seedRepo, 'skills', 'first-helper'), { recursive: true });
    await writeFile(path.join(seedRepo, 'skills', 'first-helper', 'SKILL.md'), '---\nname: first-helper\ndescription: 首次\n---', 'utf8');
    await git(['add', '.'], seedRepo);
    await git(['commit', '-m', 'first skill'], seedRepo);
    await git(['branch', '-M', 'main'], seedRepo);
    await git(['remote', 'add', 'origin', remoteRepo], seedRepo);
    await git(['push', '-u', 'origin', 'main'], seedRepo);
    await git(['--git-dir', remoteRepo, 'symbolic-ref', 'HEAD', 'refs/heads/main']);
    await git(['clone', remoteRepo, cloneRepo]);

    const service = createSkillsService({ homeDir });
    await service.saveCustomDirectories([
      {
        id: 'repo-module',
        label: '仓库模块',
        product: 'custom',
        path: cloneRepo,
        enabled: true,
        builtIn: false
      }
    ]);

    await mkdir(path.join(seedRepo, 'skills', 'second-helper'), { recursive: true });
    await writeFile(path.join(seedRepo, 'skills', 'second-helper', 'SKILL.md'), '---\nname: second-helper\ndescription: 同步新增\n---', 'utf8');
    await git(['add', '.'], seedRepo);
    await git(['commit', '-m', 'second skill'], seedRepo);
    await git(['push'], seedRepo);

    const result = await service.syncRepositoryModule('repo-module');
    const skills = await service.scanSkills();

    expect(result.message).toContain('仓库同步完成');
    expect(skills.map((skill) => skill.name).sort()).toEqual(['first-helper', 'second-helper']);
  }, GIT_TEST_TIMEOUT);

  it('injects a managed memory path for skill optimization without duplicating the block', async () => {
    const homeDir = await createTempHome();
    const skillDir = path.join(homeDir, '.claude', 'skills', 'evolving-helper');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      path.join(skillDir, 'SKILL.md'),
      ['---', 'name: evolving-helper', 'description: 可持续优化', '---', '', '# Evolving Helper'].join('\n'),
      'utf8'
    );

    const service = createSkillsService({ homeDir });
    const [skill] = await service.scanSkills();
    const result = await service.optimizeSkill(skill.localPath, skill.id);
    await service.optimizeSkill(skill.localPath, skill.id);

    const content = await readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
    const readme = await readFile(path.join(result.outputPath!, 'README.md'), 'utf8');

    expect(result.message).toContain('已注入记忆路径');
    expect(result.outputPath).toBe(path.join(skillDir, '.skills-memory'));
    expect(content.match(/skills-manager:memory:start/g)).toHaveLength(1);
    expect(content).toContain(`记忆路径：${path.join(skillDir, '.skills-memory')}`);
    expect(content).toContain('执行本 Skill 前先读取该目录');
    expect(readme).toContain('经验沉淀');
    expect(readme).toContain('毕业');
  });

  it('toggles skill optimization injection independently from the skill enabled state', async () => {
    const homeDir = await createTempHome();
    const skillDir = path.join(homeDir, '.claude', 'skills', 'optimizable-helper');
    const originalContent = ['---', 'name: optimizable-helper', 'description: 优化开关', '---', '', '# Optimizable Helper'].join('\n');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), originalContent, 'utf8');

    const service = createSkillsService({ homeDir });
    const [skill] = await service.scanSkills();
    await service.setSkillOptimization(skill.localPath, skill.id, true);
    const [optimizedSkill] = await service.scanSkills();

    expect(optimizedSkill.memoryOptimizationEnabled).toBe(true);
    expect(optimizedSkill.disabled).toBe(false);

    await service.setSkillEnabled(skill.localPath, false);
    const [toolDisabledSkill] = await service.scanSkills();
    expect(toolDisabledSkill.memoryOptimizationEnabled).toBe(true);
    expect(toolDisabledSkill.disabled).toBe(true);

    await service.setSkillEnabled(skill.localPath, true);
    const disabled = await service.setSkillOptimization(skill.localPath, skill.id, false);
    const content = await readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
    const [plainSkill] = await service.scanSkills();

    expect(disabled.message).toContain('优化记忆已停用');
    expect(content).not.toContain('skills-manager:memory:start');
    expect(content).not.toContain('skills-manager:evolution:start');
    expect(content.trimEnd()).toBe(originalContent);
    expect(plainSkill.memoryOptimizationEnabled).toBe(false);
    expect(plainSkill.disabled).toBe(false);
  });

  it('lists operation logs for skill memory optimization with details', async () => {
    const homeDir = await createTempHome();
    const skillDir = path.join(homeDir, '.claude', 'skills', 'logged-helper');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      path.join(skillDir, 'SKILL.md'),
      ['---', 'name: logged-helper', 'description: 日志测试', '---', '', '# Logged Helper'].join('\n'),
      'utf8'
    );

    const service = createSkillsService({ homeDir });
    const [skill] = await service.scanSkills();
    await service.optimizeSkill(skill.localPath, skill.id);

    const [log] = await service.getOperationLogs();

    expect(log).toMatchObject({
      skillId: skill.id,
      skillName: 'logged-helper',
      skillPath: skill.localPath,
      eventType: 'optimize',
      action: '优化记忆',
      source: 'manager'
    });
    expect(log.detail).toContain('注入记忆路径');
    expect(log.timestamp).toBeTypeOf('number');
  });

  it('wraps a GitHub repository as a local Skill with source metadata', async () => {
    const homeDir = await createTempHome();
    const seedRepo = path.join(homeDir, 'seed-repo');
    const targetRoot = path.join(homeDir, '.claude', 'skills');
    await mkdir(targetRoot, { recursive: true });
    await createGitRepository(seedRepo, {
      'README.md': '# Repo Skill\n\n用于从仓库生成 Skill。',
      'src/index.ts': 'export const answer = 42;\n'
    });

    const service = createSkillsService({ homeDir });
    const result = await service.createGithubSkill({
      repoUrl: seedRepo,
      targetDirectoryId: 'claude',
      name: 'repo-skill'
    });
    const skillPath = path.join(targetRoot, 'repo-skill');
    const content = await readFile(path.join(skillPath, 'SKILL.md'), 'utf8');
    const reference = await readFile(path.join(skillPath, 'references', 'README.md'), 'utf8');
    const headHash = (await gitOutput(['rev-parse', 'HEAD'], seedRepo)).trim();

    expect(result.message).toContain('已从 GitHub 仓库生成 Skill');
    expect(result.outputPath).toBe(skillPath);
    expect(content).toContain('source_type: github-to-skills');
    expect(content).toContain(`github_url: ${seedRepo}`);
    expect(content).toContain(`github_hash: ${headHash}`);
    expect(reference).toContain('Repo Skill');
  }, GIT_TEST_TIMEOUT);

  it('wraps a GitHub repository into a repository-named local module path', async () => {
    const homeDir = await createTempHome();
    const seedRepo = path.join(homeDir, 'seed-repo');
    const localRoot = path.join(homeDir, 'cloud-repos');
    await createGitRepository(seedRepo, {
      'README.md': '# Repo Module\n\n本地模块化包装。',
      'src/index.ts': 'export const answer = 88;\n'
    });

    const service = createSkillsService({ homeDir });
    const result = await service.createGithubSkill({
      repoUrl: seedRepo,
      localRepositoryRoot: localRoot,
      name: '仓库模块助手'
    });
    const modulePath = path.join(localRoot, 'seed-repo');
    const skillPath = path.join(modulePath, 'skills', '仓库模块助手');
    const directories = await service.getDirectories();
    const skills = await service.scanSkills();
    const exclude = await readFile(path.join(modulePath, '.git', 'info', 'exclude'), 'utf8');

    expect(result.message).toContain('已从 GitHub 仓库生成模块');
    expect(result.message).toContain(modulePath);
    expect(result.outputPath).toBe(skillPath);
    expect(directories).toContainEqual(
      expect.objectContaining({
        label: '仓库模块助手',
        path: modulePath,
        enabled: true,
        builtIn: false
      })
    );
    expect(skills).toContainEqual(
      expect.objectContaining({
        name: '仓库模块助手',
        localPath: skillPath,
        directoryId: expect.stringMatching(/^custom_/)
      })
    );
    expect(exclude).toContain('skills/仓库模块助手/');
  }, GIT_TEST_TIMEOUT);

  it('can sync a GitHub-to-Skill module when the cloud git remote is preserved', async () => {
    const homeDir = await createTempHome();
    const remoteRepo = path.join(homeDir, 'remote.git');
    const seedRepo = path.join(homeDir, 'seed-repo');
    const localRoot = path.join(homeDir, 'cloud-repos');
    await git(['init', '--bare', remoteRepo]);
    await createGitRepository(seedRepo, {
      'README.md': '# Repo Module\n\n第一版。',
      'src/index.ts': 'export const answer = 1;\n'
    });
    await git(['branch', '-M', 'main'], seedRepo);
    await git(['remote', 'add', 'origin', remoteRepo], seedRepo);
    await git(['push', '-u', 'origin', 'main'], seedRepo);
    await git(['--git-dir', remoteRepo, 'symbolic-ref', 'HEAD', 'refs/heads/main']);

    const service = createSkillsService({ homeDir });
    const createResult = await service.createGithubSkill({
      repoUrl: remoteRepo,
      localRepositoryRoot: localRoot,
      name: '保留 Git 模块',
      preserveGitRemote: true
    });
    const directories = await service.getDirectories();
    const moduleDirectory = directories.find((directory) => directory.path === path.join(localRoot, 'remote'));
    expect(moduleDirectory).toBeTruthy();

    await writeFile(path.join(seedRepo, 'README.md'), '# Repo Module\n\n第二版。', 'utf8');
    await git(['add', '.'], seedRepo);
    await git(['commit', '-m', 'update readme'], seedRepo);
    await git(['push'], seedRepo);

    const result = await service.syncRepositoryModule(moduleDirectory!.id);
    const skillContent = await readFile(path.join(createResult.outputPath!, 'SKILL.md'), 'utf8');
    const reference = await readFile(path.join(createResult.outputPath!, 'references', 'README.md'), 'utf8');
    const latestHash = (await gitOutput(['rev-parse', 'HEAD'], seedRepo)).trim();

    expect(result.message).toContain('仓库同步完成');
    expect(skillContent).toContain(`github_hash: ${latestHash}`);
    expect(reference).toContain('第二版');
  }, GIT_TEST_TIMEOUT);

  it('can create a GitHub-to-Skill module without preserving the cloud git remote', async () => {
    const homeDir = await createTempHome();
    const seedRepo = path.join(homeDir, 'seed-repo');
    const localRoot = path.join(homeDir, 'cloud-repos');
    await createGitRepository(seedRepo, {
      'README.md': '# Repo Module\n\n不保留 Git。'
    });

    const service = createSkillsService({ homeDir });
    await service.createGithubSkill({
      repoUrl: seedRepo,
      localRepositoryRoot: localRoot,
      name: '不保留 Git 模块',
      preserveGitRemote: false
    });

    expect(await pathExists(path.join(localRoot, 'seed-repo', '.git'))).toBe(false);
  }, GIT_TEST_TIMEOUT);

  it('checks and updates repository-backed Skills using github_hash metadata', async () => {
    const homeDir = await createTempHome();
    const seedRepo = path.join(homeDir, 'seed-repo');
    await mkdir(path.join(homeDir, '.claude', 'skills'), { recursive: true });
    await createGitRepository(seedRepo, {
      'README.md': '# Repo Skill\n\n第一版。',
      'src/index.ts': 'export const answer = 1;\n'
    });

    const service = createSkillsService({ homeDir });
    const createResult = await service.createGithubSkill({
      repoUrl: seedRepo,
      targetDirectoryId: 'claude',
      name: 'repo-skill'
    });
    await writeFile(path.join(seedRepo, 'README.md'), '# Repo Skill\n\n第二版。', 'utf8');
    await git(['add', '.'], seedRepo);
    await git(['commit', '-m', 'update readme'], seedRepo);
    const nextHash = (await gitOutput(['rev-parse', 'HEAD'], seedRepo)).trim();

    const [status] = await service.checkGithubSkillUpdates();
    expect(status).toMatchObject({
      name: 'repo-skill',
      status: 'outdated',
      latestHash: nextHash,
      message: 'New commits available'
    });

    const updateResult = await service.updateGithubSkill(createResult.outputPath!, status.skillId);
    const content = await readFile(path.join(createResult.outputPath!, 'SKILL.md'), 'utf8');
    const reference = await readFile(path.join(createResult.outputPath!, 'references', 'README.md'), 'utf8');
    const backupPath = updateResult.backupPath ?? '';

    expect(updateResult.message).toContain('仓库技能已同步');
    expect(updateResult.skillName).toBe('repo-skill');
    expect(updateResult.before.currentHash).toBe(status.currentHash);
    expect(updateResult.before.status).toBe('outdated');
    expect(updateResult.after.currentHash).toBe(nextHash);
    expect(updateResult.after.status).toBe('current');
    expect(updateResult.updateContent).toBe('GitHub 哈希值更新至最新提交，并刷新 references/README.md');
    expect(backupPath).toMatch(/SKILL\.md\.bak\.\d{8}_\d{6}$/);
    expect(await readFile(backupPath, 'utf8')).toContain(`github_hash: ${status.currentHash}`);
    expect(content).toContain(`github_hash: ${nextHash}`);
    expect(reference).toContain('第二版');
  }, GIT_TEST_TIMEOUT);

  it('records skill evolution into a skill-local memory store and stitches a managed block', async () => {
    const homeDir = await createTempHome();
    const skillDir = path.join(homeDir, '.codex', 'skills', 'evolution-helper');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      path.join(skillDir, 'SKILL.md'),
      ['---', 'name: evolution-helper', 'description: 经验沉淀', '---', '', '# Evolution Helper'].join('\n'),
      'utf8'
    );

    const service = createSkillsService({ homeDir });
    const [skill] = await service.scanSkills();
    const first = await service.recordSkillEvolution(
      skill.localPath,
      skill.id,
      '用户偏好中文回复，并优先沉淀可复用失败教训。'
    );
    await service.recordSkillEvolution(skill.localPath, skill.id, '用户偏好中文回复，并优先沉淀可复用失败教训。');

    const evolution = JSON.parse(await readFile(path.join(skillDir, '.skills-memory', 'evolution.json'), 'utf8')) as {
      entries: Array<{ note: string }>;
    };
    const content = await readFile(path.join(skillDir, 'SKILL.md'), 'utf8');

    expect(first.outputPath).toBe(path.join(skillDir, '.skills-memory', 'evolution.json'));
    expect(evolution.entries).toHaveLength(1);
    expect(evolution.entries[0].note).toContain('中文回复');
    expect(content.match(/skills-manager:evolution:start/g)).toHaveLength(1);
    expect(content).toContain('User-Learned Best Practices & Constraints');
    expect(content).toContain('用户偏好中文回复');
  });

  it('removes a custom module and deletes scanned skills while preserving non-skill files', async () => {
    const homeDir = await createTempHome();
    const moduleRoot = path.join(homeDir, 'modules', 'temporary-module');
    const skillDir = path.join(moduleRoot, 'temporary-helper');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: temporary-helper\ndescription: 临时模块\n---', 'utf8');
    await writeFile(path.join(moduleRoot, 'README.txt'), '非 Skill 文件', 'utf8');

    const service = createSkillsService({ homeDir });
    await service.saveCustomDirectories([
      {
        id: 'temporary-module',
        label: '临时模块',
        product: 'custom',
        path: moduleRoot,
        enabled: true,
        builtIn: false
      }
    ]);

    expect(await pathExists(moduleRoot)).toBe(true);
    expect(await service.scanSkills()).toContainEqual(expect.objectContaining({ name: 'temporary-helper' }));

    const result = await service.removeModule('temporary-module');
    const directories = await service.getDirectories();
    const skills = await service.scanSkills();

    expect(result.message).toContain('已移除模块：临时模块');
    expect(result.message).toContain('删除 1 个 Skills');
    expect(await pathExists(moduleRoot)).toBe(true);
    expect(await pathExists(skillDir)).toBe(false);
    expect(directories).not.toContainEqual(expect.objectContaining({ id: 'temporary-module' }));
    expect(skills).not.toContainEqual(expect.objectContaining({ name: 'temporary-helper' }));
  });

  it('refuses to remove built-in modules', async () => {
    const homeDir = await createTempHome();
    const service = createSkillsService({ homeDir });

    await expect(service.removeModule('claude')).rejects.toThrow('内置模块不能移除');
  });

  it('scans nested skills under custom repository directories', async () => {
    const homeDir = await createTempHome();
    const customRoot = path.join(homeDir, 'skills-source');
    const nestedSkill = path.join(customRoot, 'skills', 'nested-helper');
    await mkdir(nestedSkill, { recursive: true });
    await writeFile(path.join(nestedSkill, 'SKILL.md'), '---\nname: nested-helper\ndescription: 嵌套目录\n---', 'utf8');

    const service = createSkillsService({ homeDir });
    await service.saveCustomDirectories([
      {
        id: 'custom-repo',
        label: '本地仓库',
        product: 'custom',
        path: customRoot,
        enabled: true,
        builtIn: false
      }
    ]);

    const skills = await service.scanSkills();

    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      name: 'nested-helper',
      directoryId: 'custom-repo',
      product: 'custom'
    });
  });
});

async function pathExists(targetPath: string) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function git(args: string[], cwd?: string) {
  await execFileAsync('git', args, cwd ? { cwd } : undefined);
}

async function gitOutput(args: string[], cwd?: string) {
  const result = await execFileAsync('git', args, cwd ? { cwd } : undefined);
  return String(result.stdout);
}

async function createGitRepository(repoPath: string, files: Record<string, string>) {
  await mkdir(repoPath, { recursive: true });
  await git(['init'], repoPath);
  await git(['config', 'user.email', 'tester@example.com'], repoPath);
  await git(['config', 'user.name', 'Tester'], repoPath);
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(repoPath, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf8');
  }
  await git(['add', '.'], repoPath);
  await git(['commit', '-m', 'initial skill source'], repoPath);
  await git(['branch', '-M', 'main'], repoPath);
}
