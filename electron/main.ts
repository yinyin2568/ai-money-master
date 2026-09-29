import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import os from 'node:os';
import { createStorageService, resolveDataDirectory, withStorageLock } from './services/storageService.js';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createSkillsService } from './services/skillsService.js';
import { createPromptsService } from './services/promptsService.js';
import { createRtkService } from './services/rtkService.js';
import { createLocalToolsService } from './services/localToolsService.js';
import { createLocalAssetsService } from './services/localAssetsService.js';
import { createLocalGitService } from './services/localGitService.js';
import { createSceneMemoryService } from './services/sceneMemoryService.js';
import { getTokenUsageReport } from './services/tokenUsageService.js';
import type {
  CreateGithubSkillInput,
  CreateModuleInput,
  GiteeBatchTagInput,
  GiteeCredentialsInput,
  GiteeRepoMetaInput,
  GiteeRepositorySearchInput,
  GiteeStarRepositoryInput,
  GiteeStarSyncInput,
  GithubRepositorySearchInput,
  GithubStarCredentialsInput,
  GithubStarMetaInput,
  GithubStarRepositoryInput,
  GithubStarSyncInput,
  MarketplaceAddInput,
  MarketplaceInstallInput,
  PackageSkillsInput,
  SaveReusableSceneInput,
  SyncMode,
  UpdateAppSettingsInput
} from '../src/shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rendererFilePath = path.resolve(__dirname, '../../dist/index.html');
const devUrl = process.env.VITE_DEV_SERVER_URL;
let skillsService: ReturnType<typeof createSkillsService>;
let promptsService: ReturnType<typeof createPromptsService>;
const rtkService = createRtkService();
const localToolsService = createLocalToolsService();
const localAssetsService = createLocalAssetsService();
const localGitService = createLocalGitService();
let sceneMemoryService: ReturnType<typeof createSceneMemoryService>;
const storageService = createStorageService({ installDir: app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath() });
let activeDataDirectory = '';
const rendererDirectories = new Map<number, string>();
function ensureDataServices() {
  const directory = resolveDataDirectory();
  if (directory === activeDataDirectory) return;
  skillsService = createSkillsService();
  promptsService = createPromptsService();
  sceneMemoryService = createSceneMemoryService();
  activeDataDirectory = directory;
}

app.disableHardwareAcceleration();

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1080,
    minHeight: 680,
    title: 'AI省钱大师',
    backgroundColor: '#f6f7fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalUrl(url).catch(() => undefined);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (isTrustedRendererUrl(url)) return;
    event.preventDefault();
    void openExternalUrl(url).catch(() => undefined);
  });

  if (devUrl) {
    void window.loadURL(devUrl);
  } else {
    void window.loadFile(path.join(__dirname, '../../dist/index.html'));
  }
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function registerIpcHandlers() {
  const handle = (channel: string, listener: (event: IpcMainInvokeEvent, ...args: any[]) => unknown) => {
    ipcMain.handle(channel, (event, ...args) => {
      assertTrustedSender(event);
      return withStorageLock(os.homedir(), async () => {
        if (!channel.startsWith('storage:') || channel === 'storage:preferenceSave') {
          const expected = rendererDirectories.get(event.sender.id);
          if (expected && expected !== resolveDataDirectory()) throw new Error('数据目录已由其他窗口切换，请重新加载应用后继续');
        }
        // Recovery controls remain available when a configured drive is missing.
        if (!channel.startsWith('storage:')) ensureDataServices();
        return await listener(event, ...args);
      });
    });
  };

  handle('app:ping', () => 'pong');
  handle('storage:get', () => storageService.getSettings());
  handle('storage:choose', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });
  handle('storage:open', async () => {
    const error = await shell.openPath(resolveDataDirectory());
    if (error) throw new Error(error);
  });
  handle('storage:switch', async (_event, input) => {
    const settings = await storageService.switchDirectory(input);
    ensureDataServices();
    return settings;
  });
  handle('storage:preferences', async (event, legacy) => {
    const preferences = await storageService.loadPreferences(legacy);
    rendererDirectories.set(event.sender.id, resolveDataDirectory());
    return preferences;
  });
  handle('storage:preferenceSave', (_event, key, value) => storageService.savePreference(key, value));
  handle('rtk:execute', (_event, action, client) => rtkService.execute(action, client));
  handle('prompts:exportGuide', () => promptsService.exportTokenSavingGuide());
  handle('prompts:featureStatus', async (_event, paths) => promptsService.getTokenSavingFeatureStatus(paths, await skillsService.getDirectories()));
  handle('prompts:featureSet', async (_event, paths, id, enabled, mode) => promptsService.setTokenSavingFeature(paths, id, enabled, mode, await skillsService.getDirectories()));
  handle('clipboard:writeText', (_event, text: string) => {
    clipboard.writeText(text);
  });
  handle('shell:openExternal', (_event, url: string) => openExternalUrl(url));
  handle('settings:get', () => skillsService.getAppSettings());
  handle('settings:save', (_event, input: UpdateAppSettingsInput) => skillsService.saveAppSettings(input));
  handle('directories:list', () => skillsService.getDirectories());
  handle('directories:saveDefault', (_event, directories) => skillsService.saveDefaultDirectories(directories));
  handle('directories:saveCustom', (_event, directories) => skillsService.saveCustomDirectories(directories));
  handle('modules:defaultCandidates', () => skillsService.getDefaultModuleCandidates());
  handle('modules:create', (_event, input: CreateModuleInput) => skillsService.createModule(input));
  handle('modules:remove', (_event, directoryId: string) => skillsService.removeModule(directoryId));
  handle('skills:scan', () => skillsService.scanSkills());
  handle('prompts:scan', async (_event, scanOptions) => promptsService.scanLocalPrompts(await skillsService.getDirectories(), scanOptions));
  handle('prompts:read', async (_event, promptPath: string) => promptsService.readLocalPrompt(promptPath, await skillsService.getDirectories()));
  handle('prompts:tokenSavingApply', async (_event, promptPaths: string[]) => promptsService.applyTokenSavingPrompt(promptPaths, await skillsService.getDirectories()));
  handle('prompts:tokenSavingRestore', async (_event, promptPaths: string[]) => promptsService.restoreTokenSavingPrompt(promptPaths, await skillsService.getDirectories()));
  handle('tokenUsage:get', (_event, days?: number) => getTokenUsageReport(days));
  handle('prompts:reveal', async (_event, promptPath: string) => {
    const safePath = await promptsService.resolvePromptResource(promptPath, await skillsService.getDirectories());
    await revealInExplorer(safePath);
  });
  handle('localTools:scanClis', () => localToolsService.scanLocalClis());
  handle('localTools:scanMcps', () => localToolsService.scanLocalMcps());
  handle('localTools:readConfig', (_event, configPath: string) => localToolsService.readLocalConfig(configPath));
  handle('localTools:reveal', async (_event, resourcePath: string) => {
    const safePath = await localToolsService.resolveManagedResource(resourcePath);
    await revealInExplorer(safePath);
  });
  handle('localAssets:scanMemories', () => localAssetsService.scanLocalMemories());
  handle('localAssets:scanPlugins', () => localAssetsService.scanLocalPlugins());
  handle('localAssets:scanAgents', () => localAssetsService.scanLocalAgents());
  handle('localAssets:read', (_event, assetPath: string) => localAssetsService.readLocalAsset(assetPath));
  handle('localAssets:reveal', async (_event, assetPath: string) => {
    const safePath = await localAssetsService.resolveAssetResourcePath(assetPath);
    await revealInExplorer(safePath);
  });
  handle('localGit:scan', (_event, rootPath?: string) => localGitService.scanLocalRepositories(rootPath));
  handle('localGit:chooseRoot', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择本地 Git 仓库扫描目录',
      properties: ['openDirectory']
    });
    return result.canceled ? undefined : result.filePaths[0];
  });
  handle('localGit:reveal', async (_event, repositoryPath: string) => {
    const safePath = await localGitService.resolveRepositoryPath(repositoryPath);
    await revealInExplorer(safePath);
  });
  handle('scenes:list', () => sceneMemoryService.listReusableScenes());
  handle('scenes:save', (_event, input: SaveReusableSceneInput) => sceneMemoryService.saveReusableScene(input));
  handle('scenes:delete', (_event, sceneId: string) => sceneMemoryService.deleteReusableScene(sceneId));
  handle('scenes:revealStore', async () => revealInExplorer(await sceneMemoryService.getStorePath()));
  handle('skills:read', (_event, skillPath: string) => skillsService.readSkill(skillPath));
  handle('skills:setEnabled', (_event, skillPath: string, enabled: boolean) =>
    skillsService.setSkillEnabled(skillPath, enabled)
  );
  handle('skills:setCallTracking', (_event, skillPath: string, skillId: string, enabled: boolean) =>
    skillsService.setSkillCallTracking(skillPath, skillId, enabled)
  );
  handle('skills:recordCall', (_event, skillPath: string, source) => skillsService.recordSkillCall(skillPath, source));
  handle('skills:openFolder', (_event, folderPath: string) => skillsService.openFolder(folderPath));
  handle('skills:uninstall', (_event, skillPath: string) => skillsService.uninstallSkill(skillPath));
  handle('skills:importLocal', (_event, sourcePath: string, targetDirectoryId?: string) =>
    skillsService.importLocalSkill(sourcePath, targetDirectoryId)
  );
  handle('skills:importGithub', (_event, repoUrl: string, targetDirectoryId?: string) =>
    skillsService.importGithubSkill(repoUrl, targetDirectoryId)
  );
  handle('skills:syncToDirectory', (_event, skillPath: string, targetDirectoryId: string, mode: SyncMode) =>
    skillsService.syncSkillToDirectory(skillPath, targetDirectoryId, mode)
  );
  handle('modules:syncRepository', (_event, directoryId: string) => skillsService.syncRepositoryModule(directoryId));
  handle('skills:createGithubSkill', (_event, input: CreateGithubSkillInput) =>
    skillsService.createGithubSkill(input)
  );
  handle('skills:checkGithubUpdates', () => skillsService.checkGithubSkillUpdates());
  handle('skills:updateGithubSkill', (_event, skillPath: string, skillId: string) =>
    skillsService.updateGithubSkill(skillPath, skillId)
  );
  handle('marketplace:list', () => skillsService.listMarketplaceSkills());
  handle('marketplace:add', (_event, input: MarketplaceAddInput) => skillsService.addMarketplaceSkill(input));
  handle('marketplace:remove', (_event, id: string) => skillsService.removeMarketplaceSkill(id));
  handle('marketplace:install', (_event, input: MarketplaceInstallInput) =>
    skillsService.installMarketplaceSkill(input)
  );
  handle('marketplace:share', (_event, id: string) => skillsService.shareMarketplaceSkill(id));
  handle('logs:list', () => skillsService.getOperationLogs());
  handle('githubStars:settings', () => skillsService.getGithubStarSettings());
  handle('githubStars:saveCredentials', (_event, input: GithubStarCredentialsInput) =>
    skillsService.saveGithubStarCredentials(input)
  );
  handle('githubStars:sync', (_event, input?: GithubStarSyncInput) => skillsService.syncGithubStars(input));
  handle('githubStars:list', () => skillsService.listGithubStars());
  handle('githubStars:updateMeta', (_event, input: GithubStarMetaInput) =>
    skillsService.updateGithubStarMeta(input)
  );
  handle('githubStars:searchRepositories', (_event, input?: GithubRepositorySearchInput) =>
    skillsService.searchGithubRepositories(input)
  );
  handle('githubStars:starRepository', (_event, input: GithubStarRepositoryInput) =>
    skillsService.starGithubRepository(input)
  );
  handle('gitee:settings', () => skillsService.getGiteeSettings());
  handle('gitee:saveCredentials', (_event, input: GiteeCredentialsInput) =>
    skillsService.saveGiteeCredentials(input)
  );
  handle('gitee:sync', (_event, input?: GiteeStarSyncInput) => skillsService.syncGiteeStars(input));
  handle('gitee:list', () => skillsService.listGiteeStars());
  handle('gitee:updateMeta', (_event, input: GiteeRepoMetaInput) => skillsService.updateGiteeRepoMeta(input));
  handle('gitee:tagByPrefix', (_event, input: GiteeBatchTagInput) =>
    skillsService.tagGiteeRepositoriesByPrefix(input)
  );
  handle('gitee:searchRepositories', (_event, input?: GiteeRepositorySearchInput) =>
    skillsService.searchGiteeRepositories(input)
  );
  handle('gitee:starRepository', (_event, input: GiteeStarRepositoryInput) =>
    skillsService.starGiteeRepository(input)
  );
  handle('gitee:saveRepository', (_event, input: { fullName: string }) =>
    skillsService.saveGiteeRepository(input)
  );
  handle('skills:package', (_event, input: PackageSkillsInput) => skillsService.packageSkills(input));
  handle('skills:optimize', (_event, skillPath: string, skillId: string) =>
    skillsService.optimizeSkill(skillPath, skillId)
  );
  handle('skills:setOptimization', (_event, skillPath: string, skillId: string, enabled: boolean) =>
    skillsService.setSkillOptimization(skillPath, skillId, enabled)
  );
  handle('skills:recordEvolution', (_event, skillPath: string, skillId: string, note: string) =>
    skillsService.recordSkillEvolution(skillPath, skillId, note)
  );
  handle('skills:updateMeta', (_event, skillId: string, input) => skillsService.updateSkillUserMeta(skillId, input));
  handle('skills:recordUsage', (_event, skillId: string, eventType, source, note) =>
    skillsService.recordUsage(skillId, eventType, source, note)
  );
  handle('security:scanSkill', (_event, skillPath: string, skillId: string) =>
    skillsService.scanSkillSecurity(skillPath, skillId)
  );
  handle('security:scanAll', () => skillsService.scanAllSecurity());
}

async function openExternalUrl(value: string) {
  const target = new URL(value);
  if (target.protocol !== 'https:') throw new Error('只支持打开 HTTPS 链接');
  await shell.openExternal(target.toString());
}

async function revealInExplorer(resourcePath: string) {
  const resourceStat = await stat(resourcePath);
  if (resourceStat.isDirectory()) {
    const errorMessage = await shell.openPath(resourcePath);
    if (errorMessage) throw new Error(errorMessage);
    return;
  }
  shell.showItemInFolder(resourcePath);
}

function assertTrustedSender(event: IpcMainInvokeEvent) {
  const senderUrl = event.senderFrame?.url || event.sender.getURL();
  if (!isTrustedRendererUrl(senderUrl)) throw new Error('拒绝来自非应用页面的桌面操作');
}

function isTrustedRendererUrl(value: string) {
  try {
    const target = new URL(value);
    if (devUrl) return target.origin === new URL(devUrl).origin;
    if (target.protocol !== 'file:') return false;
    const actualPath = path.resolve(fileURLToPath(target));
    return process.platform === 'win32'
      ? actualPath.toLowerCase() === rendererFilePath.toLowerCase()
      : actualPath === rendererFilePath;
  } catch {
    return false;
  }
}
