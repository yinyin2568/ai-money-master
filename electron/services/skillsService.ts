import { resolveDataDirectory } from './storageService.js';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, lstat, mkdir, readdir, readFile, realpath, rename, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { createSkillId } from '../../src/shared/skillIdentity.js';
import { parseSkillMarkdown } from '../../src/shared/skillParser.js';
import { scanSecurityFiles } from '../../src/shared/securityScanner.js';
import type {
  AppSettings,
  CreateGithubSkillInput,
  CreateModuleInput,
  DefaultModuleCandidate,
  GiteeBatchTagInput,
  GiteeBatchTagResult,
  GiteeCredentialsInput,
  GiteeRepoMetaInput,
  GiteeRecommendedRepository,
  GiteeRepository,
  GiteeRepositorySearchInput,
  GiteeSettings,
  GiteeStarRepositoryInput,
  GiteeStarSyncInput,
  GithubStarCredentialsInput,
  GithubStarMetaInput,
  GithubRecommendedRepository,
  GithubRepositorySearchInput,
  GithubStarRepositoryInput,
  GithubStarRepository,
  GithubStarSettings,
  GithubStarSyncInput,
  GithubSkillUpdateResult,
  GithubSkillUpdateStatus,
  InstalledSkill,
  OperationLogEntry,
  MarketplaceAddInput,
  MarketplaceInstallInput,
  MarketplaceSkill,
  PackageSkillsInput,
  ProductKind,
  SecurityReport,
  SkillDirectory,
  SkillSource,
  SkillStorageKind,
  SyncMode,
  SkillUsageEvent,
  SkillUserMeta,
  UpdateAppSettingsInput
} from '../../src/shared/types.js';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const optionalElectron = loadOptionalElectron();
const electronShell = optionalElectron?.shell;
const electronClipboard = optionalElectron?.clipboard;
const SKILL_FILE_NAME = 'SKILL.md';
const DISABLED_SKILL_FILE_NAME = 'SKILL.md.disabled';
const MEMORY_BLOCK_START = '<!-- skills-manager:memory:start -->';
const MEMORY_BLOCK_END = '<!-- skills-manager:memory:end -->';
const CALL_TRACKING_BLOCK_START = '<!-- skills-manager:call-tracking:start -->';
const CALL_TRACKING_BLOCK_END = '<!-- skills-manager:call-tracking:end -->';
const EVOLUTION_BLOCK_START = '<!-- skills-manager:evolution:start -->';
const EVOLUTION_BLOCK_END = '<!-- skills-manager:evolution:end -->';
const DISCOVERY_IGNORED_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  'target',
  'dist',
  'dist-electron',
  'release',
  'release-fixed',
  'release-manual',
  'build',
  'out'
]);
const DEFAULT_MODULE_DEFINITIONS = [
  { productId: 'codex', label: 'Codex', relativePath: ['.codex', 'skills'] },
  { productId: 'claude', label: 'Claude Code', relativePath: ['.claude', 'skills'] },
  { productId: 'cursor', label: 'Cursor', relativePath: ['.cursor', 'skills'] },
  { productId: 'gemini', label: 'Gemini CLI', relativePath: ['.gemini', 'skills'] },
  { productId: 'windsurf', label: 'Windsurf', relativePath: ['.windsurf', 'skills'] },
  { productId: 'trae', label: 'Trae', relativePath: ['.trae', 'skills'] },
  { productId: 'cline', label: 'Cline', relativePath: ['.cline', 'skills'] },
  { productId: 'roo', label: 'Roo Code', relativePath: ['.roo', 'skills'] },
  { productId: 'augment', label: 'Augment', relativePath: ['.augment', 'skills'] },
  { productId: 'goose', label: 'Goose', relativePath: ['.goose', 'skills'] },
  { productId: 'continue', label: 'Continue', relativePath: ['.continue', 'skills'] },
  { productId: 'openclaw', label: 'OpenClaw', relativePath: ['.openclaw', 'skills'] },
  { productId: 'qwen', label: 'Qwen Code', relativePath: ['.qwen', 'skills'] },
  { productId: 'opencode', label: 'OpenCode', relativePath: ['.opencode', 'skills'] },
  { productId: 'aider', label: 'Aider', relativePath: ['.aider', 'skills'] },
  { productId: 'openhands', label: 'OpenHands', relativePath: ['.openhands', 'skills'] },
  { productId: 'kiro', label: 'Kiro', relativePath: ['.kiro', 'skills'] },
  { productId: 'zed', label: 'Zed', relativePath: ['.zed', 'skills'] },
  { productId: 'copilot', label: 'GitHub Copilot', relativePath: ['.copilot', 'skills'] },
  { productId: 'amazonq', label: 'Amazon Q Developer', relativePath: ['.amazonq', 'skills'] },
  { productId: 'tabnine', label: 'Tabnine', relativePath: ['.tabnine', 'skills'] },
  { productId: 'codeium', label: 'Codeium', relativePath: ['.codeium', 'skills'] },
  { productId: 'jetbrains', label: 'JetBrains AI', relativePath: ['.jetbrains-ai', 'skills'] },
  { productId: 'vscode', label: 'VS Code Agent', relativePath: ['.vscode-agent', 'skills'] },
  { productId: 'devin', label: 'Devin', relativePath: ['.devin', 'skills'] },
  { productId: 'sourcegraph', label: 'Sourcegraph Cody', relativePath: ['.sourcegraph-cody', 'skills'] },
  { productId: 'replit', label: 'Replit Agent', relativePath: ['.replit-agent', 'skills'] },
  { productId: 'codewhisperer', label: 'CodeWhisperer', relativePath: ['.codewhisperer', 'skills'] },
  { productId: 'supermaven', label: 'Supermaven', relativePath: ['.supermaven', 'skills'] }
];
const BUILTIN_MARKETPLACE_SKILLS: MarketplaceSkill[] = [
  {
    id: 'khazix-skills',
    name: 'Khazix-Skills',
    description: '社区 Skills 仓库，可作为本地技能沉淀和迁移参考。',
    author: 'KKKKhazix',
    repoUrl: 'https://github.com/KKKKhazix/Khazix-Skills',
    tags: ['社区', '技能库', 'GitHub']
  },
  {
    id: 'skillshare',
    name: 'skillshare',
    description: '复用和分享 Skills 的社区实现参考。',
    author: 'runkids',
    repoUrl: 'https://github.com/runkids/skillshare',
    tags: ['分享', '复用', '社区']
  },
  {
    id: 'skills-manager-reference',
    name: 'Skills-Manager',
    description: '支持多工具、启用禁用和社区市场思路的 Skills 管理器参考。',
    author: 'jiweiyeah',
    repoUrl: 'https://github.com/jiweiyeah/Skills-Manager',
    tags: ['管理器', '多工具', '市场']
  }
];

interface ServiceOptions {
  homeDir?: string;
  githubFetch?: GithubFetch;
}

interface AppState {
  defaultDirectories: SkillDirectory[];
  customDirectories: SkillDirectory[];
  userMeta: Record<string, SkillUserMeta>;
  marketplaceSkills?: MarketplaceSkill[];
  githubStars?: GithubStarStore;
  gitee?: GiteeStarStore;
  appSettings?: AppSettings;
}

type GithubFetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text?: () => Promise<string>;
};

type GithubFetch = (url: string, init?: RequestInit) => Promise<GithubFetchResponse>;

type OptionalElectron = {
  shell?: {
    openPath: (folderPath: string) => Promise<string>;
    showItemInFolder: (filePath: string) => void;
  };
  clipboard?: {
    writeText: (text: string) => void;
  };
};

interface GithubStarStore {
  username?: string;
  token?: string;
  lastSyncedAt?: number;
  repositories: Record<string, GithubStarRepository>;
}

interface GiteeStarStore {
  username?: string;
  token?: string;
  lastSyncedAt?: number;
  repositories: Record<string, GiteeRepository>;
}

interface UpdateMetaInput {
  favorite?: boolean;
  tags?: string[];
}

interface GithubSkillMetadata {
  githubUrl?: string;
  githubBranch?: string;
  githubHash?: string;
  sourceType?: string;
}

interface SkillEvolutionEntry {
  id: string;
  note: string;
  source: 'manager';
  createdAt: string;
}

interface SkillEvolutionStore {
  version: 1;
  skillPath: string;
  memoryPath: string;
  updatedAt: string;
  entries: SkillEvolutionEntry[];
}

export function createSkillsService(options: ServiceOptions = {}) {
  const homeDir = options.homeDir ?? os.homedir();
  const dataDir = resolveDataDirectory(homeDir);
  const stateDir = path.join(dataDir, 'state');
  const statePath = path.join(stateDir, 'skills.json');
  const githubFetch = options.githubFetch ?? globalThis.fetch?.bind(globalThis);
  let mutationQueue: Promise<void> = Promise.resolve();

  async function getAppSettings(): Promise<AppSettings> {
    const state = await readState();
    return normalizeAppSettings(state.appSettings);
  }

  async function saveAppSettings(input: UpdateAppSettingsInput): Promise<AppSettings> {
    const state = await readState();
    const current = normalizeAppSettings(state.appSettings);
    state.appSettings = {
      ...current,
      offlineMode: input.offlineMode ?? current.offlineMode
    };
    await writeState(state);
    return state.appSettings;
  }

  async function assertOnlineMode(action: string) {
    const settings = await getAppSettings();
    if (settings.offlineMode) {
      throw new Error(`离线模式已开启，已阻止${action}，不会访问云端或上传本地数据`);
    }
  }

  async function assertOnlineForRemoteResource(resource: string, action: string) {
    if (isRemoteResource(resource)) await assertOnlineMode(action);
  }

  async function assertOnlineForPackage(packageName: string, action: string) {
    if (!isLocalPackagePath(packageName)) await assertOnlineMode(action);
  }

  async function assertOnlineForRepositoryRemote(repositoryPath: string, action: string) {
    const result = await execFileAsync('git', ['-C', repositoryPath, 'config', '--get', 'remote.origin.url'], {
      timeout: 30_000
    }).catch(() => undefined);
    const remoteUrl = String(result?.stdout ?? '').trim();
    if (remoteUrl && isRemoteResource(remoteUrl)) await assertOnlineMode(action);
  }

  async function getDirectories(): Promise<SkillDirectory[]> {
    const state = await readState();
    return [...getActiveDefaultDirectories(state), ...state.customDirectories].map((directory) => ({
      ...directory,
      path: expandHome(directory.path),
      tags: normalizeTags(directory.tags)
    }));
  }

  async function saveDefaultDirectories(directories: SkillDirectory[]) {
    const state = await readState();
    const nextDefaultDirectories = directories.map((directory) => ({
      ...directory,
      id: sanitizeIdentifier(directory.id) || createCustomDirectoryId(directory.path),
      label: directory.label.trim() || '默认目录',
      product: productFromDirectoryId(directory.id),
      path: normalizeUserPath(directory.path),
      enabled: directory.enabled,
      builtIn: true,
      tags: normalizeTags(directory.tags)
    }));
    assertUniqueDirectoryPaths([...nextDefaultDirectories, ...state.customDirectories]);
    state.defaultDirectories = nextDefaultDirectories;
    await writeState(state);
    return getDirectories();
  }

  async function saveCustomDirectories(directories: SkillDirectory[]) {
    const state = await readState();
    const nextCustomDirectories = directories.map((directory) => ({
      ...directory,
      id: sanitizeIdentifier(directory.id) || createCustomDirectoryId(directory.path),
      label: directory.label.trim() || '自定义目录',
      path: normalizeUserPath(directory.path),
      product: 'custom' as const,
      builtIn: false as const,
      tags: normalizeTags(directory.tags)
    }));
    assertUniqueDirectoryPaths([...getDefaultDirectories(state), ...nextCustomDirectories]);
    state.customDirectories = nextCustomDirectories;
    await writeState(state);
    return getDirectories();
  }

  async function getDefaultModuleCandidates(): Promise<DefaultModuleCandidate[]> {
    return DEFAULT_MODULE_DEFINITIONS.map((definition) => {
      const modulePath = path.join(homeDir, ...definition.relativePath);
      return {
        productId: definition.productId,
        label: definition.label,
        path: modulePath,
        exists: existsSync(modulePath)
      };
    });
  }

  async function createModule(input: CreateModuleInput) {
    const moduleName = input.name.trim();
    if (!moduleName) throw new Error('模块名称不能为空');

    const modulePath = await resolveModulePath(input, moduleName);
    const state = await readState();
    const existingDirectory = [...getDefaultDirectories(state), ...state.customDirectories].find((directory) =>
      isSamePath(expandHome(directory.path), modulePath)
    );

    if (existingDirectory) {
      if (input.mode === 'default' && existingDirectory.builtIn) {
        const nextDefaultDirectories = getDefaultDirectories(state).map((directory) =>
          directory.id === existingDirectory.id
            ? {
                ...directory,
                label: moduleName,
                path: modulePath,
                enabled: true,
                tags: normalizeTags(input.tags)
              }
            : directory
        );
        state.defaultDirectories = nextDefaultDirectories;
        await writeState(state);
        const skillCount = (await discoverSkillDirectories(modulePath)).length;
        return { success: true, message: `已启用默认模块：${moduleName}，发现 ${skillCount} 个 Skills` };
      }
      throw new Error(`模块路径已存在：${existingDirectory.label}`);
    }

    await mkdir(modulePath, { recursive: true });
    const skillCount = (await discoverSkillDirectories(modulePath)).length;
    state.customDirectories.push({
      id: createCustomDirectoryId(modulePath),
      label: moduleName,
      product: 'custom',
      path: modulePath,
      enabled: true,
      builtIn: false,
      tags: normalizeTags(input.tags)
    });
    await writeState(state);
    return { success: true, message: `已新增模块：${moduleName}，发现 ${skillCount} 个 Skills` };
  }

  async function removeModule(directoryId: string) {
    const state = await readState();
    const defaultDirectories = getDefaultDirectories(state);
    if (defaultDirectories.some((directory) => directory.id === directoryId)) {
      throw new Error('内置模块不能移除');
    }

    const targetIndex = state.customDirectories.findIndex((directory) => directory.id === directoryId);
    if (targetIndex < 0) throw new Error('模块不存在或已移除');

    const [target] = state.customDirectories.splice(targetIndex, 1);
    const targetPath = expandHome(target.path);
    assertSafeModuleRemovalPath(targetPath, homeDir, defaultDirectories);

    const skillDirectories = await discoverSkillDirectories(targetPath);
    for (const skillDirectory of skillDirectories) {
      await rm(skillDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }

    for (const [skillId, meta] of Object.entries(state.userMeta)) {
      if (meta.localPath && isInsideOrSame(path.resolve(meta.localPath), path.resolve(targetPath))) {
        delete state.userMeta[skillId];
      }
    }
    await writeState(state);
    return { success: true, message: `已移除模块：${target.label}，删除 ${skillDirectories.length} 个 Skills` };
  }

  async function resolveModulePath(input: CreateModuleInput, moduleName: string) {
    if (input.mode === 'local') {
      if (!input.localPath.trim()) throw new Error('本地路径不能为空');
      return normalizeUserPath(input.localPath);
    }

    if (input.mode === 'default') {
      if (!input.defaultPath.trim()) throw new Error('默认路径不能为空');
      return normalizeUserPath(input.defaultPath);
    }

    if (input.mode === 'npx') {
      await assertOnlineForPackage(input.packageName, 'NPX 模块安装');
      return installNpxModule(input, moduleName);
    }

    const repoUrl = input.githubUrl.trim();
    if (!repoUrl) throw new Error('GitHub 地址不能为空');
    await assertOnlineForRemoteResource(repoUrl, 'GitHub 模块导入');

    const modulesRoot = path.join(dataDir, 'modules');
    await mkdir(modulesRoot, { recursive: true });
    const repoName = repoUrl.replace(/\/$/, '').split('/').pop()?.replace(/\.git$/, '') ?? 'github-module';
    const targetPath = path.join(modulesRoot, sanitizePathSegment(moduleName || repoName));
    if (existsSync(targetPath)) throw new Error(`GitHub 模块目录已存在：${targetPath}`);

    try {
      await execFileAsync('git', ['clone', '--depth', '1', repoUrl, targetPath], { timeout: 120_000 });
    } catch (error) {
      throw new Error(`GitHub 模块导入失败，请确认已安装 Git 且网络可用：${String(error)}`);
    }

    const skillCount = (await discoverSkillDirectories(targetPath)).length;
    if (skillCount === 0) {
      await rm(targetPath, { recursive: true, force: true });
      throw new Error('GitHub 仓库中未找到 SKILL.md');
    }

    return targetPath;
  }

  async function installNpxModule(
    input: Extract<CreateModuleInput, { mode: 'npx' }>,
    moduleName: string
  ) {
    const packageName = input.packageName.trim();
    if (!packageName) throw new Error('NPX 包名不能为空');

    const modulesRoot = path.join(dataDir, 'modules');
    await mkdir(modulesRoot, { recursive: true });
    const targetPath = path.join(modulesRoot, sanitizePathSegment(moduleName));
    if (existsSync(targetPath)) throw new Error(`NPX 模块目录已存在：${targetPath}`);

    const tempRoot = path.join(dataDir, 'tmp', `npx_module_${Date.now()}`);
    const packageSpec = buildNpxPackageSpec(packageName, input.versionRange);
    try {
      await mkdir(tempRoot, { recursive: true });
      const packArgs = ['pack', packageSpec, '--pack-destination', tempRoot, '--ignore-scripts'];
      const registry = input.registry?.trim();
      if (registry) packArgs.push('--registry', registry);
      const packResult = await runNpm(packArgs);
      const tarballName = String(packResult.stdout)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .pop();
      if (!tarballName) throw new Error('npm pack 未生成压缩包');

      const tarballPath = path.isAbsolute(tarballName) ? tarballName : path.join(tempRoot, tarballName);
      await execFileAsync('tar', ['-xzf', tarballPath, '-C', tempRoot], { timeout: 120_000 });
      const extractedPackagePath = path.join(tempRoot, 'package');
      if (!existsSync(extractedPackagePath)) throw new Error('NPX 包解压失败：未找到 package 目录');

      const skillCount = (await discoverSkillDirectories(extractedPackagePath)).length;
      if (skillCount === 0) throw new Error('NPX 包中未找到 SKILL.md');

      await cp(extractedPackagePath, targetPath, { recursive: true });
      await writeFile(
        path.join(targetPath, '.skills-manager-npx.json'),
        JSON.stringify(
          {
            packageName,
            versionRange: input.versionRange?.trim() || undefined,
            registry: registry || undefined,
            installedAt: new Date().toISOString()
          },
          null,
          2
        ),
        'utf8'
      );
      return targetPath;
    } catch (error) {
      await rm(targetPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      throw new Error(`NPX 模块导入失败：${getErrorMessage(error)}`);
    } finally {
      await rm(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }

  async function scanSkills(): Promise<InstalledSkill[]> {
    const state = await readState();
    const directories = await getDirectories();
    const skills: InstalledSkill[] = [];
    let stateChanged = false;

    for (const directory of directories.filter((item) => item.enabled)) {
      if (!existsSync(directory.path)) continue;

      const skillDirectories = await discoverSkillDirectories(directory.path);
      for (const localPath of skillDirectories) {
        const enabledSkillFilePath = path.join(localPath, SKILL_FILE_NAME);
        const disabledSkillFilePath = path.join(localPath, DISABLED_SKILL_FILE_NAME);
        const disabled = !existsSync(enabledSkillFilePath) && existsSync(disabledSkillFilePath);
        const skillFilePath = disabled ? disabledSkillFilePath : enabledSkillFilePath;
        const content = await readFile(skillFilePath, 'utf8');
        const parsed = parseSkillMarkdown({ content, directoryName: path.basename(localPath) });
        const skillId = createSkillId({ localPath, content });
        const metadata = await readSkillMetadata(localPath);
        const userMeta = state.userMeta[skillId] ?? createEmptyMeta(skillId, metadata);
        const storageInfo = await getSkillStorageInfo(localPath);
        const usageStats = await readSkillUsageStats(localPath);
        const callTrackingEnabled = hasManagedCallTrackingBlock(content);
        const memoryOptimizationEnabled = hasManagedMemoryBlock(content) || hasManagedEvolutionBlock(content);
        if (userMeta.name !== parsed.name || userMeta.localPath !== localPath || userMeta.product !== directory.product) {
          state.userMeta[skillId] = {
            ...userMeta,
            name: parsed.name,
            localPath,
            product: directory.product
          };
          stateChanged = true;
        }
        const skillStat = await stat(skillFilePath);

        skills.push({
          id: skillId,
          ...parsed,
          directoryId: directory.id,
          product: directory.product,
          localPath,
          skillFilePath,
          storageKind: storageInfo.storageKind,
          linkTarget: storageInfo.linkTarget,
          source: metadata.source,
          sourceUrl: metadata.sourceUrl,
          favorite: userMeta.favorite,
          tags: userMeta.tags,
          moduleTags: normalizeTags(directory.tags),
          callTrackingEnabled,
          memoryOptimizationEnabled,
          callCount: usageStats?.callCount ?? userMeta.callCount,
          lastCalledAt: usageStats?.lastCalledAt ?? userMeta.lastCalledAt,
          installDate: userMeta.installDate ?? metadata.installDate,
          lastModified: skillStat.mtimeMs,
          disabled,
          securityLevel: userMeta.securityReport?.level ?? 'unscanned',
          securityScore: userMeta.securityReport?.score,
          lastScannedAt: userMeta.securityReport
            ? [...userMeta.usageEvents].reverse().find((event: SkillUsageEvent) => event.eventType === 'scan')?.timestamp
            : undefined
        });
      }
    }

    if (stateChanged) await writeState(state);
    return skills.sort((first, second) => first.name.localeCompare(second.name, 'zh-CN'));
  }

  async function readSkill(skillPath: string) {
    const directories = await getDirectories();
    const normalizedSkillPath = normalizeUserPath(skillPath);
    assertSkillPathInsideRoots(normalizedSkillPath, directories, true);
    const enabledPath = path.join(normalizedSkillPath, SKILL_FILE_NAME);
    const disabledPath = path.join(normalizedSkillPath, DISABLED_SKILL_FILE_NAME);
    const target = existsSync(enabledPath) ? enabledPath : disabledPath;
    return readFile(target, 'utf8');
  }

  async function setSkillEnabled(skillPath: string, enabled: boolean) {
    const directories = await getDirectories();
    assertSkillPathInsideRoots(skillPath, directories, true);
    const enabledPath = path.join(skillPath, SKILL_FILE_NAME);
    const disabledPath = path.join(skillPath, DISABLED_SKILL_FILE_NAME);

    if (enabled) {
      if (existsSync(enabledPath)) return { success: true, message: 'Skill 已处于启用状态' };
      if (!existsSync(disabledPath)) throw new Error('未找到可启用的 SKILL.md.disabled');
      await rename(disabledPath, enabledPath);
      return { success: true, message: 'Skill 已启用' };
    }

    if (existsSync(disabledPath)) return { success: true, message: 'Skill 已处于禁用状态' };
    if (!existsSync(enabledPath)) throw new Error('未找到可禁用的 SKILL.md');
    await rename(enabledPath, disabledPath);
    return { success: true, message: 'Skill 已禁用' };
  }

  async function setSkillCallTracking(skillPath: string, skillId: string, enabled: boolean) {
    const directories = await getDirectories();
    const normalizedSkillPath = normalizeUserPath(skillPath);
    assertSkillPathInsideRoots(normalizedSkillPath, directories, true);

    const skillFilePath = getEditableSkillFilePath(normalizedSkillPath);
    const content = await readFile(skillFilePath, 'utf8');
    const usagePath = getSkillUsagePath(normalizedSkillPath);

    if (enabled) {
      await mkdir(path.dirname(usagePath), { recursive: true });
      await ensureSkillUsageFile(usagePath);
      await ensureSkillCallRecorder(normalizedSkillPath);
      await writeFile(skillFilePath, upsertManagedCallTrackingBlock(content, usagePath), 'utf8');
      await recordOperation(skillId, 'agentCall', 'manager', `启用调用统计：${usagePath}`);
      return {
        success: true,
        outputPath: usagePath,
        message: `调用统计已启用：${usagePath}`
      };
    }

    await writeFile(skillFilePath, removeManagedCallTrackingBlock(content), 'utf8');
    await rm(usagePath, { force: true });
    await rm(getSkillRecorderPath(normalizedSkillPath), { force: true });
    await clearSkillCallUsageStats(skillId);
    await recordOperation(skillId, 'agentCall', 'manager', `停用调用统计并清零：${usagePath}`);
    return {
      success: true,
      outputPath: usagePath,
      message: '调用统计已停用，调用次数已清零'
    };
  }

  async function recordSkillCall(skillPath: string, source: SkillUsageEvent['source'] = 'codex') {
    const directories = await getDirectories();
    const normalizedSkillPath = normalizeUserPath(skillPath);
    assertSkillPathInsideRoots(normalizedSkillPath, directories, true);

    const skillFilePath = getEditableSkillFilePath(normalizedSkillPath);
    const content = await readFile(skillFilePath, 'utf8');
    if (!hasManagedCallTrackingBlock(content)) {
      throw new Error('调用统计未启用：请先在管理器中点击“启用调用”');
    }

    const usagePath = getSkillUsagePath(normalizedSkillPath);
    await mkdir(path.dirname(usagePath), { recursive: true });
    const current = await readSkillUsageStats(normalizedSkillPath);
    const timestamp = Date.now();
    const nextCount = (current?.callCount ?? 0) + 1;
    await writeFile(
      usagePath,
      JSON.stringify(
        {
          callCount: nextCount,
          lastCalledAt: timestamp,
          updatedAt: new Date(timestamp).toISOString(),
          source
        },
        null,
        2
      ),
      'utf8'
    );

    return {
      success: true,
      outputPath: usagePath,
      message: `已记录 Skill 调用：${nextCount}`
    };
  }

  async function openFolder(folderPath: string) {
    if (!electronShell) throw new Error('打开目录需要在 Electron 应用中执行');
    const directories = await getDirectories();
    const normalizedSkillPath = normalizeUserPath(folderPath);
    assertSkillPathInsideRoots(normalizedSkillPath, directories, true);
    await electronShell.openPath(normalizedSkillPath);
  }

  async function uninstallSkill(skillPath: string) {
    const directories = await getDirectories();
    assertSkillPathInsideRoots(skillPath, directories, true);
    await rm(skillPath, { recursive: true, force: true });
    return { success: true, message: 'Skill 已删除' };
  }

  async function importLocalSkill(sourcePath: string, targetDirectoryId = 'claude') {
    const normalizedSourcePath = normalizeUserPath(sourcePath);
    const skillDirectories = await discoverSkillDirectories(normalizedSourcePath);
    if (skillDirectories.length === 0) {
      throw new Error('未找到 SKILL.md：请填写单个 Skill 文件夹，或包含多个 Skills 的上级目录');
    }

    if (!existsSync(path.join(normalizedSourcePath, SKILL_FILE_NAME))) {
      const state = await readState();
      const existing = state.customDirectories.find((directory) => isSamePath(expandHome(directory.path), normalizedSourcePath));
      if (existing) {
        existing.enabled = true;
        existing.path = normalizedSourcePath;
      } else {
        state.customDirectories.push({
          id: createCustomDirectoryId(normalizedSourcePath),
          label: path.basename(normalizedSourcePath) || '自定义目录',
          product: 'custom',
          path: normalizedSourcePath,
          enabled: true,
          builtIn: false,
          tags: []
        });
      }
      await writeState(state);
      return {
        success: true,
        message: `已添加自定义目录：${normalizedSourcePath}，发现 ${skillDirectories.length} 个 Skills`
      };
    }

    const directories = await getDirectories();
    const targetRoot = findTargetRoot(directories, targetDirectoryId);
    await mkdir(targetRoot.path, { recursive: true });
    const imported: string[] = [];
    const skipped: string[] = [];

    for (const skillDirectory of skillDirectories) {
      const skillName = path.basename(skillDirectory);
      const targetPath = path.join(targetRoot.path, skillName);
      if (existsSync(targetPath)) {
        skipped.push(skillName);
        continue;
      }

      await cp(skillDirectory, targetPath, { recursive: true });
      await writeSkillMetadata(targetPath, { source: 'local', installDate: Date.now() });
      imported.push(skillName);
    }

    const skippedText = skipped.length > 0 ? `，跳过 ${skipped.length} 个已存在：${skipped.join('、')}` : '';
    if (imported.length === 1) {
      return { success: true, message: `已导入到 ${path.join(targetRoot.path, imported[0])}${skippedText}` };
    }
    return { success: true, message: `已导入 ${imported.length} 个 Skills 到 ${targetRoot.path}${skippedText}` };
  }

  async function importGithubSkill(repoUrl: string, targetDirectoryId = 'claude') {
    await assertOnlineForRemoteResource(repoUrl, 'GitHub Skill 导入');
    const directories = await getDirectories();
    const targetRoot = findTargetRoot(directories, targetDirectoryId);
    const skillName = repoUrl.trim().replace(/\/$/, '').split('/').pop()?.replace(/\.git$/, '');
    if (!skillName) throw new Error('GitHub 地址不正确');

    await mkdir(targetRoot.path, { recursive: true });
    const tempRoot = path.join(dataDir, 'tmp', `github_import_${Date.now()}`);
    const clonePath = path.join(tempRoot, 'repo');

    try {
      await mkdir(tempRoot, { recursive: true });
      await execFileAsync('git', ['clone', '--depth', '1', repoUrl, clonePath], { timeout: 120_000 });
    } catch (error) {
      await rm(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      throw new Error(`GitHub 导入失败，请确认已安装 Git 且网络可用：${String(error)}`);
    }

    try {
      if (existsSync(path.join(clonePath, SKILL_FILE_NAME))) {
        const targetPath = path.join(targetRoot.path, skillName);
        if (existsSync(targetPath)) throw new Error(`目标目录已存在：${targetPath}`);

        await cp(clonePath, targetPath, { recursive: true });
        await writeSkillMetadata(targetPath, { source: 'github', sourceUrl: repoUrl, installDate: Date.now() });
        return { success: true, message: `已从 GitHub 导入到 ${targetPath}` };
      }

      const skillDirectories = await discoverSkillDirectories(clonePath);
      if (skillDirectories.length === 0) throw new Error('仓库中未找到 SKILL.md');

      const imported: string[] = [];
      const skipped: string[] = [];
      for (const skillDirectory of skillDirectories) {
        const nestedSkillName = path.basename(skillDirectory);
        const targetPath = path.join(targetRoot.path, nestedSkillName);
        if (existsSync(targetPath)) {
          skipped.push(nestedSkillName);
          continue;
        }

        await cp(skillDirectory, targetPath, { recursive: true });
        await writeSkillMetadata(targetPath, { source: 'github', sourceUrl: repoUrl, installDate: Date.now() });
        imported.push(nestedSkillName);
      }

      const skippedText = skipped.length > 0 ? `，跳过 ${skipped.length} 个已存在：${skipped.join('、')}` : '';
      if (imported.length === 0) return { success: true, message: `未导入新 Skills${skippedText}` };
      if (imported.length === 1) {
        return { success: true, message: `已从 GitHub 导入到 ${path.join(targetRoot.path, imported[0])}${skippedText}` };
      }
      return { success: true, message: `已从 GitHub 导入 ${imported.length} 个 Skills 到 ${targetRoot.path}${skippedText}` };
    } finally {
      await rm(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }

  async function syncSkillToDirectory(skillPath: string, targetDirectoryId: string, mode: SyncMode = 'symlink') {
    const directories = await getDirectories();
    const targetRoot = findTargetRoot(directories, targetDirectoryId);
    const normalizedSkillPath = normalizeUserPath(skillPath);
    const sourceSkillFilePath = path.join(normalizedSkillPath, SKILL_FILE_NAME);
    if (!existsSync(sourceSkillFilePath)) {
      throw new Error('同步失败：源目录不包含 SKILL.md');
    }
    const sourceSkillContent = await readFile(sourceSkillFilePath, 'utf8');
    assertSkillTargetsAllowDirectory(sourceSkillContent, targetRoot);

    await mkdir(targetRoot.path, { recursive: true });
    const sourceRealPath = await realpath(normalizedSkillPath);
    const targetPath = path.join(targetRoot.path, path.basename(normalizedSkillPath));
    if (isSamePath(sourceRealPath, targetPath)) {
      return { success: true, message: `已在目标模块中：${targetPath}` };
    }

    if (existsSync(targetPath)) {
      const existingTarget = await resolveLinkTarget(targetPath);
      if (mode === 'symlink' && existingTarget && isSamePath(existingTarget, sourceRealPath)) {
        return { success: true, message: `已存在同步软连接：${targetPath}` };
      }
      throw new Error(`目标模块已存在同名 Skill：${targetPath}`);
    }

    if (mode === 'copy') {
      await cp(sourceRealPath, targetPath, { recursive: true });
      await writeSkillMetadata(targetPath, { source: 'local', installDate: Date.now() });
      return { success: true, message: `已完整复制到 ${targetPath}` };
    }

    await symlink(sourceRealPath, targetPath, process.platform === 'win32' ? 'junction' : 'dir');
    return { success: true, message: `已软连接同步到 ${targetPath}` };
  }

  async function syncRepositoryModule(directoryId: string) {
    const directories = await getDirectories();
    const target = directories.find((directory) => directory.id === directoryId && directory.enabled);
    if (!target) throw new Error('模块未启用或不存在');

    const repositoryPath = normalizeUserPath(target.path);
    if (!existsSync(path.join(repositoryPath, '.git'))) {
      throw new Error('当前模块不是 Git 仓库，无法执行一键同步');
    }
    await assertOnlineForRepositoryRemote(repositoryPath, '仓库同步');

    const status = await execFileAsync('git', ['-C', repositoryPath, 'status', '--porcelain'], { timeout: 30_000 });
    if (status.stdout.trim()) {
      throw new Error('仓库存在本地未提交变更，请先处理后再同步');
    }

    await execFileAsync('git', ['-C', repositoryPath, 'pull', '--ff-only'], { timeout: 120_000 });
    const refreshedCount = await refreshGithubSkillWrappersFromRepository(repositoryPath);
    const skillCount = (await discoverSkillDirectories(repositoryPath)).length;
    return {
      success: true,
      message: `仓库同步完成：${target.label}，发现 ${skillCount} 个 Skills，刷新 ${refreshedCount} 个 GitHub 转 Skill`
    };
  }

  async function createGithubSkill(input: CreateGithubSkillInput) {
    const repoUrl = input.repoUrl.trim();
    if (!repoUrl) throw new Error('GitHub 仓库地址不能为空');
    await assertOnlineForRemoteResource(repoUrl, 'GitHub 转 Skill');
    if (input.localRepositoryRoot?.trim()) {
      return createGithubSkillModule(input, repoUrl);
    }

    const directories = await getDirectories();
    const targetRoot = findTargetRoot(directories, input.targetDirectoryId ?? 'claude');
    await mkdir(targetRoot.path, { recursive: true });

    const repoName = deriveRepositoryName(repoUrl);
    const skillName = input.name?.trim() || repoName;
    const folderName = sanitizePathSegment(skillName);
    const targetPath = path.join(targetRoot.path, folderName);
    if (existsSync(targetPath)) throw new Error(`目标模块已存在同名 Skill：${targetPath}`);

    const tempRoot = path.join(dataDir, 'tmp', `github_skill_${Date.now()}`);
    const clonePath = path.join(tempRoot, 'repo');
    try {
      await mkdir(tempRoot, { recursive: true });
      await execFileAsync('git', ['clone', '--depth', '1', repoUrl, clonePath], { timeout: 120_000 });
      const hash = (await gitOutput(['-C', clonePath, 'rev-parse', 'HEAD'])).trim();
      const branch = normalizeBranchName((await gitOutput(['-C', clonePath, 'rev-parse', '--abbrev-ref', 'HEAD'])).trim());

      await mkdir(path.join(targetPath, 'references'), { recursive: true });
      const readmeContent = await readRepositoryReadme(clonePath, repoName);
      await writeFile(path.join(targetPath, 'references', 'README.md'), readmeContent, 'utf8');
      await writeFile(path.join(targetPath, SKILL_FILE_NAME), buildGithubSkillMarkdown(skillName, repoName, repoUrl, branch, hash), 'utf8');
      await writeSkillMetadata(targetPath, { source: 'github', sourceUrl: repoUrl, installDate: Date.now() });

      return {
        success: true,
        outputPath: targetPath,
        message: `已从 GitHub 仓库生成 Skill：${targetPath}`
      };
    } finally {
      await rm(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }

  async function createGithubSkillModule(input: CreateGithubSkillInput, repoUrl: string) {
    const localRepositoryRoot = normalizeUserPath(input.localRepositoryRoot ?? '');
    const repoName = deriveRepositoryName(repoUrl);
    const moduleName = input.name?.trim() || repoName;
    const modulePath = path.join(localRepositoryRoot, sanitizePathSegment(repoName));
    const skillFolderName = sanitizePathSegment(moduleName);
    const skillPath = path.join(modulePath, 'skills', skillFolderName);
    const state = await readState();
    const existingDirectory = [...getDefaultDirectories(state), ...state.customDirectories].find((directory) =>
      isSamePath(expandHome(directory.path), modulePath)
    );
    if (existingDirectory) throw new Error(`模块路径已存在：${existingDirectory.label}`);
    if (existsSync(modulePath)) throw new Error(`本地仓库目录已存在：${modulePath}`);

    try {
      await mkdir(localRepositoryRoot, { recursive: true });
      await execFileAsync('git', ['clone', '--depth', '1', repoUrl, modulePath], { timeout: 120_000 });
      const hash = (await gitOutput(['-C', modulePath, 'rev-parse', 'HEAD'])).trim();
      const branch = normalizeBranchName((await gitOutput(['-C', modulePath, 'rev-parse', '--abbrev-ref', 'HEAD'])).trim());

      await mkdir(path.join(skillPath, 'references'), { recursive: true });
      const readmeContent = await readRepositoryReadme(modulePath, repoName);
      await writeFile(path.join(skillPath, 'references', 'README.md'), readmeContent, 'utf8');
      await writeFile(path.join(skillPath, SKILL_FILE_NAME), buildGithubSkillMarkdown(moduleName, repoName, repoUrl, branch, hash), 'utf8');
      await writeSkillMetadata(skillPath, { source: 'github', sourceUrl: repoUrl, installDate: Date.now() });

      if (input.preserveGitRemote !== false) {
        await appendGitInfoExclude(modulePath, `skills/${skillFolderName}/`);
      } else {
        await rm(path.join(modulePath, '.git'), { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      }

      state.customDirectories.push({
        id: createCustomDirectoryId(modulePath),
        label: moduleName,
        product: 'custom',
        path: modulePath,
        enabled: true,
        builtIn: false,
        tags: []
      });
      assertUniqueDirectoryPaths([...getDefaultDirectories(state), ...state.customDirectories]);
      await writeState(state);

      return {
        success: true,
        outputPath: skillPath,
        message: `已从 GitHub 仓库生成模块：${moduleName}，模块路径：${modulePath}，Skill 路径：${skillPath}`
      };
    } catch (error) {
      await rm(modulePath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      throw error;
    }
  }

  async function listMarketplaceSkills(): Promise<MarketplaceSkill[]> {
    const state = await readState();
    return [...BUILTIN_MARKETPLACE_SKILLS, ...(state.marketplaceSkills ?? [])];
  }

  async function addMarketplaceSkill(input: MarketplaceAddInput) {
    const state = await readState();
    const item = buildCustomMarketplaceSkill(input);
    const builtInMatch = BUILTIN_MARKETPLACE_SKILLS.find((skill) => isSameMarketplaceUrl(skill.repoUrl, item.repoUrl));
    if (builtInMatch) {
      return { success: true, message: `已存在内置社区项目：${builtInMatch.name}` };
    }

    const currentItems = state.marketplaceSkills ?? [];
    const existingIndex = currentItems.findIndex((skill) => skill.id === item.id || isSameMarketplaceUrl(skill.repoUrl, item.repoUrl));
    if (existingIndex >= 0) {
      currentItems[existingIndex] = {
        ...currentItems[existingIndex],
        ...item,
        tags: item.tags.length > 0 ? item.tags : currentItems[existingIndex].tags,
        custom: true
      };
      state.marketplaceSkills = currentItems;
      await writeState(state);
      return { success: true, message: `已更新云端项目收藏：${item.name}` };
    }

    state.marketplaceSkills = [...currentItems, item];
    await writeState(state);
    return { success: true, message: `已收藏云端项目：${item.name}` };
  }

  async function removeMarketplaceSkill(id: string) {
    const state = await readState();
    const currentItems = state.marketplaceSkills ?? [];
    const nextItems = currentItems.filter((skill) => skill.id !== id);
    if (nextItems.length === currentItems.length) throw new Error(`未找到自定义市场项目：${id}`);

    state.marketplaceSkills = nextItems;
    await writeState(state);
    return { success: true, message: '已移除云端项目收藏' };
  }

  async function installMarketplaceSkill(input: MarketplaceInstallInput) {
    if (input.localPath?.trim()) {
      return importLocalSkill(input.localPath, input.targetDirectoryId);
    }
    if (input.repoUrl?.trim()) {
      return importGithubSkill(input.repoUrl, input.targetDirectoryId);
    }

    const item = (await listMarketplaceSkills()).find((skill) => skill.id === input.id);
    if (!item) throw new Error(`未找到市场 Skill：${input.id ?? ''}`);
    return importGithubSkill(item.repoUrl, input.targetDirectoryId);
  }

  async function shareMarketplaceSkill(id: string) {
    const item = (await listMarketplaceSkills()).find((skill) => skill.id === id);
    if (!item) throw new Error(`未找到市场 Skill：${id}`);
    const text = `${item.name}\n${item.description}\n${item.repoUrl}`;
    electronClipboard?.writeText(text);
    return { success: true, message: `已复制分享信息：${item.name}` };
  }

  async function checkGithubSkillUpdates(): Promise<GithubSkillUpdateStatus[]> {
    await assertOnlineMode('GitHub 仓库更新检查');
    const skills = await scanSkills();
    const statuses: GithubSkillUpdateStatus[] = [];

    for (const skill of skills) {
      const content = await readFile(skill.skillFilePath, 'utf8');
      const metadata = parseGithubSkillMetadata(content);
      if (!metadata.githubUrl || !metadata.githubHash) continue;

      const branch = metadata.githubBranch || 'HEAD';
      const version = parseSkillMarkdown({ content, directoryName: path.basename(skill.localPath) }).version;
      try {
        const latestHash = await resolveRemoteHash(metadata.githubUrl, branch);
        const status = latestHash === metadata.githubHash ? 'current' : 'outdated';
        statuses.push({
          skillId: skill.id,
          name: skill.name,
          localPath: skill.localPath,
          githubUrl: metadata.githubUrl,
          branch,
          currentHash: metadata.githubHash,
          latestHash,
          version,
          status,
          message: status === 'current' ? 'Up to date' : 'New commits available'
        });
      } catch (error) {
        statuses.push({
          skillId: skill.id,
          name: skill.name,
          localPath: skill.localPath,
          githubUrl: metadata.githubUrl,
          branch,
          currentHash: metadata.githubHash,
          status: 'error',
          version,
          message: getErrorMessage(error)
        });
      }
    }

    return statuses.sort((first, second) => first.name.localeCompare(second.name, 'zh-CN'));
  }

  async function updateGithubSkill(skillPath: string, skillId: string): Promise<GithubSkillUpdateResult> {
    const directories = await getDirectories();
    const normalizedSkillPath = normalizeUserPath(skillPath);
    assertSkillPathInsideRoots(normalizedSkillPath, directories);

    const skillFilePath = path.join(normalizedSkillPath, SKILL_FILE_NAME);
    const content = await readFile(skillFilePath, 'utf8');
    const metadata = parseGithubSkillMetadata(content);
    if (!metadata.githubUrl || !metadata.githubHash) throw new Error('当前 Skill 缺少 github_url 或 github_hash 元数据');
    const parsedSkill = parseSkillMarkdown({ content, directoryName: path.basename(normalizedSkillPath) });
    await assertOnlineForRemoteResource(metadata.githubUrl, 'GitHub 仓库技能同步');

    const tempRoot = path.join(dataDir, 'tmp', `github_update_${Date.now()}`);
    const clonePath = path.join(tempRoot, 'repo');
    try {
      await mkdir(tempRoot, { recursive: true });
      const cloneArgs = ['clone', '--depth', '1'];
      if (metadata.githubBranch && metadata.githubBranch !== 'HEAD') {
        cloneArgs.push('--branch', metadata.githubBranch);
      }
      cloneArgs.push(metadata.githubUrl, clonePath);
      await execFileAsync('git', cloneArgs, { timeout: 120_000 });

      const latestHash = (await gitOutput(['-C', clonePath, 'rev-parse', 'HEAD'])).trim();
      const branch = metadata.githubBranch || normalizeBranchName((await gitOutput(['-C', clonePath, 'rev-parse', '--abbrev-ref', 'HEAD'])).trim());
      const wasOutdated = latestHash !== metadata.githubHash;
      const backupPath = wasOutdated ? path.join(normalizedSkillPath, `${SKILL_FILE_NAME}.bak.${formatFileTimestamp(new Date())}`) : undefined;
      if (backupPath) {
        await cp(skillFilePath, backupPath);
      }
      await mkdir(path.join(normalizedSkillPath, 'references'), { recursive: true });
      await writeFile(
        path.join(normalizedSkillPath, 'references', 'README.md'),
        await readRepositoryReadme(clonePath, deriveRepositoryName(metadata.githubUrl)),
        'utf8'
      );
      await writeFile(
        skillFilePath,
        upsertFrontmatterValues(content, {
          github_branch: branch,
          github_hash: latestHash,
          github_last_synced_at: new Date().toISOString()
        }),
        'utf8'
      );
      await writeSkillMetadata(normalizedSkillPath, { source: 'github', sourceUrl: metadata.githubUrl, installDate: Date.now() });
      await recordOperation(skillId, 'optimize', 'manager', `同步仓库技能：${latestHash}`);
      const updatedAt = new Date().toISOString();
      const afterStatus = latestHash === metadata.githubHash ? 'current' : 'current';

      return {
        success: true,
        outputPath: normalizedSkillPath,
        message: wasOutdated ? `仓库技能已同步：${path.basename(normalizedSkillPath)}` : `仓库技能已是最新：${path.basename(normalizedSkillPath)}`,
        skillId,
        skillName: parsedSkill.name || path.basename(normalizedSkillPath),
        githubUrl: metadata.githubUrl,
        branch,
        before: {
          currentHash: metadata.githubHash,
          latestHash,
          status: wasOutdated ? 'outdated' : 'current',
          version: parsedSkill.version
        },
        after: {
          currentHash: latestHash,
          latestHash,
          status: afterStatus,
          version: parsedSkill.version
        },
        backupPath,
        updatedAt,
        updateContent: wasOutdated
          ? 'GitHub 哈希值更新至最新提交，并刷新 references/README.md'
          : '当前 GitHub 哈希值已是最新，仅刷新 references/README.md'
      };
    } finally {
      await rm(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }

  async function packageSkills(input: PackageSkillsInput) {
    const skillPaths = Array.from(new Set(input.skillPaths.map((skillPath) => normalizeUserPath(skillPath))));
    if (skillPaths.length === 0) throw new Error('请先选择要打包的 Skills');

    const directories = await getDirectories();
    const exportRoot = path.join(dataDir, 'exports');
    const tempRoot = path.join(dataDir, 'tmp', `package_${Date.now()}`);
    const skillsRoot = path.join(tempRoot, 'skills');
    await mkdir(skillsRoot, { recursive: true });
    await mkdir(exportRoot, { recursive: true });

    const manifestSkills: Array<{
      name: string;
      sourcePath: string;
      exportedPath: string;
      storageKind: SkillStorageKind;
      linkTarget?: string;
      sha1: string;
    }> = [];
    const usedNames = new Map<string, number>();

    try {
      for (const skillPath of skillPaths) {
        assertSkillPathInsideRoots(skillPath, directories);
        const skillContent = await readFile(path.join(skillPath, SKILL_FILE_NAME), 'utf8');
        const parsed = parseSkillMarkdown({ content: skillContent, directoryName: path.basename(skillPath) });
        const storageInfo = await getSkillStorageInfo(skillPath);
        const sourceRealPath = await realpath(skillPath);
        const folderName = uniqueExportFolderName(path.basename(skillPath), usedNames);
        const targetPath = path.join(skillsRoot, folderName);
        await cp(sourceRealPath, targetPath, { recursive: true });
        manifestSkills.push({
          name: parsed.name,
          sourcePath: skillPath,
          exportedPath: path.join('skills', folderName),
          storageKind: storageInfo.storageKind,
          linkTarget: storageInfo.linkTarget,
          sha1: createHash('sha1').update(skillContent).digest('hex')
        });
      }

      await writeFile(
        path.join(tempRoot, 'skills-package.json'),
        JSON.stringify(
          {
            name: `skills-package-${new Date().toISOString()}`,
            createdAt: new Date().toISOString(),
            shareTarget: input.shareTarget ?? 'file',
            count: manifestSkills.length,
            skills: manifestSkills
          },
          null,
          2
        ),
        'utf8'
      );

      const outputPath = path.join(exportRoot, `skills-package-${formatTimestampForFile(new Date())}.zip`);
      await createZipFromDirectory(tempRoot, outputPath);
      electronClipboard?.writeText(outputPath);
      if (electronShell) {
        electronShell.showItemInFolder(outputPath);
      }

      return {
        success: true,
        outputPath,
        message: buildPackageMessage(manifestSkills.length, outputPath, input.shareTarget ?? 'file')
      };
    } finally {
      await rm(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }

  async function optimizeSkill(skillPath: string, skillId: string) {
    const directories = await getDirectories();
    const normalizedSkillPath = normalizeUserPath(skillPath);
    assertSkillPathInsideRoots(normalizedSkillPath, directories);

    const skillFilePath = getEditableSkillFilePath(normalizedSkillPath);
    const content = await readFile(skillFilePath, 'utf8');
    const parsed = parseSkillMarkdown({ content, directoryName: path.basename(normalizedSkillPath) });
    const memoryPath = path.join(normalizedSkillPath, '.skills-memory');
    await mkdir(memoryPath, { recursive: true });
    await ensureSkillMemoryReadme(memoryPath, parsed.name);
    await writeFile(skillFilePath, upsertManagedMemoryBlock(content, memoryPath), 'utf8');
    await recordOperation(skillId, 'optimize', 'manager', `注入记忆路径：${memoryPath}`);

    return {
      success: true,
      outputPath: memoryPath,
      message: `已注入记忆路径：${memoryPath}`
    };
  }

  async function setSkillOptimization(skillPath: string, skillId: string, enabled: boolean) {
    if (enabled) {
      const result = await optimizeSkill(skillPath, skillId);
      return {
        ...result,
        message: result.message.replace('已注入记忆路径', '优化记忆已启用')
      };
    }

    const directories = await getDirectories();
    const normalizedSkillPath = normalizeUserPath(skillPath);
    assertSkillPathInsideRoots(normalizedSkillPath, directories, true);

    const skillFilePath = getEditableSkillFilePath(normalizedSkillPath);
    const content = await readFile(skillFilePath, 'utf8');
    const withoutMemory = removeManagedEvolutionBlock(removeManagedMemoryBlock(content));
    await writeFile(skillFilePath, withoutMemory, 'utf8');
    await recordOperation(skillId, 'optimize', 'manager', '移除记忆优化注入');

    return {
      success: true,
      outputPath: path.join(normalizedSkillPath, '.skills-memory'),
      message: '优化记忆已停用，已移除 SKILL.md 中的托管注入'
    };
  }

  async function recordSkillEvolution(skillPath: string, skillId: string, note: string) {
    const normalizedNote = normalizeEvolutionNote(note);
    if (!normalizedNote) throw new Error('沉淀内容不能为空');

    const directories = await getDirectories();
    const normalizedSkillPath = normalizeUserPath(skillPath);
    assertSkillPathInsideRoots(normalizedSkillPath, directories);

    const skillFilePath = path.join(normalizedSkillPath, SKILL_FILE_NAME);
    const content = await readFile(skillFilePath, 'utf8');
    const parsed = parseSkillMarkdown({ content, directoryName: path.basename(normalizedSkillPath) });
    const memoryPath = path.join(normalizedSkillPath, '.skills-memory');
    const evolutionPath = path.join(memoryPath, 'evolution.json');
    await mkdir(memoryPath, { recursive: true });
    await ensureSkillMemoryReadme(memoryPath, parsed.name);

    const store = await readEvolutionStore(evolutionPath, normalizedSkillPath, memoryPath);
    if (!store.entries.some((entry) => normalizeEvolutionNote(entry.note) === normalizedNote)) {
      store.entries.unshift({
        id: createHash('sha1').update(`${normalizedNote}|${Date.now()}`).digest('hex').slice(0, 12),
        note: normalizedNote,
        source: 'manager',
        createdAt: new Date().toISOString()
      });
    }
    store.updatedAt = new Date().toISOString();
    await writeFile(evolutionPath, JSON.stringify(store, null, 2), 'utf8');

    const withMemory = upsertManagedMemoryBlock(content, memoryPath);
    await writeFile(skillFilePath, upsertManagedEvolutionBlock(withMemory, store.entries), 'utf8');
    await recordOperation(skillId, 'optimize', 'manager', `沉淀经验：${normalizedNote}`);

    return {
      success: true,
      outputPath: evolutionPath,
      message: `已沉淀经验到 ${evolutionPath}`
    };
  }

  async function getOperationLogs(): Promise<OperationLogEntry[]> {
    const state = await readState();
    const logs: OperationLogEntry[] = [];

    for (const [skillId, meta] of Object.entries(state.userMeta)) {
      for (const event of meta.usageEvents ?? []) {
        logs.push({
          id: event.id,
          skillId,
          skillName: meta.name ?? skillId,
          skillPath: meta.localPath,
          product: meta.product,
          eventType: event.eventType,
          action: formatOperationAction(event),
          source: event.source,
          timestamp: event.timestamp,
          detail: event.note
        });
      }
    }

    return logs.sort((first, second) => second.timestamp - first.timestamp);
  }

  async function getGithubStarSettings(): Promise<GithubStarSettings> {
    const state = await readState();
    return buildGithubStarSettings(getGithubStarStore(state));
  }

  async function saveGithubStarCredentials(input: GithubStarCredentialsInput): Promise<GithubStarSettings> {
    const token = input.token.trim();
    if (!token) throw new Error('GitHub Token 不能为空');

    const state = await readState();
    const store = getGithubStarStore(state);
    state.githubStars = {
      ...store,
      username: input.username?.trim() || store.username,
      token
    };
    await writeState(state);
    return buildGithubStarSettings(state.githubStars);
  }

  function getGithubAuthHeaders(store: GithubStarStore, mediaType = 'application/vnd.github+json') {
    return {
      ...buildGithubHeaders(store.token),
      Accept: mediaType
    };
  }

  async function syncGithubStars(input: GithubStarSyncInput = {}) {
    if (!githubFetch) throw new Error('当前运行环境不支持 GitHub 网络请求');
    await assertOnlineMode('GitHub Stars 同步');

    const state = await readState();
    const store = getGithubStarStore(state);
    if (!store.token) throw new Error('请先配置 GitHub Token');

    const pages = clampInteger(input.pages ?? 3, 1, 10);
    const perPage = clampInteger(input.perPage ?? 100, 1, 100);
    const sort = input.sort ?? 'updated';
    const repositories = { ...store.repositories };
    let syncedCount = 0;
    let updatedCount = 0;

    for (let page = 1; page <= pages; page += 1) {
      const url = new URL('https://api.github.com/user/starred');
      url.searchParams.set('sort', sort);
      url.searchParams.set('direction', 'desc');
      url.searchParams.set('per_page', String(perPage));
      url.searchParams.set('page', String(page));
      const response = await githubFetch(url.toString(), {
        headers: getGithubAuthHeaders(store, 'application/vnd.github.star+json')
      });
      if (!response.ok) {
        throw new Error(`GitHub Stars 同步失败：HTTP ${response.status}`);
      }

      const payload = await response.json();
      if (!Array.isArray(payload) || payload.length === 0) break;

      for (const item of payload) {
        const repo = mapGithubStarRepository(item, repositories);
        if (!repo) continue;
        if (repo.hasUpdate && !repositories[repo.fullName]?.hasUpdate) updatedCount += 1;
        repositories[repo.fullName] = repo;
        syncedCount += 1;
      }

      if (payload.length < perPage) break;
    }

    const lastSyncedAt = Date.now();
    state.githubStars = {
      ...store,
      repositories,
      lastSyncedAt
    };
    await writeState(state);
    return {
      success: true,
      message: `GitHub Stars 同步完成：${syncedCount} 个仓库，发现 ${updatedCount} 个更新`
    };
  }

  async function listGithubStars(): Promise<GithubStarRepository[]> {
    const state = await readState();
    return sortGithubStarRepositories(Object.values(getGithubStarStore(state).repositories));
  }

  async function updateGithubStarMeta(input: GithubStarMetaInput): Promise<GithubStarRepository> {
    const fullName = input.fullName.trim();
    if (!fullName) throw new Error('仓库名称不能为空');

    const state = await readState();
    const store = getGithubStarStore(state);
    const current = store.repositories[fullName];
    if (!current) throw new Error(`未找到 Star 仓库：${fullName}`);

    const next: GithubStarRepository = {
      ...current,
      tags: input.tags ? normalizeTags(input.tags) : current.tags,
      favorite: input.favorite ?? current.favorite,
      localPath: input.localPath?.trim() || current.localPath
    };
    state.githubStars = {
      ...store,
      repositories: {
        ...store.repositories,
        [fullName]: next
      }
    };
    await writeState(state);
    return next;
  }

  async function searchGithubRepositories(input: GithubRepositorySearchInput = {}): Promise<GithubRecommendedRepository[]> {
    if (!githubFetch) throw new Error('当前运行环境不支持 GitHub 网络请求');
    await assertOnlineMode('GitHub 高星推荐搜索');

    const state = await readState();
    const store = getGithubStarStore(state);
    const minStars = clampInteger(input.minStars ?? 5000, 0, 1_000_000);
    const perPage = clampInteger(input.perPage ?? 20, 1, 100);
    const page = clampInteger(input.page ?? 1, 1, 10);
    const sort = input.sort ?? 'stars';
    const query = [input.query?.trim(), `stars:>=${minStars}`].filter(Boolean).join(' ');
    const url = new URL('https://api.github.com/search/repositories');
    url.searchParams.set('q', query);
    url.searchParams.set('sort', sort);
    url.searchParams.set('order', 'desc');
    url.searchParams.set('per_page', String(perPage));
    url.searchParams.set('page', String(page));

    const response = await githubFetch(url.toString(), {
      headers: buildGithubHeaders(store.token)
    });
    if (!response.ok) throw new Error(`GitHub 高星推荐搜索失败：HTTP ${response.status}`);

    const payload = await response.json();
    const items = isRecord(payload) && Array.isArray(payload.items) ? payload.items : [];
    return items.map(mapGithubRecommendedRepository).filter((repo): repo is GithubRecommendedRepository => Boolean(repo));
  }

  async function starGithubRepository(input: GithubStarRepositoryInput) {
    if (!githubFetch) throw new Error('当前运行环境不支持 GitHub 网络请求');
    await assertOnlineMode('GitHub 加星');

    const fullName = input.fullName.trim();
    if (!fullName || !fullName.includes('/')) throw new Error('仓库名称应为 owner/repo');

    const state = await readState();
    const store = getGithubStarStore(state);
    if (!store.token) throw new Error('请先配置 GitHub Token');

    const response = await githubFetch(`https://api.github.com/user/starred/${fullName}`, {
      method: 'PUT',
      headers: buildGithubHeaders(store.token)
    });
    if (!response.ok && response.status !== 204) {
      throw new Error(`GitHub 加星失败：HTTP ${response.status}`);
    }

    const repo = input.repository ? githubRecommendationToStarRepository(input.repository) : createMinimalGithubRepository(fullName);
    state.githubStars = {
      ...store,
      repositories: {
        ...store.repositories,
        [fullName]: {
          ...store.repositories[fullName],
          ...repo,
          tags: store.repositories[fullName]?.tags ?? [],
          favorite: store.repositories[fullName]?.favorite ?? false,
          starredAt: store.repositories[fullName]?.starredAt ?? new Date().toISOString()
        }
      }
    };
    await writeState(state);

    return { success: true, message: `已加星并同步到本地：${fullName}` };
  }

  async function getGiteeSettings(): Promise<GiteeSettings> {
    const state = await readState();
    return buildGiteeSettings(getGiteeStore(state));
  }

  async function saveGiteeCredentials(input: GiteeCredentialsInput): Promise<GiteeSettings> {
    const token = input.token.trim();
    if (!token) throw new Error('Gitee Token 不能为空');

    const state = await readState();
    const store = getGiteeStore(state);
    state.gitee = {
      ...store,
      username: input.username?.trim() || store.username,
      token
    };
    await writeState(state);
    return buildGiteeSettings(state.gitee);
  }

  async function syncGiteeStars(input: GiteeStarSyncInput = {}) {
    if (!githubFetch) throw new Error('当前运行环境不支持 Gitee 网络请求');
    await assertOnlineMode('Gitee 仓库同步');

    const state = await readState();
    const store = getGiteeStore(state);
    if (!store.token) throw new Error('请先配置 Gitee Token');

    const pages = clampInteger(input.pages ?? 3, 1, 10);
    const perPage = clampInteger(input.perPage ?? 100, 1, 100);
    const branchPages = clampInteger(input.branchPages ?? 10, 1, 20);
    const branchPerPage = clampInteger(input.branchPerPage ?? 100, 1, 100);
    const repositories = { ...store.repositories };
    let syncedCount = 0;
    let starredCount = 0;
    let ownedCount = 0;
    let updatedCount = 0;

    const syncTargets = [
      { endpoint: '/user/starred', failureLabel: 'Gitee 收藏同步', countKey: 'starred' },
      { endpoint: '/user/repos', failureLabel: 'Gitee 我的仓库同步', countKey: 'owned' }
    ] as const;

    for (const target of syncTargets) {
      for (let page = 1; page <= pages; page += 1) {
        const url = buildGiteeUrl(target.endpoint, store.token);
        url.searchParams.set('per_page', String(perPage));
        url.searchParams.set('page', String(page));
        const response = await githubFetch(url.toString(), { headers: buildGiteeHeaders() });
        if (!response.ok) throw new Error(`${target.failureLabel}失败：HTTP ${response.status}`);

        const payload = await response.json();
        const items = Array.isArray(payload) ? payload : isRecord(payload) && Array.isArray(payload.items) ? payload.items : [];
        if (items.length === 0) break;

        for (const item of items) {
          const repo = mapGiteeRepository(item, repositories);
          if (!repo) continue;
          const isNewRepository = !repositories[repo.fullName];
          if (repo.hasUpdate && !repositories[repo.fullName]?.hasUpdate) updatedCount += 1;
          repositories[repo.fullName] = repo;
          if (isNewRepository) syncedCount += 1;
          if (target.countKey === 'starred') starredCount += 1;
          if (target.countKey === 'owned') ownedCount += 1;
        }

        if (items.length < perPage) break;
      }
    }

    for (const [fullName, repository] of Object.entries(repositories)) {
      if (!repository.favorite || !repository.watchBranches) continue;
      const branchResult = await refreshGiteeBranchSnapshot(repository, store.token, branchPages, branchPerPage);
      if (!branchResult) continue;
      if (branchResult.changed && !repository.hasUpdate) updatedCount += 1;
      repositories[fullName] = {
        ...repository,
        lastSeenBranches: branchResult.branches,
        hasUpdate: branchResult.changed || repository.hasUpdate,
        updateBranch: branchResult.changed ? branchResult.primaryBranch : repository.updateBranch,
        branchUpdateSummary: branchResult.changed ? branchResult.summary : repository.branchUpdateSummary,
        updateDetectedAt: branchResult.changed ? Date.now() : repository.updateDetectedAt
      };
    }

    state.gitee = {
      ...store,
      repositories,
      lastSyncedAt: Date.now()
    };
    await writeState(state);
    return {
      success: true,
      message: `Gitee 同步完成：收藏 ${starredCount} 个，我的仓库 ${ownedCount} 个，合并后 ${syncedCount} 个新仓库，发现 ${updatedCount} 个更新`
    };
  }

  async function refreshGiteeBranchSnapshot(
    repository: GiteeRepository,
    token: string | undefined,
    pages: number,
    perPage: number
  ) {
    const [owner, repo] = repository.fullName.split('/');
    if (!owner || !repo) return undefined;

    const branches: Record<string, string> = {};
    for (let page = 1; page <= pages; page += 1) {
      const url = buildGiteeUrl(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches`, token);
      url.searchParams.set('per_page', String(perPage));
      url.searchParams.set('page', String(page));
      const response = await githubFetch(url.toString(), { headers: buildGiteeHeaders() });
      if (!response.ok) throw new Error(`Gitee 分支同步失败：${repository.fullName} HTTP ${response.status}`);

      const payload = await response.json();
      const items = Array.isArray(payload) ? payload : isRecord(payload) && Array.isArray(payload.items) ? payload.items : [];
      for (const item of items) {
        const branch = mapGiteeBranch(item);
        if (branch) branches[branch.name] = branch.sha;
      }

      if (items.length < perPage) break;
    }

    if (Object.keys(branches).length === 0) return undefined;
    const changedBranches = getChangedGiteeBranches(repository.lastSeenBranches, branches);
    return {
      branches,
      changed: changedBranches.length > 0,
      primaryBranch: changedBranches[0],
      summary: formatGiteeBranchUpdateSummary(changedBranches)
    };
  }

  async function listGiteeStars(): Promise<GiteeRepository[]> {
    const state = await readState();
    return sortGiteeRepositories(Object.values(getGiteeStore(state).repositories));
  }

  async function updateGiteeRepoMeta(input: GiteeRepoMetaInput): Promise<GiteeRepository> {
    const fullName = input.fullName.trim();
    if (!fullName) throw new Error('仓库名称不能为空');

    const state = await readState();
    const store = getGiteeStore(state);
    const current = store.repositories[fullName];
    if (!current) throw new Error(`未找到 Gitee 仓库：${fullName}`);

    const next: GiteeRepository = {
      ...current,
      tags: input.tags ? normalizeTags(input.tags) : current.tags,
      favorite: input.watchBranches ? true : input.favorite ?? current.favorite,
      watchBranches: input.favorite === false ? false : input.watchBranches ?? current.watchBranches,
      localPath: input.localPath?.trim() || current.localPath
    };
    state.gitee = {
      ...store,
      repositories: {
        ...store.repositories,
        [fullName]: next
      }
    };
    await writeState(state);
    return next;
  }

  async function tagGiteeRepositoriesByPrefix(input: GiteeBatchTagInput): Promise<GiteeBatchTagResult> {
    const prefix = normalizeGiteeRepositoryPrefix(input);
    const tags = normalizeTags(input.tags);
    if (tags.length === 0) throw new Error('标签不能为空');

    const state = await readState();
    const store = getGiteeStore(state);
    const repositories = { ...store.repositories };
    const matchedRepositories: string[] = [];
    let updatedCount = 0;

    for (const [fullName, repository] of Object.entries(repositories)) {
      if (!fullName.startsWith(prefix)) continue;
      matchedRepositories.push(fullName);
      const nextTags = normalizeTags([...repository.tags, ...tags]);
      if (nextTags.length !== repository.tags.length || nextTags.some((tag, index) => tag !== repository.tags[index])) {
        repositories[fullName] = { ...repository, tags: nextTags };
        updatedCount += 1;
      }
    }

    state.gitee = {
      ...store,
      repositories
    };
    await writeState(state);

    return {
      success: true,
      message:
        matchedRepositories.length === 0
          ? `没有匹配到 Gitee 仓库：${prefix}`
          : `已为 ${matchedRepositories.length} 个 Gitee 仓库添加标签：${tags.join('、')}`,
      matchedCount: matchedRepositories.length,
      updatedCount,
      repositories: matchedRepositories
    };
  }

  async function searchGiteeRepositories(input: GiteeRepositorySearchInput = {}): Promise<GiteeRecommendedRepository[]> {
    if (!githubFetch) throw new Error('当前运行环境不支持 Gitee 网络请求');
    await assertOnlineMode('Gitee 高星推荐搜索');

    const state = await readState();
    const store = getGiteeStore(state);
    const minStars = clampInteger(input.minStars ?? 1000, 0, 1_000_000);
    const perPage = clampInteger(input.perPage ?? 20, 1, 100);
    const page = clampInteger(input.page ?? 1, 1, 10);
    const query = [input.query?.trim(), `stars:>=${minStars}`].filter(Boolean).join(' ');
    const url = buildGiteeUrl('/search/repositories', store.token);
    url.searchParams.set('q', query);
    url.searchParams.set('sort', 'stars_count');
    url.searchParams.set('order', 'desc');
    url.searchParams.set('per_page', String(perPage));
    url.searchParams.set('page', String(page));

    const response = await githubFetch(url.toString(), { headers: buildGiteeHeaders() });
    if (!response.ok) throw new Error(`Gitee 高星推荐搜索失败：HTTP ${response.status}`);

    const payload = await response.json();
    const items = Array.isArray(payload) ? payload : isRecord(payload) && Array.isArray(payload.items) ? payload.items : [];
    return items.map(mapGiteeRecommendedRepository).filter((repo): repo is GiteeRecommendedRepository => Boolean(repo));
  }

  async function saveGiteeRepository(input: { fullName: string }) {
    const fullName = normalizeGiteeRepositoryName(input.fullName);
    if (!fullName || !fullName.includes('/')) throw new Error('仓库名称应为 owner/repo');

    const state = await readState();
    const store = getGiteeStore(state);
    if (store.repositories[fullName]) {
      return { success: true, message: `本地已收藏：${fullName}` };
    }
    state.gitee = {
      ...store,
      repositories: { ...store.repositories, [fullName]: createMinimalGiteeRepository(fullName) }
    };
    await writeState(state);
    return { success: true, message: `已收藏到本地：${fullName}` };
  }

  async function starGiteeRepository(input: GiteeStarRepositoryInput) {
    if (!githubFetch) throw new Error('当前运行环境不支持 Gitee 网络请求');
    await assertOnlineMode('Gitee 收藏');

    const fullName = normalizeGiteeRepositoryName(input.fullName);
    if (!fullName || !fullName.includes('/')) throw new Error('仓库名称应为 owner/repo');

    const state = await readState();
    const store = getGiteeStore(state);
    if (!store.token) throw new Error('请先配置 Gitee Token');

    const url = buildGiteeUrl(`/user/starred/${fullName}`, store.token);
    const response = await githubFetch(url.toString(), {
      method: 'PUT',
      headers: buildGiteeHeaders()
    });
    if (!response.ok && response.status !== 204) {
      throw new Error(`Gitee 收藏失败：HTTP ${response.status}`);
    }

    const repo = input.repository ? giteeRecommendationToRepository(input.repository) : createMinimalGiteeRepository(fullName);
    state.gitee = {
      ...store,
      repositories: {
        ...store.repositories,
        [fullName]: {
          ...store.repositories[fullName],
          ...repo,
          tags: store.repositories[fullName]?.tags ?? [],
          favorite: store.repositories[fullName]?.favorite ?? false,
          starredAt: store.repositories[fullName]?.starredAt ?? new Date().toISOString()
        }
      }
    };
    await writeState(state);

    return { success: true, message: `已收藏并同步到本地：${fullName}` };
  }

  async function updateSkillUserMeta(skillId: string, input: UpdateMetaInput) {
    const state = await readState();
    const current = state.userMeta[skillId] ?? createEmptyMeta(skillId);
    state.userMeta[skillId] = {
      ...current,
      favorite: input.favorite ?? current.favorite,
      tags: input.tags ? normalizeTags(input.tags) : current.tags
    };
    await writeState(state);
    return state.userMeta[skillId];
  }

  async function recordUsage(
    skillId: string,
    eventType: SkillUsageEvent['eventType'] = 'manualCall',
    source: SkillUsageEvent['source'] = 'manager',
    note?: string
  ) {
    return appendSkillUsageEvent(skillId, eventType, source, note, ['manualCall', 'agentCall'].includes(eventType));
  }

  async function recordOperation(
    skillId: string,
    eventType: SkillUsageEvent['eventType'],
    source: SkillUsageEvent['source'],
    note?: string
  ) {
    return appendSkillUsageEvent(skillId, eventType, source, note, false);
  }

  async function appendSkillUsageEvent(
    skillId: string,
    eventType: SkillUsageEvent['eventType'],
    source: SkillUsageEvent['source'],
    note: string | undefined,
    incrementCallCount: boolean
  ) {
    const state = await readState();
    const current = state.userMeta[skillId] ?? createEmptyMeta(skillId);
    const timestamp = Date.now();
    const event: SkillUsageEvent = {
      id: `usage_${timestamp}_${Math.random().toString(36).slice(2, 8)}`,
      skillId,
      eventType,
      source,
      timestamp,
      note
    };

    state.userMeta[skillId] = {
      ...current,
      callCount: incrementCallCount ? current.callCount + 1 : current.callCount,
      lastCalledAt: incrementCallCount ? timestamp : current.lastCalledAt,
      usageEvents: [event, ...current.usageEvents].slice(0, 200)
    };
    await writeState(state);
    return state.userMeta[skillId];
  }

  async function clearSkillCallUsageStats(skillId: string) {
    const state = await readState();
    const current = state.userMeta[skillId] ?? createEmptyMeta(skillId);
    state.userMeta[skillId] = {
      ...current,
      callCount: 0,
      lastCalledAt: undefined,
      usageEvents: current.usageEvents.filter((event) => !['manualCall', 'agentCall'].includes(event.eventType))
    };
    await writeState(state);
    return state.userMeta[skillId];
  }

  async function scanSkillSecurity(skillPath: string, skillId: string): Promise<SecurityReport> {
    const directories = await getDirectories();
    const normalizedSkillPath = normalizeUserPath(skillPath);
    assertSkillPathInsideRoots(normalizedSkillPath, directories, true);
    const files = await readScannableFiles(normalizedSkillPath);
    const report = scanSecurityFiles(skillId, files);
    const state = await readState();
    storeSecurityReport(state, skillId, report);
    await writeState(state);
    return report;
  }

  async function scanAllSecurity() {
    const skills = await scanSkills();
    const state = await readState();
    const reports: SecurityReport[] = [];
    for (const skill of skills) {
      const files = await readScannableFiles(skill.localPath);
      const report = scanSecurityFiles(skill.id, files);
      storeSecurityReport(state, skill.id, report);
      reports.push(report);
    }
    await writeState(state);
    return reports;
  }

  function storeSecurityReport(state: AppState, skillId: string, report: SecurityReport) {
    const current = state.userMeta[skillId] ?? createEmptyMeta(skillId);
    const timestamp = Date.now();
    const scanEvent: SkillUsageEvent = { id: `scan_${timestamp}`, skillId, eventType: 'scan', source: 'manager', timestamp };
    state.userMeta[skillId] = {
      ...current,
      securityReport: report,
      usageEvents: [scanEvent, ...current.usageEvents].slice(0, 200)
    };
  }

  function getDefaultDirectories(state?: AppState): SkillDirectory[] {
    const fallbackDirectories = getFallbackDefaultDirectories();
    const savedDirectories = state?.defaultDirectories ?? [];
    if (savedDirectories.length === 0) return fallbackDirectories;

    const fallbackIds = new Set(fallbackDirectories.map((directory) => directory.id));
    const savedById = new Map<string, SkillDirectory>();
    const savedExtras: SkillDirectory[] = [];
    for (const directory of savedDirectories) {
      const id = sanitizeIdentifier(directory.id) || createCustomDirectoryId(directory.path);
      if (fallbackIds.has(id)) {
        savedById.set(id, directory);
      } else {
        savedExtras.push(directory);
      }
    }

    const mergedDirectories = fallbackDirectories.map((fallbackDirectory) => {
      const savedDirectory = savedById.get(fallbackDirectory.id);
      if (!savedDirectory) return fallbackDirectory;
      return normalizeDefaultDirectory(savedDirectory, fallbackDirectory);
    });

    return [
      ...mergedDirectories,
      ...savedExtras.map((directory) => normalizeDefaultDirectory(directory))
    ];
  }

  function getActiveDefaultDirectories(state?: AppState): SkillDirectory[] {
    return getDefaultDirectories(state).filter((directory) => directory.enabled && existsSync(expandHome(directory.path)));
  }

  function getFallbackDefaultDirectories(): SkillDirectory[] {
    return DEFAULT_MODULE_DEFINITIONS.map((definition) => ({
      id: definition.productId,
      label: definition.label,
      product: productFromDirectoryId(definition.productId),
      path: path.join(homeDir, ...definition.relativePath),
      enabled: true,
      builtIn: true,
      tags: []
    }));
  }

  function normalizeDefaultDirectory(directory: SkillDirectory, fallbackDirectory?: SkillDirectory): SkillDirectory {
    const id = fallbackDirectory?.id ?? (sanitizeIdentifier(directory.id) || createCustomDirectoryId(directory.path));
    return {
      ...fallbackDirectory,
      ...directory,
      id,
      label: directory.label.trim() || fallbackDirectory?.label || '默认目录',
      product: productFromDirectoryId(id),
      path: expandHome(directory.path || fallbackDirectory?.path || ''),
      enabled: directory.enabled !== false,
      builtIn: true,
      tags: normalizeTags(directory.tags ?? fallbackDirectory?.tags)
    };
  }

  function expandHome(value: string) {
    if (value.startsWith('~')) return path.join(homeDir, value.slice(1));
    return value;
  }

  async function readState(): Promise<AppState> {
    if (!existsSync(statePath)) return createEmptyState();

    try {
      const parsed = JSON.parse(await readFile(statePath, 'utf8')) as Partial<AppState>;
      return {
        defaultDirectories: parsed.defaultDirectories ?? [],
        customDirectories: parsed.customDirectories ?? [],
        userMeta: parsed.userMeta ?? {},
        marketplaceSkills: normalizeMarketplaceSkills(parsed.marketplaceSkills),
        appSettings: normalizeAppSettings(parsed.appSettings),
        githubStars: parsed.githubStars
          ? {
              username: parsed.githubStars.username,
              token: parsed.githubStars.token,
              lastSyncedAt: parsed.githubStars.lastSyncedAt,
              repositories: parsed.githubStars.repositories ?? {}
            }
          : undefined,
        gitee: parsed.gitee
          ? {
              username: parsed.gitee.username,
              token: parsed.gitee.token,
              lastSyncedAt: parsed.gitee.lastSyncedAt,
              repositories: parsed.gitee.repositories ?? {}
            }
          : undefined
      };
    } catch {
      throw new Error('本地配置文件损坏或不可读，请检查：' + statePath);
    }
  }

  async function writeState(state: AppState) {
    await mkdir(stateDir, { recursive: true });
    const tempPath = path.join(
      stateDir,
      `skills.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`
    );
    try {
      await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
      await rename(tempPath, statePath);
    } finally {
      await rm(tempPath, { force: true });
    }
  }

  function serializeMutation<Args extends unknown[], Result>(operation: (...args: Args) => Promise<Result>) {
    return (...args: Args): Promise<Result> => {
      const result = mutationQueue.then(
        () => operation(...args),
        () => operation(...args)
      );
      mutationQueue = result.then(
        () => undefined,
        () => undefined
      );
      return result;
    };
  }

  return {
    getAppSettings,
    saveAppSettings: serializeMutation(saveAppSettings),
    getDirectories,
    saveDefaultDirectories: serializeMutation(saveDefaultDirectories),
    saveCustomDirectories: serializeMutation(saveCustomDirectories),
    getDefaultModuleCandidates,
    createModule: serializeMutation(createModule),
    removeModule: serializeMutation(removeModule),
    scanSkills: serializeMutation(scanSkills),
    readSkill,
    setSkillEnabled: serializeMutation(setSkillEnabled),
    setSkillCallTracking: serializeMutation(setSkillCallTracking),
    recordSkillCall: serializeMutation(recordSkillCall),
    openFolder,
    uninstallSkill: serializeMutation(uninstallSkill),
    importLocalSkill: serializeMutation(importLocalSkill),
    importGithubSkill: serializeMutation(importGithubSkill),
    syncSkillToDirectory: serializeMutation(syncSkillToDirectory),
    syncRepositoryModule: serializeMutation(syncRepositoryModule),
    createGithubSkill: serializeMutation(createGithubSkill),
    checkGithubSkillUpdates: serializeMutation(checkGithubSkillUpdates),
    updateGithubSkill: serializeMutation(updateGithubSkill),
    listMarketplaceSkills,
    addMarketplaceSkill: serializeMutation(addMarketplaceSkill),
    removeMarketplaceSkill: serializeMutation(removeMarketplaceSkill),
    installMarketplaceSkill: serializeMutation(installMarketplaceSkill),
    shareMarketplaceSkill,
    getOperationLogs,
    getGithubStarSettings,
    saveGithubStarCredentials: serializeMutation(saveGithubStarCredentials),
    syncGithubStars: serializeMutation(syncGithubStars),
    listGithubStars,
    updateGithubStarMeta: serializeMutation(updateGithubStarMeta),
    searchGithubRepositories,
    starGithubRepository: serializeMutation(starGithubRepository),
    getGiteeSettings,
    saveGiteeCredentials: serializeMutation(saveGiteeCredentials),
    syncGiteeStars: serializeMutation(syncGiteeStars),
    listGiteeStars,
    updateGiteeRepoMeta: serializeMutation(updateGiteeRepoMeta),
    tagGiteeRepositoriesByPrefix: serializeMutation(tagGiteeRepositoriesByPrefix),
    searchGiteeRepositories,
    starGiteeRepository: serializeMutation(starGiteeRepository),
    saveGiteeRepository: serializeMutation(saveGiteeRepository),
    packageSkills: serializeMutation(packageSkills),
    optimizeSkill: serializeMutation(optimizeSkill),
    setSkillOptimization: serializeMutation(setSkillOptimization),
    recordSkillEvolution: serializeMutation(recordSkillEvolution),
    updateSkillUserMeta: serializeMutation(updateSkillUserMeta),
    recordUsage: serializeMutation(recordUsage),
    scanSkillSecurity: serializeMutation(scanSkillSecurity),
    scanAllSecurity: serializeMutation(scanAllSecurity)
  };
}

async function gitOutput(args: string[], cwd?: string) {
  const result = await execFileAsync('git', args, cwd ? { cwd, timeout: 120_000 } : { timeout: 120_000 });
  return String(result.stdout);
}

function deriveRepositoryName(repoUrl: string) {
  const normalized = repoUrl.trim().replace(/[\\/]+$/, '');
  return normalized.split(/[\\/]/).pop()?.replace(/\.git$/i, '') || 'github-skill';
}

function buildNpxPackageSpec(packageName: string, versionRange?: string) {
  if (isLocalPackagePath(packageName)) return normalizeUserPath(packageName);
  const version = versionRange?.trim();
  return version ? `${packageName}@${version}` : packageName;
}

function isLocalPackagePath(value: string) {
  const trimmed = value.trim();
  if (existsSync(trimmed)) return true;
  if (trimmed.startsWith('./') || trimmed.startsWith('../') || trimmed.startsWith('.\\') || trimmed.startsWith('..\\')) return true;
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) return true;
  if (/^[A-Za-z]:[\\/]/.test(trimmed)) return true;
  if (path.isAbsolute(trimmed)) return true;
  if (trimmed.includes('\\') || trimmed.includes('/')) return existsSync(path.resolve(trimmed));
  return false;
}

async function runNpm(args: string[]) {
  const npmCliPath = process.env.npm_execpath;
  if (npmCliPath && existsSync(npmCliPath)) {
    return execFileAsync(process.execPath, [npmCliPath, ...args], { timeout: 120_000 });
  }
  return execFileAsync(getNpmCommand(), args, { timeout: 120_000, shell: process.platform === 'win32' });
}

function getNpmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function normalizeBranchName(branch: string) {
  return branch && branch !== 'HEAD' ? branch : 'HEAD';
}

async function readRepositoryReadme(repositoryPath: string, repoName: string) {
  const candidates = ['README.md', 'README.MD', 'readme.md', 'Readme.md'];
  for (const candidate of candidates) {
    const readmePath = path.join(repositoryPath, candidate);
    if (existsSync(readmePath)) return readFile(readmePath, 'utf8');
  }
  return `# ${repoName}\n\n此仓库未提供 README，已由ai省钱大师生成占位说明。\n`;
}

async function appendGitInfoExclude(repositoryPath: string, ignoreRule: string) {
  const excludePath = path.join(repositoryPath, '.git', 'info', 'exclude');
  const currentContent = existsSync(excludePath) ? await readFile(excludePath, 'utf8') : '';
  const normalizedRule = ignoreRule.replace(/\\/g, '/').replace(/^\/+/, '');
  if (currentContent.split(/\r?\n/).map((line) => line.trim()).includes(normalizedRule)) return;
  const separator = currentContent.endsWith('\n') || currentContent.length === 0 ? '' : '\n';
  await writeFile(excludePath, `${currentContent}${separator}${normalizedRule}\n`, 'utf8');
}

async function refreshGithubSkillWrappersFromRepository(repositoryPath: string) {
  const skillDirectories = await discoverSkillDirectories(repositoryPath);
  if (skillDirectories.length === 0) return 0;

  const latestHash = (await gitOutput(['-C', repositoryPath, 'rev-parse', 'HEAD'])).trim();
  const branch = normalizeBranchName((await gitOutput(['-C', repositoryPath, 'rev-parse', '--abbrev-ref', 'HEAD'])).trim());
  let refreshedCount = 0;

  for (const skillDirectory of skillDirectories) {
    const skillFilePath = path.join(skillDirectory, SKILL_FILE_NAME);
    const content = await readFile(skillFilePath, 'utf8');
    const metadata = parseGithubSkillMetadata(content);
    if (metadata.sourceType !== 'github-to-skills' || !metadata.githubUrl) continue;

    const repoName = deriveRepositoryName(metadata.githubUrl);
    await mkdir(path.join(skillDirectory, 'references'), { recursive: true });
    await writeFile(path.join(skillDirectory, 'references', 'README.md'), await readRepositoryReadme(repositoryPath, repoName), 'utf8');
    await writeFile(
      skillFilePath,
      upsertFrontmatterValues(content, {
        github_branch: branch,
        github_hash: latestHash,
        github_last_synced_at: new Date().toISOString()
      }),
      'utf8'
    );
    await writeSkillMetadata(skillDirectory, { source: 'github', sourceUrl: metadata.githubUrl, installDate: Date.now() });
    refreshedCount += 1;
  }

  return refreshedCount;
}

function buildGithubSkillMarkdown(skillName: string, repoName: string, repoUrl: string, branch: string, hash: string) {
  return [
    '---',
    `name: ${skillName}`,
    `description: 将 GitHub 仓库 ${repoName} 包装成本地可复用 Skill。`,
    'source_type: github-to-skills',
    `github_url: ${repoUrl}`,
    `github_branch: ${branch}`,
    `github_hash: ${hash}`,
    'github_path: /',
    'generated_by: windows-skills-manager',
    '---',
    '',
    `# ${skillName}`,
    '',
    '## 使用方式',
    '',
    '- 先阅读 `references/README.md`，理解原仓库的能力边界、输入输出和限制。',
    '- 需要代码级资料时，回到 `github_url` 对应仓库查看最新实现；本 Skill 只保存包装入口和本地记忆。',
    '- 如果使用中产生稳定偏好、失败教训或最佳实践，通过ai省钱大师沉淀到 `.skills-memory/evolution.json`。',
    '',
    '## 仓库同步',
    '',
    '- `github_url` 是来源真相，`github_hash` 是当前包装版本。',
    '- 在导入页使用“检查仓库技能更新”和“同步”刷新 references 与 hash 元数据。',
    ''
  ].join('\n');
}

function parseGithubSkillMetadata(content: string): GithubSkillMetadata {
  const values = readFrontmatterValues(content);
  return {
    githubUrl: values.github_url,
    githubBranch: values.github_branch,
    githubHash: values.github_hash,
    sourceType: values.source_type
  };
}

function readFrontmatterValues(content: string) {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return {} as Record<string, string>;

  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (endIndex < 0) return {} as Record<string, string>;

  const values: Record<string, string> = {};
  for (const rawLine of lines.slice(1, endIndex)) {
    const match = rawLine.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!match) continue;
    values[match[1].trim()] = unquoteFrontmatterValue(match[2].trim());
  }
  return values;
}

function upsertFrontmatterValues(content: string, updates: Record<string, string>) {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') {
    return ['---', ...Object.entries(updates).map(([key, value]) => `${key}: ${value}`), '---', '', content].join('\n');
  }

  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (endIndex < 0) return content;

  const seen = new Set<string>();
  const frontmatterLines = lines.slice(1, endIndex).map((line) => {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!match) return line;
    const key = match[1].trim();
    if (!(key in updates)) return line;
    seen.add(key);
    return `${key}: ${updates[key]}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) frontmatterLines.push(`${key}: ${value}`);
  }

  return ['---', ...frontmatterLines, '---', ...lines.slice(endIndex + 1)].join('\n');
}

function unquoteFrontmatterValue(value: string) {
  return value.replace(/^['"]|['"]$/g, '').trim();
}

async function resolveRemoteHash(repoUrl: string, branch: string) {
  const ref = branch && branch !== 'HEAD' ? `refs/heads/${branch}` : 'HEAD';
  const output = await gitOutput(['ls-remote', repoUrl, ref]);
  const firstLine = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  const hash = firstLine?.split(/\s+/)[0];
  if (!hash) throw new Error(`未获取到远端 hash：${repoUrl} ${branch}`);
  return hash;
}

async function readEvolutionStore(
  evolutionPath: string,
  skillPath: string,
  memoryPath: string
): Promise<SkillEvolutionStore> {
  if (!existsSync(evolutionPath)) return createEmptyEvolutionStore(skillPath, memoryPath);

  try {
    const parsed = JSON.parse(await readFile(evolutionPath, 'utf8')) as Partial<SkillEvolutionStore>;
    return {
      version: 1,
      skillPath,
      memoryPath,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      entries: Array.isArray(parsed.entries)
        ? parsed.entries
            .filter((entry) => entry && typeof entry.note === 'string')
            .map((entry) => ({
              id: typeof entry.id === 'string' ? entry.id : createHash('sha1').update(entry.note).digest('hex').slice(0, 12),
              note: normalizeEvolutionNote(entry.note),
              source: 'manager' as const,
              createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date().toISOString()
            }))
            .filter((entry) => entry.note)
        : []
    };
  } catch {
    return createEmptyEvolutionStore(skillPath, memoryPath);
  }
}

function createEmptyEvolutionStore(skillPath: string, memoryPath: string): SkillEvolutionStore {
  return {
    version: 1,
    skillPath,
    memoryPath,
    updatedAt: new Date().toISOString(),
    entries: []
  };
}

function upsertManagedEvolutionBlock(content: string, entries: SkillEvolutionEntry[]) {
  const entryLines = entries.length
    ? entries.slice(0, 20).map((entry) => `- ${entry.note}`)
    : ['- 暂无。'];
  const block = [
    EVOLUTION_BLOCK_START,
    '## User-Learned Best Practices & Constraints / 用户沉淀经验与约束',
    '',
    ...entryLines,
    EVOLUTION_BLOCK_END
  ].join('\n');

  const blockPattern = new RegExp(`${escapeRegExp(EVOLUTION_BLOCK_START)}[\\s\\S]*?${escapeRegExp(EVOLUTION_BLOCK_END)}`);
  if (blockPattern.test(content)) {
    return content.replace(blockPattern, block);
  }
  const separator = content.endsWith('\n') ? '\n' : '\n\n';
  return `${content}${separator}${block}\n`;
}

function normalizeEvolutionNote(note: string) {
  return note.replace(/\s+/g, ' ').trim();
}

function formatOperationAction(event: SkillUsageEvent) {
  if (event.eventType === 'manualCall') return '记录调用';
  if (event.eventType === 'view') return '查看详情';
  if (event.eventType === 'openFolder') return '打开目录';
  if (event.eventType === 'scan') return '安全扫描';
  if (event.eventType === 'agentCall') return 'Agent 调用';
  if (event.eventType === 'optimize') {
    if (event.note?.startsWith('沉淀经验')) return '沉淀经验';
    if (event.note?.startsWith('同步仓库技能')) return '同步仓库技能';
    return '优化记忆';
  }
  return '系统操作';
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function createEmptyState(): AppState {
  return { defaultDirectories: [], customDirectories: [], userMeta: {}, marketplaceSkills: [] };
}

function buildCustomMarketplaceSkill(input: MarketplaceAddInput): MarketplaceSkill {
  const repoUrl = normalizeMarketplaceUrl(input.repoUrl);
  const derived = deriveMarketplaceProjectInfo(repoUrl);
  const name = input.name?.trim() || derived.name;
  if (!name) throw new Error('云端项目名称不能为空');

  return {
    id: `custom_${createHash('sha1').update(repoUrl.toLowerCase()).digest('hex').slice(0, 12)}`,
    name,
    description: input.description?.trim() || '手动收藏的云端项目，可从社区市场安装或分享。',
    author: input.author?.trim() || derived.author,
    repoUrl,
    tags: normalizeTags(input.tags),
    custom: true
  };
}

function normalizeMarketplaceSkills(items: unknown): MarketplaceSkill[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item): MarketplaceSkill | undefined => {
      if (!isRecord(item)) return undefined;
      const repoUrl = stringValue(item.repoUrl);
      if (!repoUrl) return undefined;
      try {
        const normalizedUrl = normalizeMarketplaceUrl(repoUrl);
        const derived = deriveMarketplaceProjectInfo(normalizedUrl);
        return {
          id:
            stringValue(item.id) ||
            `custom_${createHash('sha1').update(normalizedUrl.toLowerCase()).digest('hex').slice(0, 12)}`,
          name: stringValue(item.name) || derived.name,
          description: stringValue(item.description) || '手动收藏的云端项目，可从社区市场安装或分享。',
          author: stringValue(item.author) || derived.author,
          repoUrl: normalizedUrl,
          tags: normalizeTags(Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : []),
          installCount: typeof item.installCount === 'number' ? item.installCount : undefined,
          custom: true
        } satisfies MarketplaceSkill;
      } catch {
        return undefined;
      }
    })
    .filter((item): item is MarketplaceSkill => Boolean(item));
}

function normalizeMarketplaceUrl(value: string) {
  const trimmed = value.trim().replace(/[\\/]+$/, '');
  if (!trimmed) throw new Error('云端项目地址不能为空');
  const url = new URL(trimmed);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('云端项目地址只支持 http/https');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/[\\/]+$/, '').replace(/\.git$/i, '');
}

function deriveMarketplaceProjectInfo(repoUrl: string) {
  const url = new URL(repoUrl);
  const segments = url.pathname.split('/').map((segment) => segment.trim()).filter(Boolean);
  return {
    name: segments.at(-1)?.replace(/\.git$/i, '') || url.hostname,
    author: segments.at(-2) || url.hostname
  };
}

function isSameMarketplaceUrl(first: string, second: string) {
  try {
    return normalizeMarketplaceUrl(first).toLowerCase() === normalizeMarketplaceUrl(second).toLowerCase();
  } catch {
    return first.trim().toLowerCase() === second.trim().toLowerCase();
  }
}

function normalizeAppSettings(settings?: Partial<AppSettings>): AppSettings {
  return {
    offlineMode: Boolean(settings?.offlineMode)
  };
}

function createEmptyMeta(skillId: string, metadata?: Partial<SkillUserMeta>): SkillUserMeta {
  return {
    skillId,
    favorite: false,
    tags: [],
    callCount: 0,
    usageEvents: [],
    ...metadata
  };
}

function getGithubStarStore(state: AppState): GithubStarStore {
  return state.githubStars ?? { repositories: {} };
}

function buildGithubStarSettings(store: GithubStarStore): GithubStarSettings {
  const repositories = Object.values(store.repositories);
  const tags = new Set(repositories.flatMap((repo) => repo.tags));
  return {
    username: store.username,
    tokenConfigured: Boolean(store.token),
    lastSyncedAt: store.lastSyncedAt,
    repositoryCount: repositories.length,
    tagCount: tags.size,
    updatedCount: repositories.filter((repo) => repo.hasUpdate).length
  };
}

function getGiteeStore(state: AppState): GiteeStarStore {
  return state.gitee ?? { repositories: {} };
}

function buildGiteeSettings(store: GiteeStarStore): GiteeSettings {
  const repositories = Object.values(store.repositories);
  const tags = new Set(repositories.flatMap((repo) => repo.tags));
  return {
    username: store.username,
    tokenConfigured: Boolean(store.token),
    lastSyncedAt: store.lastSyncedAt,
    repositoryCount: repositories.length,
    tagCount: tags.size,
    updatedCount: repositories.filter((repo) => repo.hasUpdate).length
  };
}

function mapGithubStarRepository(
  item: unknown,
  existingRepositories: Record<string, GithubStarRepository>
): GithubStarRepository | undefined {
  if (!isRecord(item)) return undefined;
  const repoPayload = isRecord(item.repo) ? item.repo : item;
  const fullName = stringValue(repoPayload.full_name);
  if (!fullName) return undefined;
  const existing = existingRepositories[fullName];
  const owner = isRecord(repoPayload.owner) ? stringValue(repoPayload.owner.login) : fullName.split('/')[0] ?? '';
  const pushedAt = stringValue(repoPayload.pushed_at);
  const previousPushedAt = existing?.lastSeenPushedAt;
  const pushedChanged = Boolean(previousPushedAt && pushedAt && pushedAt !== previousPushedAt);

  return {
    id: numberValue(repoPayload.id),
    fullName,
    name: stringValue(repoPayload.name) || fullName.split('/').pop() || fullName,
    owner,
    description: stringValue(repoPayload.description),
    htmlUrl: stringValue(repoPayload.html_url),
    cloneUrl: stringValue(repoPayload.clone_url),
    language: stringValue(repoPayload.language) || undefined,
    topics: arrayOfStrings(repoPayload.topics),
    stars: numberValue(repoPayload.stargazers_count),
    forks: numberValue(repoPayload.forks_count),
    openIssues: numberValue(repoPayload.open_issues_count),
    private: Boolean(repoPayload.private),
    archived: Boolean(repoPayload.archived),
    pushedAt,
    updatedAt: stringValue(repoPayload.updated_at),
    starredAt: stringValue(item.starred_at),
    tags: existing?.tags ?? [],
    favorite: existing?.favorite ?? false,
    localPath: existing?.localPath,
    lastSeenPushedAt: pushedAt || existing?.lastSeenPushedAt,
    hasUpdate: pushedChanged || existing?.hasUpdate || false,
    updateDetectedAt: pushedChanged ? Date.now() : existing?.updateDetectedAt
  } satisfies GithubStarRepository;
}

function mapGithubRecommendedRepository(item: unknown): GithubRecommendedRepository | undefined {
  if (!isRecord(item)) return undefined;
  const fullName = stringValue(item.full_name);
  if (!fullName) return undefined;
  const owner = isRecord(item.owner) ? stringValue(item.owner.login) : fullName.split('/')[0] ?? '';
  return {
    id: numberValue(item.id),
    fullName,
    name: stringValue(item.name) || fullName.split('/').pop() || fullName,
    owner,
    description: stringValue(item.description),
    htmlUrl: stringValue(item.html_url),
    cloneUrl: stringValue(item.clone_url),
    language: stringValue(item.language) || undefined,
    topics: arrayOfStrings(item.topics),
    stars: numberValue(item.stargazers_count),
    forks: numberValue(item.forks_count),
    openIssues: numberValue(item.open_issues_count),
    private: Boolean(item.private),
    archived: Boolean(item.archived),
    pushedAt: stringValue(item.pushed_at),
    updatedAt: stringValue(item.updated_at),
    score: typeof item.score === 'number' ? item.score : undefined
  } satisfies GithubRecommendedRepository;
}

function githubRecommendationToStarRepository(repository: GithubRecommendedRepository): GithubStarRepository {
  return {
    ...repository,
    tags: [],
    favorite: false,
    starredAt: new Date().toISOString(),
    lastSeenPushedAt: repository.pushedAt,
    hasUpdate: false
  };
}

function createMinimalGithubRepository(fullName: string): GithubStarRepository {
  return {
    id: 0,
    fullName,
    name: fullName.split('/').pop() || fullName,
    owner: fullName.split('/')[0] || '',
    description: '',
    htmlUrl: `https://github.com/${fullName}`,
    cloneUrl: `https://github.com/${fullName}.git`,
    topics: [],
    stars: 0,
    forks: 0,
    openIssues: 0,
    private: false,
    archived: false,
    starredAt: new Date().toISOString(),
    tags: [],
    favorite: false,
    hasUpdate: false
  };
}

function buildGithubHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function sortGithubStarRepositories(repositories: GithubStarRepository[]) {
  return [...repositories].sort((first, second) => {
    if (first.hasUpdate !== second.hasUpdate) return first.hasUpdate ? -1 : 1;
    if (first.favorite !== second.favorite) return first.favorite ? -1 : 1;
    return Date.parse(second.pushedAt ?? second.updatedAt ?? '') - Date.parse(first.pushedAt ?? first.updatedAt ?? '');
  });
}

function mapGiteeRepository(item: unknown, existingRepositories: Record<string, GiteeRepository>): GiteeRepository | undefined {
  if (!isRecord(item)) return undefined;
  const repoPayload = isRecord(item.repo) ? item.repo : item;
  const fullName = resolveGiteeFullName(repoPayload);
  if (!fullName) return undefined;

  const existing = existingRepositories[fullName];
  const pushedAt = stringValue(repoPayload.pushed_at);
  const previousPushedAt = existing?.lastSeenPushedAt;
  const pushedChanged = Boolean(previousPushedAt && pushedAt && pushedAt !== previousPushedAt);

  return {
    ...mapGiteeRepositoryBase(repoPayload, fullName),
    starredAt: stringValue(item.starred_at) || existing?.starredAt,
    tags: existing?.tags ?? [],
    favorite: existing?.favorite ?? false,
    watchBranches: existing?.watchBranches ?? false,
    localPath: existing?.localPath,
    lastSeenPushedAt: pushedAt || existing?.lastSeenPushedAt,
    lastSeenBranches: existing?.lastSeenBranches,
    hasUpdate: pushedChanged || existing?.hasUpdate || false,
    updateBranch: existing?.updateBranch,
    branchUpdateSummary: existing?.branchUpdateSummary,
    updateDetectedAt: pushedChanged ? Date.now() : existing?.updateDetectedAt
  } satisfies GiteeRepository;
}

function mapGiteeRecommendedRepository(item: unknown): GiteeRecommendedRepository | undefined {
  if (!isRecord(item)) return undefined;
  const fullName = resolveGiteeFullName(item);
  if (!fullName) return undefined;
  return mapGiteeRepositoryBase(item, fullName) satisfies GiteeRecommendedRepository;
}

function mapGiteeRepositoryBase(repoPayload: Record<string, unknown>, fullName: string): GiteeRecommendedRepository {
  const namespace = isRecord(repoPayload.namespace) ? repoPayload.namespace : undefined;
  const ownerPayload = isRecord(repoPayload.owner) ? repoPayload.owner : undefined;
  const owner =
    stringValue(namespace?.path) ||
    stringValue(namespace?.name) ||
    stringValue(ownerPayload?.login) ||
    stringValue(ownerPayload?.name) ||
    fullName.split('/')[0] ||
    '';

  return {
    id: numberValue(repoPayload.id),
    fullName,
    name: stringValue(repoPayload.path) || stringValue(repoPayload.name) || fullName.split('/').pop() || fullName,
    owner,
    description: stringValue(repoPayload.description),
    htmlUrl: stringValue(repoPayload.html_url) || `https://gitee.com/${fullName}`,
    cloneUrl: stringValue(repoPayload.clone_url) || stringValue(repoPayload.git_url) || `https://gitee.com/${fullName}.git`,
    language: stringValue(repoPayload.language) || undefined,
    topics: arrayOfGiteeTopics(repoPayload.tags ?? repoPayload.topics),
    stars: numberValue(repoPayload.stargazers_count) || numberValue(repoPayload.stars_count) || numberValue(repoPayload.watchers_count),
    forks: numberValue(repoPayload.forks_count),
    openIssues: numberValue(repoPayload.open_issues_count) || numberValue(repoPayload.issues_count),
    private: Boolean(repoPayload.private),
    pushedAt: stringValue(repoPayload.pushed_at),
    updatedAt: stringValue(repoPayload.updated_at)
  };
}

function mapGiteeBranch(item: unknown) {
  if (!isRecord(item)) return undefined;
  const name = stringValue(item.name);
  const commitPayload = isRecord(item.commit) ? item.commit : undefined;
  const sha =
    stringValue(commitPayload?.sha) ||
    stringValue(commitPayload?.id) ||
    stringValue(item.commit_sha) ||
    stringValue(item.sha);
  return name && sha ? { name, sha } : undefined;
}

function getChangedGiteeBranches(previous: Record<string, string> | undefined, current: Record<string, string>) {
  if (!previous || Object.keys(previous).length === 0) return [];

  const updated = Object.entries(current)
    .filter(([branch, sha]) => previous[branch] && previous[branch] !== sha)
    .map(([branch]) => branch);
  const added = Object.keys(current)
    .filter((branch) => !previous[branch])
    .map((branch) => `新增 ${branch}`);
  const removed = Object.keys(previous)
    .filter((branch) => !current[branch])
    .map((branch) => `删除 ${branch}`);

  return [...updated, ...added, ...removed];
}

function formatGiteeBranchUpdateSummary(branches: string[]) {
  if (branches.length === 0) return undefined;
  const visible = branches.slice(0, 4).join('、');
  return branches.length > 4 ? `${visible} 等 ${branches.length} 个分支` : visible;
}

function formatFileTimestamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '_',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}

function giteeRecommendationToRepository(repository: GiteeRecommendedRepository): GiteeRepository {
  return {
    ...repository,
    tags: [],
    favorite: false,
    watchBranches: false,
    starredAt: new Date().toISOString(),
    lastSeenPushedAt: repository.pushedAt,
    hasUpdate: false
  };
}

function createMinimalGiteeRepository(fullName: string): GiteeRepository {
  return {
    id: 0,
    fullName,
    name: fullName.split('/').pop() || fullName,
    owner: fullName.split('/')[0] || '',
    description: '',
    htmlUrl: `https://gitee.com/${fullName}`,
    cloneUrl: `https://gitee.com/${fullName}.git`,
    topics: [],
    stars: 0,
    forks: 0,
    openIssues: 0,
    private: false,
    starredAt: new Date().toISOString(),
    tags: [],
    favorite: false,
    watchBranches: false,
    hasUpdate: false
  };
}

function normalizeGiteeRepositoryPrefix(input: GiteeBatchTagInput) {
  const owner = input.owner?.trim().replace(/^[\\/]+|[\\/]+$/g, '');
  const rawValue = owner ? `${owner}/` : input.prefix?.trim();
  const rawPrefix = (rawValue ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!rawPrefix) throw new Error('缺少 Gitee 仓库前缀，请提供 --prefix 或 --owner');
  if (rawPrefix.endsWith('/')) return rawPrefix;
  return rawPrefix.includes('/') ? rawPrefix : `${rawPrefix}/`;
}

function normalizeGiteeRepositoryName(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const urlCandidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : /^gitee\.com[\\/]/i.test(trimmed)
      ? `https://${trimmed.replace(/\\/g, '/')}`
      : '';
  if (urlCandidate) {
    try {
      const url = new URL(urlCandidate);
      if (!url.hostname.toLowerCase().endsWith('gitee.com')) return '';
      const [owner, repo] = url.pathname.split('/').filter(Boolean);
      return owner && repo ? `${owner}/${repo.replace(/\.git$/i, '')}` : '';
    } catch {
      return '';
    }
  }

  const [owner, repo] = trimmed.replace(/\\/g, '/').replace(/^\/+/, '').split('/');
  return owner && repo ? `${owner}/${repo.replace(/\.git$/i, '')}` : '';
}

function resolveGiteeFullName(repoPayload: Record<string, unknown>) {
  const fullName = stringValue(repoPayload.full_name) || stringValue(repoPayload.path_with_namespace);
  if (fullName) return fullName;

  const namespace = isRecord(repoPayload.namespace) ? repoPayload.namespace : undefined;
  const owner = stringValue(namespace?.path) || stringValue(namespace?.name);
  const name = stringValue(repoPayload.path) || stringValue(repoPayload.name);
  return owner && name ? `${owner}/${name}` : '';
}

function arrayOfGiteeTopics(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item;
      if (isRecord(item)) return stringValue(item.name) || stringValue(item.path);
      return '';
    })
    .filter(Boolean);
}

function buildGiteeUrl(endpoint: string, token?: string) {
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = new URL(`https://gitee.com/api/v5${normalizedEndpoint}`);
  if (token) url.searchParams.set('access_token', token);
  return url;
}

function buildGiteeHeaders(): Record<string, string> {
  return {
    Accept: 'application/json'
  };
}

function isRemoteResource(value: string) {
  const trimmed = value.trim().toLowerCase();
  return /^(https?:|ssh:|git:)/.test(trimmed) || /^[^@\s]+@[^:\s]+:.+/.test(trimmed);
}

function loadOptionalElectron(): OptionalElectron | undefined {
  try {
    return require('electron') as OptionalElectron;
  } catch {
    return undefined;
  }
}

function sortGiteeRepositories(repositories: GiteeRepository[]) {
  return [...repositories].sort((first, second) => {
    if (first.hasUpdate !== second.hasUpdate) return first.hasUpdate ? -1 : 1;
    if (first.favorite !== second.favorite) return first.favorite ? -1 : 1;
    return Date.parse(second.pushedAt ?? second.updatedAt ?? '') - Date.parse(first.pushedAt ?? first.updatedAt ?? '');
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function arrayOfStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

async function readSkillMetadata(skillPath: string): Promise<{
  source: SkillSource;
  sourceUrl?: string;
  installDate?: number;
}> {
  const metaPath = path.join(skillPath, '.skill-meta.json');
  if (!existsSync(metaPath)) return { source: 'unknown' };

  try {
    const parsed = JSON.parse(await readFile(metaPath, 'utf8')) as {
      source?: SkillSource;
      sourceUrl?: string;
      installDate?: number;
    };
    return {
      source: parsed.source ?? 'unknown',
      sourceUrl: parsed.sourceUrl,
      installDate: parsed.installDate
    };
  } catch {
    return { source: 'unknown' };
  }
}

async function writeSkillMetadata(
  skillPath: string,
  metadata: { source: SkillSource; sourceUrl?: string; installDate: number }
) {
  await writeFile(path.join(skillPath, '.skill-meta.json'), JSON.stringify(metadata, null, 2), 'utf8');
}

function findTargetRoot(directories: SkillDirectory[], targetDirectoryId: string) {
  const target = directories.find((directory) => directory.id === targetDirectoryId && directory.enabled);
  if (!target) throw new Error('目标目录未启用或不存在');
  return target;
}

function assertSkillPathInsideRoots(skillPath: string, directories: SkillDirectory[], allowDisabled = false) {
  const resolvedSkillPath = path.resolve(skillPath);
  const allowed = directories.some((directory) => isInside(resolvedSkillPath, path.resolve(directory.path)));
  if (!allowed) throw new Error('拒绝删除：目标不在已配置的 Skills 根目录内');
  const hasEnabledSkill = existsSync(path.join(resolvedSkillPath, SKILL_FILE_NAME));
  const hasDisabledSkill = allowDisabled && existsSync(path.join(resolvedSkillPath, DISABLED_SKILL_FILE_NAME));
  if (!hasEnabledSkill && !hasDisabledSkill) throw new Error('目标目录不包含 SKILL.md');
}

function isInside(child: string, parent: string) {
  const relative = path.relative(parent, child);
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function readScannableFiles(rootPath: string) {
  const files: Array<{ filePath: string; content: string }> = [];
  await walk(rootPath, async (filePath) => {
    if (!isScannable(filePath)) return;
    try {
      files.push({ filePath, content: await readFile(filePath, 'utf8') });
    } catch {
      // Binary or unreadable files are skipped; dedicated binary checks can be added later.
    }
  });
  return files;
}

async function walk(currentPath: string, onFile: (filePath: string) => Promise<void>) {
  if (!existsSync(currentPath)) return;
  const entries = await readdir(currentPath, { withFileTypes: true });
  for (const entry of entries) {
    const nextPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      if (DISCOVERY_IGNORED_DIRECTORIES.has(entry.name)) continue;
      await walk(nextPath, onFile);
    } else if (entry.isFile()) {
      await onFile(nextPath);
    }
  }
}

async function discoverSkillDirectories(rootPath: string): Promise<string[]> {
  const normalizedRootPath = normalizeUserPath(rootPath);
  if (!existsSync(normalizedRootPath)) return [];

  const skillDirectories: string[] = [];
  const ignoreRules = await readSkillIgnoreRules(normalizedRootPath);
  await walkSkillDirectories(normalizedRootPath, normalizedRootPath, ignoreRules, skillDirectories);
  return skillDirectories.sort((first, second) => first.localeCompare(second, 'zh-CN'));
}

async function walkSkillDirectories(
  rootPath: string,
  currentPath: string,
  ignoreRules: string[],
  skillDirectories: string[]
) {
  if (isIgnoredPath(rootPath, currentPath, ignoreRules)) return;

  if (existsSync(path.join(currentPath, SKILL_FILE_NAME)) || existsSync(path.join(currentPath, DISABLED_SKILL_FILE_NAME))) {
    skillDirectories.push(currentPath);
    return;
  }

  const entries = await readdir(currentPath, { withFileTypes: true });
  for (const entry of entries) {
    if (DISCOVERY_IGNORED_DIRECTORIES.has(entry.name)) continue;
    const nextPath = path.join(currentPath, entry.name);
    if (entry.isDirectory() || entry.isSymbolicLink()) {
      const nextStat = await stat(nextPath).catch(() => undefined);
      if (nextStat?.isDirectory()) await walkSkillDirectories(rootPath, nextPath, ignoreRules, skillDirectories);
    }
  }
}

function normalizeUserPath(value: string) {
  const trimmed = value.trim();
  const unquoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1)
      : trimmed;
  return path.resolve(unquoted);
}

async function readSkillIgnoreRules(rootPath: string) {
  const ignorePath = path.join(rootPath, '.skillignore');
  if (!existsSync(ignorePath)) return [];

  try {
    const content = await readFile(ignorePath, 'utf8');
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => normalizeIgnoreRule(line));
  } catch {
    return [];
  }
}

function normalizeIgnoreRule(rule: string) {
  return rule.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLowerCase();
}

function isIgnoredPath(rootPath: string, candidatePath: string, ignoreRules: string[]) {
  if (ignoreRules.length === 0) return false;
  const relativePath = path.relative(rootPath, candidatePath).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLowerCase();
  if (!relativePath) return false;

  return ignoreRules.some((rule) => {
    if (!rule) return false;
    if (rule.endsWith('/**')) {
      const prefix = rule.slice(0, -3);
      return relativePath === prefix || relativePath.startsWith(`${prefix}/`);
    }
    if (rule.includes('*')) {
      return globLikeMatch(relativePath, rule);
    }
    return relativePath === rule || relativePath.startsWith(`${rule}/`);
  });
}

function globLikeMatch(value: string, rule: string) {
  const escaped = rule.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(value);
}

function assertSkillTargetsAllowDirectory(skillContent: string, targetDirectory: SkillDirectory) {
  const targets = parseSkillTargets(skillContent);
  if (targets.length === 0) return;

  const acceptedTargetNames = [
    targetDirectory.id,
    targetDirectory.label,
    targetDirectory.product,
    productAlias(targetDirectory.product)
  ]
    .filter(Boolean)
    .map((value) => value.toLowerCase());
  const isAllowed = targets.some((target) => acceptedTargetNames.includes(target.toLowerCase()));
  if (!isAllowed) {
    throw new Error(`targets 未包含目标模块：${targetDirectory.label}`);
  }
}

function parseSkillTargets(content: string) {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return [];

  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (endIndex < 0) return [];

  const targets: string[] = [];
  const frontmatterLines = lines.slice(1, endIndex);
  for (let index = 0; index < frontmatterLines.length; index += 1) {
    const rawLine = frontmatterLines[index];
    const inlineMatch = rawLine.match(/^targets\s*:\s*(.*)$/i);
    if (!inlineMatch) continue;

    const inlineValue = inlineMatch[1].trim();
    if (inlineValue) {
      targets.push(...splitTargets(inlineValue));
      continue;
    }

    for (const listLine of frontmatterLines.slice(index + 1)) {
      const listMatch = listLine.match(/^\s*-\s*(.+)$/);
      if (!listMatch) break;
      targets.push(...splitTargets(listMatch[1]));
    }
  }

  return Array.from(new Set(targets.map((target) => target.trim()).filter(Boolean)));
}

function splitTargets(value: string) {
  const unquoted = value.replace(/^\[|\]$/g, '').replace(/^['"]|['"]$/g, '');
  return unquoted
    .split(/[,，]/)
    .map((target) => target.replace(/^['"]|['"]$/g, '').trim())
    .filter(Boolean);
}

function normalizeTags(tags?: string[]) {
  if (!tags) return [];
  return Array.from(
    new Set(
      tags
        .flatMap((tag) => tag.split(/[，,、;\r\n]+/))
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  );
}

function productAlias(product: ProductKind) {
  if (product === 'claude') return 'Claude Code';
  if (product === 'codex') return 'Codex';
  return product;
}

function productFromDirectoryId(directoryId: string): ProductKind {
  return isKnownProductKind(directoryId) ? directoryId : 'custom';
}

function isKnownProductKind(value: string): value is ProductKind {
  return [
    'claude',
    'codex',
    'cursor',
    'gemini',
    'windsurf',
    'trae',
    'cline',
    'roo',
    'augment',
    'goose',
    'continue',
    'openclaw',
    'qwen',
    'opencode',
    'aider',
    'openhands',
    'kiro',
    'zed',
    'copilot',
    'amazonq',
    'tabnine',
    'codeium',
    'jetbrains',
    'vscode',
    'devin',
    'sourcegraph',
    'replit',
    'codewhisperer',
    'supermaven',
    'custom'
  ].includes(value);
}

function createCustomDirectoryId(directoryPath: string) {
  const digest = createHash('sha1').update(path.resolve(directoryPath).toLowerCase()).digest('hex').slice(0, 10);
  return `custom_${digest}`;
}

function assertUniqueDirectoryPaths(directories: SkillDirectory[]) {
  const seen = new Map<string, string>();
  for (const directory of directories) {
    const normalizedPath = path.resolve(directory.path).toLowerCase();
    const existingLabel = seen.get(normalizedPath);
    if (existingLabel) {
      throw new Error(`模块路径不能重复：${existingLabel} 与 ${directory.label}`);
    }
    seen.set(normalizedPath, directory.label);
  }
}

function sanitizeIdentifier(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function createZipFromDirectory(sourceDirectory: string, outputPath: string) {
  await rm(outputPath, { force: true });

  if (process.platform === 'win32') {
    await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `& { ${[
          'param([string]$sourceDirectory, [string]$outputPath)',
          '$ErrorActionPreference = "Stop"',
          'Add-Type -AssemblyName System.IO.Compression.FileSystem',
          'if (Test-Path -LiteralPath $outputPath) { Remove-Item -LiteralPath $outputPath -Force }',
          '[System.IO.Compression.ZipFile]::CreateFromDirectory($sourceDirectory, $outputPath, [System.IO.Compression.CompressionLevel]::Optimal, $false)'
        ].join('; ')} }`,
        sourceDirectory,
        outputPath
      ],
      { timeout: 120_000 }
    );
    return;
  }

  await execFileAsync('zip', ['-r', outputPath, '.'], { cwd: sourceDirectory, timeout: 120_000 });
}

function sanitizePathSegment(value: string) {
  return (
    value
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80) || 'module'
  );
}

function uniqueExportFolderName(value: string, usedNames: Map<string, number>) {
  const baseName = sanitizePathSegment(value);
  const currentCount = usedNames.get(baseName) ?? 0;
  usedNames.set(baseName, currentCount + 1);
  return currentCount === 0 ? baseName : `${baseName}-${currentCount + 1}`;
}

function formatTimestampForFile(value: Date) {
  const pad = (input: number) => input.toString().padStart(2, '0');
  return [
    value.getFullYear(),
    pad(value.getMonth() + 1),
    pad(value.getDate()),
    '-',
    pad(value.getHours()),
    pad(value.getMinutes()),
    pad(value.getSeconds())
  ].join('');
}

function buildPackageMessage(skillCount: number, outputPath: string, shareTarget: PackageSkillsInput['shareTarget']) {
  const shareText =
    shareTarget === 'wechat'
      ? '路径已复制，可直接拖到微信发送'
      : shareTarget === 'dingtalk'
        ? '路径已复制，可直接拖到钉钉发送'
        : '路径已复制';
  return `已打包 ${skillCount} 个 Skills：${outputPath}，${shareText}`;
}

async function ensureSkillMemoryReadme(memoryPath: string, skillName: string) {
  const readmePath = path.join(memoryPath, 'README.md');
  if (existsSync(readmePath)) return;

  await writeFile(
    readmePath,
    [
      `# ${skillName} 记忆沉淀`,
      '',
      '这个目录由ai省钱大师创建，用来保存此 Skill 的外挂经验、偏好、失败案例和后续优化记录。',
      '',
      '## 使用要求',
      '',
      '- 执行本 Skill 前先读取本目录的 README.md。',
      '- 如果用户确认了新偏好、稳定项目事实或失败教训，将其追加到对应小节。',
      '- 不要把一次性流水账长期堆在这里；稳定知识应毕业到 SKILL.md、项目 docs 或 AGENTS.md。',
      '',
      '## 经验沉淀',
      '',
      '- 暂无。',
      '',
      '## 失败案例',
      '',
      '- 暂无。',
      '',
      '## 待毕业知识',
      '',
      '- 同一主题重复出现 3 次，或已经变成稳定使用规则时，将其毕业到更权威的位置，并在这里保留一行指针或删除。',
      ''
    ].join('\n'),
    'utf8'
  );
}

function getEditableSkillFilePath(skillPath: string) {
  const enabledPath = path.join(skillPath, SKILL_FILE_NAME);
  if (existsSync(enabledPath)) return enabledPath;

  const disabledPath = path.join(skillPath, DISABLED_SKILL_FILE_NAME);
  if (existsSync(disabledPath)) return disabledPath;

  throw new Error('未找到 SKILL.md 或 SKILL.md.disabled');
}

function getSkillMemoryPath(skillPath: string) {
  return path.join(skillPath, '.skills-memory');
}

function getSkillUsagePath(skillPath: string) {
  return path.join(getSkillMemoryPath(skillPath), 'usage.json');
}

function getSkillRecorderPath(skillPath: string) {
  return path.join(getSkillMemoryPath(skillPath), 'record-call.mjs');
}

async function ensureSkillUsageFile(usagePath: string) {
  if (existsSync(usagePath)) return;
  await writeFile(
    usagePath,
    JSON.stringify(
      {
        callCount: 0,
        lastCalledAt: null,
        updatedAt: new Date().toISOString(),
        note: '由ai省钱大师创建。AI 每次实际调用该 Skill 后递增 callCount。'
      },
      null,
      2
    ),
    'utf8'
  );
}

async function ensureSkillCallRecorder(skillPath: string) {
  const recorderPath = getSkillRecorderPath(skillPath);
  await writeFile(
    recorderPath,
    [
      '#!/usr/bin/env node',
      "import { readFile, writeFile } from 'node:fs/promises';",
      "import { dirname, join } from 'node:path';",
      "import { fileURLToPath } from 'node:url';",
      '',
      'const memoryDir = dirname(fileURLToPath(import.meta.url));',
      "const usagePath = join(memoryDir, 'usage.json');",
      "const source = readArg('--source') || 'custom';",
      'const now = Date.now();',
      'const current = await readUsage();',
      'const next = {',
      '  callCount: normalizeCount(current.callCount) + 1,',
      '  lastCalledAt: now,',
      '  updatedAt: new Date(now).toISOString(),',
      '  source',
      '};',
      'await writeFile(usagePath, `${JSON.stringify(next, null, 2)}\\n`, "utf8");',
      'console.log(JSON.stringify({ success: true, callCount: next.callCount, usagePath }));',
      '',
      'function readArg(name) {',
      '  const index = process.argv.indexOf(name);',
      '  if (index === -1) return undefined;',
      '  return process.argv[index + 1];',
      '}',
      '',
      'async function readUsage() {',
      '  try {',
      '    return JSON.parse(await readFile(usagePath, "utf8"));',
      '  } catch {',
      '    return {};',
      '  }',
      '}',
      '',
      'function normalizeCount(value) {',
      '  const parsed = typeof value === "number" ? value : Number(value);',
      '  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;',
      '}',
      ''
    ].join('\n'),
    'utf8'
  );
}

async function readSkillUsageStats(skillPath: string) {
  const usagePath = getSkillUsagePath(skillPath);
  if (!existsSync(usagePath)) return undefined;

  try {
    const raw = JSON.parse(await readFile(usagePath, 'utf8')) as { callCount?: unknown; lastCalledAt?: unknown; updatedAt?: unknown };
    const callCount = normalizeUsageCount(raw.callCount);
    const lastCalledAt = parseUsageTimestamp(raw.lastCalledAt) ?? parseUsageTimestamp(raw.updatedAt);
    return { callCount, lastCalledAt };
  } catch {
    return undefined;
  }
}

function normalizeUsageCount(value: unknown) {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0;
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function parseUsageTimestamp(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function hasManagedCallTrackingBlock(content: string) {
  return getManagedBlockPattern(CALL_TRACKING_BLOCK_START, CALL_TRACKING_BLOCK_END).test(content);
}

function hasManagedMemoryBlock(content: string) {
  return getManagedBlockPattern(MEMORY_BLOCK_START, MEMORY_BLOCK_END).test(content);
}

function hasManagedEvolutionBlock(content: string) {
  return getManagedBlockPattern(EVOLUTION_BLOCK_START, EVOLUTION_BLOCK_END).test(content);
}

function upsertManagedCallTrackingBlock(content: string, usagePath: string) {
  const skillPath = path.dirname(path.dirname(usagePath));
  const block = [
    CALL_TRACKING_BLOCK_START,
    '## 调用统计',
    '',
    `- Skill 根路径：${skillPath}`,
    `- 统计文件：${usagePath}`,
    '- 跨平台记录脚本：`.skills-memory/record-call.mjs`',
    '- Codex 记录命令：先进入 Skill 根路径，再执行 `node .skills-memory/record-call.mjs --source codex`',
    '- Claude 记录命令：先进入 Skill 根路径，再执行 `node .skills-memory/record-call.mjs --source claude`',
    '- 使用要求：每次本 Skill 被 AI 实际用于处理用户任务后，必须在任务结束前执行对应记录命令。',
    '- 路径要求：不要依赖ai省钱大师客户端或 CLI 的安装路径；只按当前 Skill 根路径定位记录脚本。',
    '- 统计边界：只统计真实 Skill 调用，不统计查看、扫描、标签编辑等管理器操作。',
    '- 隐私要求：统计文件只保存在本机，不上传云端。',
    CALL_TRACKING_BLOCK_END
  ].join('\n');

  return upsertManagedBlock(content, CALL_TRACKING_BLOCK_START, CALL_TRACKING_BLOCK_END, block);
}

function removeManagedCallTrackingBlock(content: string) {
  return removeManagedBlock(content, CALL_TRACKING_BLOCK_START, CALL_TRACKING_BLOCK_END);
}

function upsertManagedMemoryBlock(content: string, memoryPath: string) {
  const block = [
    MEMORY_BLOCK_START,
    '## 本地记忆',
    '',
    `- 记忆路径：${memoryPath}`,
    '- 使用要求：执行本 Skill 前先读取该目录下的 `README.md` 和最近的经验记录。',
    '- 维护要求：当用户确认新偏好、项目规范或失败教训时，将其沉淀到该记忆目录。',
    '- 毕业要求：稳定知识不要长期堆在记忆里，应合并回 `SKILL.md`、项目文档或 Agent 指令文件。',
    MEMORY_BLOCK_END
  ].join('\n');

  return upsertManagedBlock(content, MEMORY_BLOCK_START, MEMORY_BLOCK_END, block);
}

function removeManagedMemoryBlock(content: string) {
  return removeManagedBlock(content, MEMORY_BLOCK_START, MEMORY_BLOCK_END);
}

function removeManagedEvolutionBlock(content: string) {
  return removeManagedBlock(content, EVOLUTION_BLOCK_START, EVOLUTION_BLOCK_END);
}

function upsertManagedBlock(content: string, start: string, end: string, block: string) {
  const blockPattern = getManagedBlockPattern(start, end);
  if (blockPattern.test(content)) {
    return content.replace(blockPattern, block);
  }
  const separator = content.endsWith('\n') ? '\n' : '\n\n';
  return `${content}${separator}${block}\n`;
}

function removeManagedBlock(content: string, start: string, end: string) {
  return content.replace(getManagedBlockPattern(start, end), '').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

function getManagedBlockPattern(start: string, end: string) {
  return new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}\\n?`);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertSafeModuleRemovalPath(modulePath: string, homeDir: string, builtInDirectories: SkillDirectory[]) {
  const resolvedPath = path.resolve(modulePath);
  const rootPath = path.parse(resolvedPath).root;
  if (isSamePath(resolvedPath, rootPath)) throw new Error('拒绝移除：模块路径不能是磁盘根目录');
  if (isSamePath(resolvedPath, path.resolve(homeDir))) throw new Error('拒绝移除：模块路径不能是用户目录');
  if (builtInDirectories.some((directory) => isSamePath(resolvedPath, directory.path))) {
    throw new Error('拒绝移除：模块路径与内置目录相同');
  }

  const depth = resolvedPath.slice(rootPath.length).split(/[\\/]/).filter(Boolean).length;
  if (depth < 2) throw new Error('拒绝移除：模块路径层级过浅');
}

function isSamePath(first: string, second: string) {
  return path.resolve(first).toLowerCase() === path.resolve(second).toLowerCase();
}

function isInsideOrSame(child: string, parent: string) {
  return isSamePath(child, parent) || isInside(child, parent);
}

async function getSkillStorageInfo(skillPath: string): Promise<{ storageKind: SkillStorageKind; linkTarget?: string }> {
  const skillStat = await lstat(skillPath);
  if (!skillStat.isSymbolicLink()) return { storageKind: 'full' };
  return { storageKind: 'symlink', linkTarget: await resolveLinkTarget(skillPath) };
}

async function resolveLinkTarget(linkPath: string) {
  const linkStat = await lstat(linkPath).catch(() => undefined);
  if (!linkStat?.isSymbolicLink()) return undefined;
  return realpath(linkPath).catch(() => undefined);
}

function isScannable(filePath: string) {
  const basename = path.basename(filePath).toLowerCase();
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return (
    basename === 'skill.md' ||
    ['md', 'txt', 'js', 'ts', 'json', 'yaml', 'yml', 'ps1', 'bat', 'cmd', 'sh', 'py'].includes(ext)
  );
}
