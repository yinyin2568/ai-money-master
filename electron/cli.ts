#!/usr/bin/env node
import { createSkillsService } from './services/skillsService.js';
import os from 'node:os';
import { withStorageLock } from './services/storageService.js';
import { createGithubSkillStatusReport } from '../src/shared/githubSkillStatusReport.js';
import { createSecurityAiPayload } from '../src/shared/securityAiPayload.js';
import type { CreateModuleInput, GiteeStarSyncInput, GithubStarSyncInput, ShareTarget, SyncMode } from '../src/shared/types.js';

let service: ReturnType<typeof createSkillsService>;

async function main() {
  const [command = 'help', subcommand, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (command === 'help' || command === '--help' || command === '-h') {
    printText(helpText());
    return;
  }

  if (command === 'scan') {
    printJson(await service.scanSkills());
    return;
  }

  if (command === 'directories') {
    printJson(await service.getDirectories());
    return;
  }

  if (command === 'settings') {
    await handleSettings(subcommand, args);
    return;
  }

  if (command === 'module') {
    await handleModule(subcommand, args);
    return;
  }

  if (command === 'skill') {
    await handleSkill(subcommand, args);
    return;
  }

  if (command === 'security') {
    await handleSecurity(subcommand, args);
    return;
  }

  if (command === 'github-skill') {
    await handleGithubSkill(subcommand, args);
    return;
  }

  if (command === 'github-star') {
    await handleGithubStar(subcommand, args);
    return;
  }

  if (command === 'market') {
    await handleMarket(subcommand, args);
    return;
  }

  if (command === 'gitee') {
    await handleGitee(subcommand, args);
    return;
  }

  throw new Error(`未知命令：${command}`);
}

async function handleSettings(subcommand: string | undefined, args: ParsedArgs) {
  if (subcommand === 'get' || subcommand === undefined) {
    printJson(await service.getAppSettings());
    return;
  }

  if (subcommand === 'offline') {
    printJson(await service.saveAppSettings({ offlineMode: readBoolean(args.enabled ?? args.value, true) }));
    return;
  }

  throw new Error(`未知 settings 子命令：${subcommand ?? ''}`);
}

async function handleModule(subcommand: string | undefined, args: ParsedArgs) {
  if (subcommand === 'create') {
    const mode = oneOf(getRequired(args, 'mode'), ['local', 'github', 'default', 'npx'] as const);
    const name = getRequired(args, 'name');
    const tags = splitList(args.tags);
    let input: CreateModuleInput;
    if (mode === 'local') input = { mode, name, tags, localPath: getRequired(args, 'path') };
    else if (mode === 'github') input = { mode, name, tags, githubUrl: getRequired(args, 'repo') };
    else if (mode === 'default') input = { mode, name, tags, defaultPath: getRequired(args, 'path') };
    else input = { mode, name, tags, packageName: getRequired(args, 'package'), versionRange: args.version, registry: args.registry };
    printJson(await service.createModule(input));
    return;
  }

  if (subcommand === 'remove') {
    printJson(await service.removeModule(getRequired(args, 'id')));
    return;
  }

  if (subcommand === 'sync') {
    printJson(await service.syncRepositoryModule(getRequired(args, 'id')));
    return;
  }

  if (subcommand === 'defaults') {
    printJson(await service.getDefaultModuleCandidates());
    return;
  }

  throw new Error(`未知 module 子命令：${subcommand ?? ''}`);
}

async function handleSkill(subcommand: string | undefined, args: ParsedArgs) {
  if (subcommand === 'read') {
    printJson({ content: await service.readSkill(getRequired(args, 'path')) });
    return;
  }

  if (subcommand === 'delete') {
    printJson(await service.uninstallSkill(getRequired(args, 'path')));
    return;
  }

  if (subcommand === 'enable') {
    const skill = await findSkill(args);
    printJson(await service.setSkillEnabled(skill.localPath, true));
    return;
  }

  if (subcommand === 'disable') {
    const skill = await findSkill(args);
    printJson(await service.setSkillEnabled(skill.localPath, false));
    return;
  }

  if (subcommand === 'sync-to') {
    const mode = oneOf(args.mode ?? 'symlink', ['symlink', 'copy'] as const) as SyncMode;
    printJson(await service.syncSkillToDirectory(getRequired(args, 'path'), getRequired(args, 'directory'), mode));
    return;
  }

  if (subcommand === 'package') {
    const shareTarget = oneOf(args.share ?? 'file', ['file', 'wechat', 'dingtalk'] as const) as ShareTarget;
    printJson(await service.packageSkills({ skillPaths: splitList(getRequired(args, 'paths')), shareTarget }));
    return;
  }

  if (subcommand === 'call-tracking-enable') {
    const skill = await findSkill(args);
    printJson(await service.setSkillCallTracking(skill.localPath, skill.id, true));
    return;
  }

  if (subcommand === 'call-tracking-disable') {
    const skill = await findSkill(args);
    printJson(await service.setSkillCallTracking(skill.localPath, skill.id, false));
    return;
  }

  if (subcommand === 'record-call') {
    const skill = await findSkill(args);
    const source = oneOf(args.source ?? 'codex', ['manual', 'manager', 'claude', 'codex', 'custom'] as const);
    printJson(await service.recordSkillCall(skill.localPath, source));
    return;
  }

  if (subcommand === 'optimize' || subcommand === 'optimize-enable') {
    const skill = await findSkill(args);
    printJson(await service.setSkillOptimization(skill.localPath, skill.id, true));
    return;
  }

  if (subcommand === 'optimize-disable') {
    const skill = await findSkill(args);
    printJson(await service.setSkillOptimization(skill.localPath, skill.id, false));
    return;
  }

  if (subcommand === 'evolve') {
    const skill = await findSkill(args);
    printJson(await service.recordSkillEvolution(skill.localPath, skill.id, getRequired(args, 'note')));
    return;
  }

  if (subcommand === 'tag') {
    const skill = await findSkill(args);
    printJson(await service.updateSkillUserMeta(skill.id, { tags: splitList(getRequired(args, 'tags')) }));
    return;
  }

  throw new Error(`未知 skill 子命令：${subcommand ?? ''}`);
}

async function handleSecurity(subcommand: string | undefined, args: ParsedArgs) {
  if (subcommand === 'scan-all') {
    const reports = await service.scanAllSecurity();
    if (wantsAiSecurityPayload(args)) {
      const skills = await service.scanSkills();
      const skillsById = new Map(skills.map((skill) => [skill.id, skill]));
      printJson(
        reports.map((report) => {
          const skill = skillsById.get(report.skillId);
          return skill ? createSecurityAiPayload(skill, report) : report;
        })
      );
      return;
    }
    printJson(reports);
    return;
  }

  if (subcommand === 'scan') {
    const skill = await findSkill(args);
    const report = await service.scanSkillSecurity(skill.localPath, skill.id);
    printJson(wantsAiSecurityPayload(args) ? createSecurityAiPayload(skill, report) : report);
    return;
  }

  throw new Error(`未知 security 子命令：${subcommand ?? ''}`);
}

function wantsAiSecurityPayload(args: ParsedArgs) {
  return readBoolean(args.ai ?? args['for-ai'], false);
}

async function handleGithubSkill(subcommand: string | undefined, args: ParsedArgs) {
  if (subcommand === 'create') {
    printJson(
      await service.createGithubSkill({
        repoUrl: getRequired(args, 'repo'),
        targetDirectoryId: args.directory,
        localRepositoryRoot: args.root,
        name: args.name,
        preserveGitRemote: readBoolean(args['preserve-git'], true)
      })
    );
    return;
  }

  if (subcommand === 'check') {
    const statuses = await service.checkGithubSkillUpdates();
    if (readBoolean(args.report, false)) {
      const skills = await service.scanSkills();
      printJson(createGithubSkillStatusReport(skills.length, statuses));
      return;
    }
    printJson(statuses);
    return;
  }

  if (subcommand === 'update') {
    const skill = await findSkill(args);
    printJson(await service.updateGithubSkill(skill.localPath, skill.id));
    return;
  }

  throw new Error(`未知 github-skill 子命令：${subcommand ?? ''}`);
}

async function handleGithubStar(subcommand: string | undefined, args: ParsedArgs) {
  if (subcommand === 'settings') {
    printJson(await service.getGithubStarSettings());
    return;
  }

  if (subcommand === 'save') {
    printJson(await service.saveGithubStarCredentials({ username: args.username, token: getRequired(args, 'token') }));
    return;
  }

  if (subcommand === 'sync') {
    const input: GithubStarSyncInput = {
      pages: args.pages ? Number(args.pages) : undefined,
      perPage: args['per-page'] ? Number(args['per-page']) : undefined,
      sort: oneOf(args.sort ?? 'updated', ['created', 'updated'] as const)
    };
    printJson(await service.syncGithubStars(input));
    return;
  }

  if (subcommand === 'list') {
    printJson(await service.listGithubStars());
    return;
  }

  if (subcommand === 'tag') {
    printJson(await service.updateGithubStarMeta({ fullName: getRequired(args, 'repo'), tags: splitList(getRequired(args, 'tags')) }));
    return;
  }

  if (subcommand === 'favorite') {
    printJson(await service.updateGithubStarMeta({ fullName: getRequired(args, 'repo'), favorite: readBoolean(args.value, true) }));
    return;
  }

  if (subcommand === 'search') {
    printJson(
      await service.searchGithubRepositories({
        query: args.query,
        minStars: args['min-stars'] ? Number(args['min-stars']) : undefined,
        perPage: args['per-page'] ? Number(args['per-page']) : undefined,
        page: args.page ? Number(args.page) : undefined,
        sort: oneOf(args.sort ?? 'stars', ['stars', 'updated'] as const)
      })
    );
    return;
  }

  if (subcommand === 'add') {
    printJson(await service.starGithubRepository({ fullName: getRequired(args, 'repo') }));
    return;
  }

  throw new Error(`未知 github-star 子命令：${subcommand ?? ''}`);
}

async function handleGitee(subcommand: string | undefined, args: ParsedArgs) {
  if (subcommand === 'settings') {
    printJson(await service.getGiteeSettings());
    return;
  }

  if (subcommand === 'save') {
    printJson(await service.saveGiteeCredentials({ username: args.username, token: getRequired(args, 'token') }));
    return;
  }

  if (subcommand === 'sync') {
    const input: GiteeStarSyncInput = {
      pages: args.pages ? Number(args.pages) : undefined,
      perPage: args['per-page'] ? Number(args['per-page']) : undefined,
      branchPages: args['branch-pages'] ? Number(args['branch-pages']) : undefined,
      branchPerPage: args['branch-per-page'] ? Number(args['branch-per-page']) : undefined
    };
    printJson(await service.syncGiteeStars(input));
    return;
  }

  if (subcommand === 'list') {
    printJson(await service.listGiteeStars());
    return;
  }

  if (subcommand === 'tag') {
    const tags = splitList(getRequired(args, 'tags'));
    if (args.prefix || args.owner) {
      printJson(await service.tagGiteeRepositoriesByPrefix({ prefix: args.prefix, owner: args.owner, tags }));
      return;
    }
    printJson(await service.updateGiteeRepoMeta({ fullName: getRequired(args, 'repo'), tags }));
    return;
  }

  if (subcommand === 'favorite') {
    printJson(await service.updateGiteeRepoMeta({ fullName: getRequired(args, 'repo'), favorite: readBoolean(args.value, true) }));
    return;
  }

  if (subcommand === 'watch-branches') {
    const enabled = readBoolean(args.value, true);
    printJson(
      await service.updateGiteeRepoMeta({
        fullName: getRequired(args, 'repo'),
        favorite: enabled ? true : undefined,
        watchBranches: enabled
      })
    );
    return;
  }

  if (subcommand === 'search') {
    printJson(
      await service.searchGiteeRepositories({
        query: args.query,
        minStars: args['min-stars'] ? Number(args['min-stars']) : undefined,
        perPage: args['per-page'] ? Number(args['per-page']) : undefined,
        page: args.page ? Number(args.page) : undefined
      })
    );
    return;
  }

  if (subcommand === 'add') {
    printJson(await service.starGiteeRepository({ fullName: getRequiredOne(args, ['repo', 'url']) }));
    return;
  }

  throw new Error(`未知 gitee 子命令：${subcommand ?? ''}`);
}

async function handleMarket(subcommand: string | undefined, args: ParsedArgs) {
  if (subcommand === 'list' || subcommand === undefined) {
    printJson(await service.listMarketplaceSkills());
    return;
  }

  if (subcommand === 'install') {
    if (args.url) {
      printJson(await service.installMarketplaceSkill({ repoUrl: args.url, targetDirectoryId: args.directory }));
      return;
    }
    if (args.path) {
      printJson(await service.installMarketplaceSkill({ localPath: args.path, targetDirectoryId: args.directory }));
      return;
    }
    printJson(await service.installMarketplaceSkill({ id: getRequired(args, 'id'), targetDirectoryId: args.directory }));
    return;
  }

  if (subcommand === 'add') {
    printJson(
      await service.addMarketplaceSkill({
        repoUrl: getRequired(args, 'url'),
        name: args.name,
        description: args.description,
        author: args.author,
        tags: splitList(args.tags)
      })
    );
    return;
  }

  if (subcommand === 'remove') {
    printJson(await service.removeMarketplaceSkill(getRequired(args, 'id')));
    return;
  }

  if (subcommand === 'share') {
    printJson(await service.shareMarketplaceSkill(getRequired(args, 'id')));
    return;
  }

  throw new Error(`未知 market 子命令：${subcommand ?? ''}`);
}

async function findSkill(args: ParsedArgs) {
  const skills = await service.scanSkills();
  const pathValue = args.path;
  const nameValue = args.name;
  const idValue = args.id;
  const skill = skills.find((item) => {
    if (idValue && item.id === idValue) return true;
    if (nameValue && item.name === nameValue) return true;
    if (pathValue && item.localPath === pathValue) return true;
    return false;
  });
  if (!skill) throw new Error('未找到 Skill，请提供 --id、--name 或 --path');
  return skill;
}

type ParsedArgs = Record<string, string | undefined>;

function parseArgs(values: string[]): ParsedArgs {
  const parsed: ParsedArgs = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) continue;
    const [rawKey, inlineValue] = value.slice(2).split(/=(.*)/s);
    const nextValue = inlineValue ?? (values[index + 1]?.startsWith('--') ? 'true' : values[index + 1]);
    parsed[rawKey] = nextValue ?? 'true';
    if (inlineValue === undefined && values[index + 1] && !values[index + 1].startsWith('--')) index += 1;
  }
  return parsed;
}

function getRequired(args: ParsedArgs, key: string) {
  const value = args[key]?.trim();
  if (!value) throw new Error(`缺少参数 --${key}`);
  return value;
}

function getRequiredOne(args: ParsedArgs, keys: string[]) {
  for (const key of keys) {
    const value = args[key]?.trim();
    if (value) return value;
  }
  throw new Error(`缺少参数 ${keys.map((key) => `--${key}`).join(' 或 ')}`);
}

function splitList(value?: string) {
  return Array.from(new Set((value ?? '').split(/[，,、;\r\n]+/).map((item) => item.trim()).filter(Boolean)));
}

function readBoolean(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) return defaultValue;
  return !['false', '0', 'no', 'off', '否'].includes(value.trim().toLowerCase());
}

function oneOf<T extends readonly string[]>(value: string, options: T): T[number] {
  if ((options as readonly string[]).includes(value)) return value as T[number];
  throw new Error(`参数值不支持：${value}，可选：${options.join(', ')}`);
}

function printJson(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printText(value: string) {
  process.stdout.write(value);
}

function helpText() {
  return `ai省钱大师 CLI（兼容 skills-manager 命令）

用法：
  skills-manager scan
  skills-manager directories
  skills-manager settings get
  skills-manager settings offline --enabled true
  skills-manager module defaults
  skills-manager module create --mode local --name 名称 --path D:\\skills --tags 团队,常用
  skills-manager module create --mode github --name 名称 --repo https://github.com/user/repo
  skills-manager module create --mode npx --name 名称 --package @scope/pkg --version latest
  skills-manager module sync --id custom_xxx
  skills-manager module remove --id custom_xxx

  skills-manager skill read --path D:\\skills\\demo
  skills-manager skill enable --name demo
  skills-manager skill disable --name demo
  skills-manager skill sync-to --path D:\\skills\\demo --directory claude --mode symlink
  skills-manager skill package --paths D:\\a,D:\\b --share wechat
  skills-manager skill call-tracking-enable --name demo
  skills-manager skill record-call --name demo --source codex
  skills-manager skill call-tracking-disable --name demo
  skills-manager skill optimize-enable --name demo
  skills-manager skill optimize-disable --name demo
  skills-manager skill evolve --name demo --note 经验内容
  skills-manager skill tag --name demo --tags 常用,查询

  skills-manager security scan-all
  skills-manager security scan --name demo
  skills-manager security scan --name demo --ai
  skills-manager security scan-all --ai

  skills-manager github-skill create --repo https://github.com/user/repo --root D:\\repos --name 模块名 --preserve-git true
  skills-manager github-skill check
  skills-manager github-skill check --report
  skills-manager github-skill update --name demo

  skills-manager github-star save --username 用户名 --token ghp_xxx
  skills-manager github-star sync --pages 3
  skills-manager github-star list
  skills-manager github-star search --query "mcp skills" --min-stars 5000
  skills-manager github-star add --repo owner/name
  skills-manager github-star tag --repo owner/name --tags AI,工具
  skills-manager github-star favorite --repo owner/name --value true

  skills-manager market list
  skills-manager market add --url https://gitee.com/owner/repo --name 项目名 --tags Gitee,收藏
  skills-manager market remove --id custom_xxx
  skills-manager market install --id khazix-skills --directory codex
  skills-manager market install --url https://github.com/user/repo --directory codex
  skills-manager market share --id khazix-skills

  skills-manager gitee save --username 用户名 --token gitee_xxx
  skills-manager gitee sync --pages 3 --branch-pages 10
  skills-manager gitee list
  skills-manager gitee search --query "AI agent" --min-stars 1000
  skills-manager gitee add --repo owner/name
  skills-manager gitee add --url https://gitee.com/owner/name
  skills-manager gitee tag --repo owner/name --tags 国产,AI
  skills-manager gitee tag --prefix proxy-ip/ --tags ipdodo
  skills-manager gitee tag --owner proxy-ip --tags ipdodo
  skills-manager gitee favorite --repo owner/name --value true
  skills-manager gitee watch-branches --repo owner/name --value true
`;
}

withStorageLock(os.homedir(), async () => {
  service = createSkillsService();
  await main();
}).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
