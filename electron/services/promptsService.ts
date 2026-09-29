import { resolveDataDirectory } from './storageService.js';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, realpath, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { LocalPrompt, LocalPromptScanOptions, LocalPromptScanResult, LocalPromptSource, PromptBatchUpdateResult, SkillDirectory } from '../../src/shared/types.js';
import { TOKEN_SAVING_BLOCK, TOKEN_SAVING_MARKER, TOKEN_SAVING_END, TOKEN_SAVING_GUIDE } from '../../src/shared/tokenSavingPrompt.js';
import { TOKEN_SAVING_FEATURES, LEGACY_FEATURE_IDS, featureBlock, findFeatureBlocks, migrateLegacyFeatures, replaceFeature } from '../../src/shared/tokenSavingFeatures.js';
import type { TokenSavingFeature, TokenSavingFeatureId, TokenSavingFileStatus, TokenSavingMode } from '../../src/shared/tokenSavingFeatures.js';

const PROMPT_EXTENSIONS = new Set(['.md', '.mdc', '.txt', '.prompt', '.toml', '.yaml', '.yml']);
const MAX_PROMPT_BYTES = 2 * 1024 * 1024;
const MAX_PROMPT_FILES = 5000;

interface PromptsServiceOptions {
  homeDir?: string;
  codexHome?: string;
}

interface PromptSourceDefinition {
  id: string;
  label: string;
  path: string;
  recursive: boolean;
}

export function createPromptsService(options: PromptsServiceOptions = {}) {
  const homeDir = path.resolve(options.homeDir ?? os.homedir());
  const dataDir = resolveDataDirectory(homeDir);
  let featureQueue: Promise<unknown> = Promise.resolve();
  const featureDocumentPath = (feature: TokenSavingFeature) => path.join(dataDir, 'prompts', 'token-saving', `${feature.id}-v${feature.version}.md`);
  function assertFeatureTarget(promptPath: string) {
    if (isPathInside(path.join(dataDir, 'prompts'), path.resolve(promptPath))) throw new Error('内置指南是附加资料，请选择实际使用的全局提示词或指令文件');
  }

  async function getTokenSavingFeatureStatus(promptPaths: string[], extraDirectories: SkillDirectory[] = []): Promise<TokenSavingFileStatus[]> {
    return Promise.all([...new Set(promptPaths)].map(async (promptPath) => {
      const result: TokenSavingFileStatus = { path: promptPath, legacy: false, features: Object.fromEntries(TOKEN_SAVING_FEATURES.map((feature) => [feature.id, { state: 'off' }])) as TokenSavingFileStatus['features'] };
      try {
        assertFeatureTarget(promptPath);
        const content = await readLocalPrompt(promptPath, extraDirectories);
        if (['.toml', '.yaml', '.yml'].includes(path.extname(promptPath).toLowerCase())) throw new Error('结构化配置不支持直接写入规则，请使用客户端指令字段');
        result.legacy = /<!-- ai省钱大师:token-saving:v\d+ -->/.test(content);
        for (const feature of TOKEN_SAVING_FEATURES) {
          const blocks = findFeatureBlocks(content, feature.id);
          if (!blocks.length) {
            if (result.legacy && LEGACY_FEATURE_IDS.includes(feature.id)) result.features[feature.id] = { state: 'outdated', version: '整体旧版', mode: 'inline' };
            continue;
          }
          const mode = blocks[0][2] as TokenSavingMode;
          let current = blocks.length === 1 && blocks[0][0].replace(/\r\n/g, '\n') === featureBlock(feature, mode, featureDocumentPath(feature));
          if (current && mode === 'document') {
            try { current = await readFile(featureDocumentPath(feature), 'utf8') === feature.content; }
            catch { current = false; }
          }
          result.features[feature.id] = { state: current ? 'current' : 'outdated', mode, version: blocks[0][1] };
        }
      } catch (error) { result.error = error instanceof Error ? error.message : String(error); }
      return result;
    }));
  }

  function setTokenSavingFeature(promptPaths: string[], id: TokenSavingFeatureId, enabled: boolean, mode: TokenSavingMode, extraDirectories: SkillDirectory[] = []): Promise<PromptBatchUpdateResult> {
    const operation = featureQueue.then(async () => {
      const feature = TOKEN_SAVING_FEATURES.find((item) => item.id === id);
      if (!feature || typeof enabled !== 'boolean' || !['inline', 'document'].includes(mode)) throw new Error('无效的节约 Token 配置');
      const result: PromptBatchUpdateResult = { updated: [], skipped: [], failed: [] };
      for (const promptPath of [...new Set(promptPaths)]) {
        try {
          const safePath = await resolvePromptFile(promptPath, extraDirectories);
          assertFeatureTarget(safePath);
          if (['.toml', '.yaml', '.yml'].includes(path.extname(safePath).toLowerCase())) throw new Error('结构化配置不能直接追加文本，请在客户端指令字段配置');
          const current = await readLocalPrompt(safePath, extraDirectories);
          const migrated = migrateLegacyFeatures(current);
          const docPath = featureDocumentPath(feature);
          const next = replaceFeature(migrated.content, feature, enabled ? featureBlock(feature, mode, docPath) : '');
          let documentChanged = false;
          if (enabled && mode === 'document') {
            await mkdir(path.dirname(docPath), { recursive: true });
            let existing: string | undefined;
            try { existing = await readFile(docPath, 'utf8'); }
            catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
            if (existing !== feature.content) {
              if (existing !== undefined) await writeFile(`${docPath}.${Date.now()}.bak`, existing, { encoding: 'utf8', flag: 'wx' });
              await writeFile(docPath, feature.content, 'utf8');
              documentChanged = true;
            }
          }
          if (current === next) {
            (documentChanged ? result.updated : result.skipped).push(safePath);
            continue;
          }
          const backup = `${safePath}.ai省钱大师-token-features.bak`;
          try { await writeFile(backup, current, { encoding: 'utf8', flag: 'wx' }); }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
          if (await readFile(safePath, 'utf8') !== current) throw new Error('文件正在被其他程序编辑，请重新检测后再操作');
          const temporary = `${safePath}.token-saving-${Date.now()}.tmp`;
          try {
            await writeFile(temporary, next, { encoding: 'utf8', flag: 'wx' });
            await rename(temporary, safePath);
          } finally { await rm(temporary, { force: true }); }
          result.updated.push(safePath);
        } catch (error) { result.failed.push({ path: promptPath, error: error instanceof Error ? error.message : String(error) }); }
      }
      return result;
    });
    featureQueue = operation.catch(() => undefined);
    return operation;
  }

  async function exportTokenSavingGuide() {
    const directory = path.join(dataDir, 'prompts');
    await mkdir(directory, { recursive: true });
    let localPath = path.join(directory, 'token-saving-guide.md');
    try {
      const existing = await readFile(localPath, 'utf8');
      if (existing !== TOKEN_SAVING_GUIDE) localPath = path.join(directory, `token-saving-guide-${Date.now()}.md`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (!existsSync(localPath)) await writeFile(localPath, TOKEN_SAVING_GUIDE, { encoding: 'utf8', flag: 'wx' });
    return { localPath, reference: `请读取并遵守本机 Token 节约指南：${JSON.stringify(localPath.replace(/\\/g, '/'))}。只减少冗余，不牺牲必要信息、工具、检查和交付；RTK 安装与启用须单独授权。` };
  }

  function getSources(extraDirectories: SkillDirectory[] = [], includeSkills = false): LocalPromptSource[] {
    return buildPromptSources(homeDir, dataDir, options.codexHome ?? process.env.CODEX_HOME, extraDirectories, includeSkills).map((source) => ({
      ...source,
      exists: existsSync(source.path)
    }));
  }

  async function scanLocalPrompts(extraDirectories: SkillDirectory[] = [], scanOptions: LocalPromptScanOptions = {}): Promise<LocalPromptScanResult> {
    const sources = getSources(extraDirectories, scanOptions.includeSkills === true);
    const prompts: LocalPrompt[] = [];

    for (const source of sources) {
      if (!source.exists || prompts.length >= MAX_PROMPT_FILES) continue;
      try {
        await walkPromptFiles(source, source.path, prompts, source.recursive);
      } catch {
        // One inaccessible tool directory should not block all other prompt sources.
      }
    }

    prompts.sort((left, right) => right.lastModified - left.lastModified || left.name.localeCompare(right.name, 'zh-CN'));
    return { sources, prompts, scannedAt: Date.now() };
  }

  async function readLocalPrompt(promptPath: string, extraDirectories: SkillDirectory[] = []): Promise<string> {
    const safePath = await resolvePromptFile(promptPath, extraDirectories);
    const fileStat = await stat(safePath);
    if (fileStat.size > MAX_PROMPT_BYTES) throw new Error('提示词文件超过 2 MB，无法在应用内查看');
    return readFile(safePath, 'utf8');
  }

  async function applyTokenSavingPrompt(promptPaths: string[], extraDirectories: SkillDirectory[] = []): Promise<PromptBatchUpdateResult> {
    return updateTokenSavingPrompts(promptPaths, 'apply', extraDirectories);
  }

  async function restoreTokenSavingPrompt(promptPaths: string[], extraDirectories: SkillDirectory[] = []): Promise<PromptBatchUpdateResult> {
    return updateTokenSavingPrompts(promptPaths, 'restore', extraDirectories);
  }

  async function updateTokenSavingPrompts(
    promptPaths: string[],
    mode: 'apply' | 'restore',
    extraDirectories: SkillDirectory[] = []
  ): Promise<PromptBatchUpdateResult> {
    const result: PromptBatchUpdateResult = { updated: [], skipped: [], failed: [] };
    for (const promptPath of [...new Set(promptPaths)]) {
      try {
        const safePath = await resolvePromptFile(promptPath, extraDirectories);
        const backupPath = `${safePath}.ai省钱大师-token-saving.bak`;
        if (mode === 'apply') {
          if (['.toml', '.yaml', '.yml'].includes(path.extname(safePath).toLowerCase())) throw new Error('结构化配置不能直接追加文本，请在对应客户端的指令字段中配置');
          const current = await readFile(safePath, 'utf8');
          if (current.includes(TOKEN_SAVING_MARKER)) {
            result.skipped.push(safePath);
            continue;
          }
          const legacyMarker = '<!-- ai省钱大师:token-saving:v1 -->';
          if (current.includes(legacyMarker)) {
            const original = await readFile(backupPath, 'utf8');
            const start = current.indexOf(legacyMarker);
            const endText = '同类业务脚本重复编写或使用超过 3 次时，提示是否生成固定脚本，确认后再固化。';
            const end = current.indexOf(endText, start);
            if (end < 0 || !current.startsWith(original)) throw new Error('旧规则已经修改，请先手动核对原文备份');
            await writeFile(safePath, current.slice(0, start) + TOKEN_SAVING_BLOCK + current.slice(end + endText.length), 'utf8');
            result.updated.push(safePath);
            continue;
          }
          try {
            await readFile(backupPath, 'utf8');
            result.skipped.push(safePath);
            continue;
          } catch {
            // 没有备份才创建新的原文快照。
          }
          await writeFile(backupPath, current, { encoding: 'utf8', flag: 'wx' });
          await appendFile(safePath, `${current.endsWith('\n') ? '\n' : '\n\n'}${TOKEN_SAVING_BLOCK}\n`, 'utf8');
          result.updated.push(safePath);
        } else {
          if (!existsSync(backupPath)) {
            result.skipped.push(safePath);
            continue;
          }
            const original = await readFile(backupPath, 'utf8');
            const current = await readFile(safePath, 'utf8');
            const expected = `${original}${original.endsWith('\n') ? '\n' : '\n\n'}${TOKEN_SAVING_BLOCK}\n`;
            if (current !== expected) {
              const start = current.indexOf(TOKEN_SAVING_MARKER);
              const end = current.indexOf(TOKEN_SAVING_END, start);
              if (start < 0 || end < 0 || current.slice(start, end + TOKEN_SAVING_END.length) !== TOKEN_SAVING_BLOCK) throw new Error('规则块已修改，已保留当前文件和备份，请手动核对');
              await writeFile(safePath, current.slice(0, start) + current.slice(end + TOKEN_SAVING_END.length).replace(/^\r?\n/, ''), 'utf8');
            } else {
            await writeFile(safePath, original, 'utf8');
            }
            await rm(backupPath, { force: true });
            result.updated.push(safePath);
        }
      } catch (error) {
        result.failed.push({ path: promptPath, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return result;
  }

  async function resolvePromptFile(promptPath: string, extraDirectories: SkillDirectory[] = []): Promise<string> {
    const actualPath = await resolvePromptResource(promptPath, extraDirectories);
    if (!PROMPT_EXTENSIONS.has(path.extname(actualPath).toLowerCase())) throw new Error('不支持的提示词文件类型');
    const fileStat = await stat(actualPath);
    if (!fileStat.isFile()) throw new Error('提示词文件不存在');
    return actualPath;
  }

  async function resolvePromptResource(promptPath: string, extraDirectories: SkillDirectory[] = []): Promise<string> {
    if (typeof promptPath !== 'string' || !promptPath.trim()) throw new Error('提示词路径不能为空');
    const actualPath = await realpath(path.resolve(promptPath.trim()));
    const allowedRoots = getSources(extraDirectories).filter((source) => source.exists);
    const insideAllowedRoot = await Promise.all(
      allowedRoots.map(async (source) => {
        const actualRoot = await realpath(source.path);
        return samePath(actualRoot, actualPath) || isPathInside(actualRoot, actualPath);
      })
    );
    if (!insideAllowedRoot.some(Boolean)) throw new Error('拒绝打开提示词目录之外的资源');
    return actualPath;
  }

  async function walkPromptFiles(source: LocalPromptSource, directoryPath: string, prompts: LocalPrompt[], recursive = true) {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    for (const entry of entries) {
      if (prompts.length >= MAX_PROMPT_FILES) return;
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory() && recursive) {
        await walkPromptFiles(source, entryPath, prompts, recursive);
        continue;
      }
      if (!entry.isFile() || !PROMPT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;

      const fileStat = await stat(entryPath);
      if (fileStat.size > MAX_PROMPT_BYTES) continue;
      const content = await readFile(entryPath, 'utf8');
      const relativePath = path.relative(source.path, entryPath);
      prompts.push({
        id: createPromptId(source.id, relativePath),
        name: path.basename(entry.name, path.extname(entry.name)),
        description: extractPromptDescription(content),
        sourceId: source.id,
        sourceLabel: source.label,
        localPath: entryPath,
        relativePath,
        extension: path.extname(entry.name).slice(1).toLowerCase(),
        size: fileStat.size,
        lastModified: fileStat.mtimeMs
      });
    }
  }

  return {
    getTokenSavingFeatureStatus,
    setTokenSavingFeature,
    exportTokenSavingGuide,
    scanLocalPrompts,
    readLocalPrompt,
    applyTokenSavingPrompt,
    restoreTokenSavingPrompt,
    resolvePromptFile,
    resolvePromptResource
  };
}

function buildPromptSources(homeDir: string, dataDir: string, codexHome?: string, extraDirectories: SkillDirectory[] = [], includeSkills = false): PromptSourceDefinition[] {
  const definitions: PromptSourceDefinition[] = [];
  if (codexHome?.trim()) {
    definitions.push({ id: 'codex', label: 'Codex', path: path.join(path.resolve(codexHome.trim()), 'prompts'), recursive: true });
  }
  definitions.push(
    { id: 'manager-guides', label: 'ai管家 · 内置指南', path: path.join(dataDir, 'prompts'), recursive: true },
    { id: 'codex-home', label: 'Codex（用户目录）', path: path.join(homeDir, '.codex', 'prompts'), recursive: true },
    { id: 'claude', label: 'Claude Commands', path: path.join(homeDir, '.claude', 'commands'), recursive: true },
    { id: 'cursor', label: 'Cursor Rules', path: path.join(homeDir, '.cursor', 'rules'), recursive: true },
    { id: 'gemini', label: 'Gemini Commands', path: path.join(homeDir, '.gemini', 'commands'), recursive: true },
    { id: 'trae', label: 'Trae Rules', path: path.join(homeDir, '.trae', 'rules'), recursive: true },
    { id: 'openclaw', label: 'OpenClaw Prompts', path: path.join(homeDir, '.openclaw', 'prompts'), recursive: true },
    { id: 'kiro', label: 'Kiro Steering', path: path.join(homeDir, '.kiro', 'steering'), recursive: true }
  );
  for (const directory of extraDirectories) {
    if (!directory.enabled || !directory.path.trim()) continue;
    const modulePath = path.resolve(directory.path);
    definitions.push({ id: `module-${directory.id}`, label: directory.label, path: modulePath, recursive: false });
    if (includeSkills) {
      const skillsPath = path.basename(modulePath).toLowerCase() === 'skills' ? modulePath : path.join(modulePath, 'skills');
      definitions.push({ id: `module-${directory.id}-skills`, label: `${directory.label} · Skills`, path: skillsPath, recursive: true });
    }
  }

  const seenPaths = new Set<string>();
  return definitions.filter((source) => {
    source.path = path.resolve(source.path);
    const key = process.platform === 'win32' ? source.path.toLowerCase() : source.path;
    if (seenPaths.has(key)) return false;
    seenPaths.add(key);
    return true;
  });
}

function extractPromptDescription(content: string) {
  const frontmatter = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  const descriptionLine = frontmatter?.[1]
    ?.split(/\r?\n/)
    .find((line) => /^description\s*:/i.test(line));
  if (descriptionLine) return cleanDescription(descriptionLine.replace(/^description\s*:\s*/i, ''));

  const firstContentLine = content
    .replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#') && !line.startsWith('<!--'));
  return firstContentLine ? cleanDescription(firstContentLine) : '暂无描述';
}

function cleanDescription(value: string) {
  const cleaned = value.trim().replace(/^['"]|['"]$/g, '').replace(/\s+/g, ' ');
  return cleaned.length > 180 ? `${cleaned.slice(0, 177)}...` : cleaned || '暂无描述';
}

function createPromptId(sourceId: string, relativePath: string) {
  return createHash('sha256').update(`${sourceId}\0${relativePath}`).digest('hex').slice(0, 24);
}

function isPathInside(rootPath: string, candidatePath: string) {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

function samePath(left: string, right: string) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}
