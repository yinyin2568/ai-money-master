export type ProductKind =
  | 'claude'
  | 'codex'
  | 'cursor'
  | 'gemini'
  | 'windsurf'
  | 'trae'
  | 'cline'
  | 'roo'
  | 'augment'
  | 'goose'
  | 'continue'
  | 'openclaw'
  | 'qwen'
  | 'opencode'
  | 'aider'
  | 'openhands'
  | 'kiro'
  | 'zed'
  | 'copilot'
  | 'amazonq'
  | 'tabnine'
  | 'codeium'
  | 'jetbrains'
  | 'vscode'
  | 'devin'
  | 'sourcegraph'
  | 'replit'
  | 'codewhisperer'
  | 'supermaven'
  | 'custom';

export type SkillSource = 'local' | 'github' | 'unknown';

export type SecurityLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical' | 'unscanned';

export type SkillStorageKind = 'full' | 'symlink';

export type SyncMode = 'symlink' | 'copy';

export type ModuleImportMode = 'github' | 'local' | 'default' | 'npx';

export type ShareTarget = 'file' | 'wechat' | 'dingtalk';

export interface AppSettings {
  offlineMode: boolean;
}

export interface UpdateAppSettingsInput {
  offlineMode?: boolean;
}

export interface GithubStarCredentialsInput {
  username?: string;
  token: string;
}

export interface GithubStarSettings {
  username?: string;
  tokenConfigured: boolean;
  lastSyncedAt?: number;
  repositoryCount: number;
  tagCount: number;
  updatedCount: number;
}

export interface GithubStarRepository {
  id: number;
  fullName: string;
  name: string;
  owner: string;
  description: string;
  htmlUrl: string;
  cloneUrl: string;
  language?: string;
  topics: string[];
  stars: number;
  forks: number;
  openIssues: number;
  private: boolean;
  archived: boolean;
  pushedAt?: string;
  updatedAt?: string;
  starredAt?: string;
  tags: string[];
  favorite: boolean;
  localPath?: string;
  lastSeenPushedAt?: string;
  hasUpdate: boolean;
  updateDetectedAt?: number;
}

export interface GithubRecommendedRepository {
  id: number;
  fullName: string;
  name: string;
  owner: string;
  description: string;
  htmlUrl: string;
  cloneUrl: string;
  language?: string;
  topics: string[];
  stars: number;
  forks: number;
  openIssues: number;
  private: boolean;
  archived: boolean;
  pushedAt?: string;
  updatedAt?: string;
  score?: number;
}

export interface GithubRepositorySearchInput {
  query?: string;
  minStars?: number;
  sort?: 'stars' | 'updated';
  perPage?: number;
  page?: number;
}

export interface GithubStarRepositoryInput {
  fullName: string;
  repository?: GithubRecommendedRepository;
}

export interface GithubStarMetaInput {
  fullName: string;
  tags?: string[];
  favorite?: boolean;
  localPath?: string;
}

export interface GithubStarSyncInput {
  pages?: number;
  perPage?: number;
  sort?: 'created' | 'updated';
}

export interface GiteeCredentialsInput {
  username?: string;
  token: string;
}

export interface GiteeSettings {
  username?: string;
  tokenConfigured: boolean;
  lastSyncedAt?: number;
  repositoryCount: number;
  tagCount: number;
  updatedCount: number;
}

export interface GiteeRepository {
  id: number;
  fullName: string;
  name: string;
  owner: string;
  description: string;
  htmlUrl: string;
  cloneUrl: string;
  language?: string;
  topics: string[];
  stars: number;
  forks: number;
  openIssues: number;
  private: boolean;
  pushedAt?: string;
  updatedAt?: string;
  starredAt?: string;
  tags: string[];
  favorite: boolean;
  watchBranches?: boolean;
  localPath?: string;
  lastSeenPushedAt?: string;
  lastSeenBranches?: Record<string, string>;
  hasUpdate: boolean;
  updateBranch?: string;
  branchUpdateSummary?: string;
  updateDetectedAt?: number;
}

export interface GiteeRecommendedRepository {
  id: number;
  fullName: string;
  name: string;
  owner: string;
  description: string;
  htmlUrl: string;
  cloneUrl: string;
  language?: string;
  topics: string[];
  stars: number;
  forks: number;
  openIssues: number;
  private: boolean;
  pushedAt?: string;
  updatedAt?: string;
}

export interface GiteeRepositorySearchInput {
  query?: string;
  minStars?: number;
  perPage?: number;
  page?: number;
}

export interface GiteeStarRepositoryInput {
  fullName: string;
  repository?: GiteeRecommendedRepository;
}

export interface GiteeRepoMetaInput {
  fullName: string;
  tags?: string[];
  favorite?: boolean;
  watchBranches?: boolean;
  localPath?: string;
}

export interface GiteeBranchMonitorInput {
  fullName: string;
  enabled: boolean;
}

export interface GiteeBatchTagInput {
  prefix?: string;
  owner?: string;
  tags: string[];
}

export interface GiteeBatchTagResult extends OperationResult {
  matchedCount: number;
  updatedCount: number;
  repositories: string[];
}

export interface GiteeStarSyncInput {
  pages?: number;
  perPage?: number;
  branchPages?: number;
  branchPerPage?: number;
}

export interface MarketplaceSkill {
  id: string;
  name: string;
  description: string;
  author: string;
  repoUrl: string;
  tags: string[];
  installCount?: number;
  custom?: boolean;
}

export interface MarketplaceInstallInput {
  id?: string;
  repoUrl?: string;
  localPath?: string;
  targetDirectoryId?: string;
}

export interface MarketplaceAddInput {
  repoUrl: string;
  name?: string;
  description?: string;
  author?: string;
  tags?: string[];
}

export interface PackageSkillsInput {
  skillPaths: string[];
  shareTarget?: ShareTarget;
}

export interface CreateGithubSkillInput {
  repoUrl: string;
  targetDirectoryId?: string;
  localRepositoryRoot?: string;
  name?: string;
  preserveGitRemote?: boolean;
}

export type GithubSkillUpdateState = 'current' | 'outdated' | 'error';

export interface GithubSkillUpdateStatus {
  skillId: string;
  name: string;
  localPath: string;
  githubUrl: string;
  branch: string;
  currentHash: string;
  latestHash?: string;
  version?: string;
  status: GithubSkillUpdateState;
  message?: string;
}

export interface GithubSkillUpdateSnapshot {
  currentHash?: string;
  latestHash?: string;
  status: GithubSkillUpdateState;
  version?: string;
}

export interface GithubSkillUpdateResult extends OperationResult {
  skillId: string;
  skillName: string;
  githubUrl: string;
  branch: string;
  before: GithubSkillUpdateSnapshot;
  after: GithubSkillUpdateSnapshot;
  backupPath?: string;
  updatedAt: string;
  updateContent: string;
}

export interface DefaultModuleCandidate {
  productId: string;
  label: string;
  path: string;
  exists: boolean;
}

type CreateModuleBase = {
  name: string;
  tags?: string[];
};

export type CreateModuleInput =
  | (CreateModuleBase & {
      mode: 'github';
      githubUrl: string;
    })
  | (CreateModuleBase & {
      mode: 'local';
      localPath: string;
    })
  | (CreateModuleBase & {
      mode: 'default';
      defaultPath: string;
    })
  | (CreateModuleBase & {
      mode: 'npx';
      packageName: string;
      versionRange?: string;
      registry?: string;
    });

export interface SkillDirectory {
  id: string;
  label: string;
  product: ProductKind;
  path: string;
  enabled: boolean;
  builtIn: boolean;
  tags?: string[];
}

export interface LocalPromptSource {
  id: string;
  label: string;
  path: string;
  exists: boolean;
  recursive?: boolean;
}

export interface LocalPrompt {
  id: string;
  name: string;
  description: string;
  sourceId: string;
  sourceLabel: string;
  localPath: string;
  relativePath: string;
  extension: string;
  size: number;
  lastModified: number;
}

export interface LocalPromptScanResult {
  sources: LocalPromptSource[];
  prompts: LocalPrompt[];
  scannedAt: number;
}

export interface LocalPromptScanOptions {
  /** 仅扫描模块根目录的全局提示词；开启后再递归扫描模块下的 Skills。 */
  includeSkills?: boolean;
}

export interface LocalConfigFile {
  id: string;
  clientId: string;
  clientLabel: string;
  label: string;
  path: string;
  format: 'json' | 'toml';
  exists: boolean;
  size?: number;
  lastModified?: number;
}

export interface LocalCliTool {
  id: string;
  name: string;
  command: string;
  installed: boolean;
  executablePath?: string;
  version?: string;
  configFiles: LocalConfigFile[];
}

export interface LocalCliScanResult {
  tools: LocalCliTool[];
  scannedAt: number;
}

export interface LocalMcpServer {
  id: string;
  name: string;
  clientId: string;
  clientLabel: string;
  configPath: string;
  transport: string;
  command?: string;
  args: string[];
  url?: string;
  version: string;
  enabled: boolean;
  redactedConfig: string;
}

export interface LocalMcpScanResult {
  configFiles: LocalConfigFile[];
  servers: LocalMcpServer[];
  scannedAt: number;
}

export type LocalAssetKind = 'memory' | 'plugin' | 'agent';

export interface LocalAssetSource {
  id: string;
  kind: LocalAssetKind;
  label: string;
  path: string;
  exists: boolean;
}

export interface LocalManagedAsset {
  id: string;
  kind: LocalAssetKind;
  name: string;
  description: string;
  sourceId: string;
  sourceLabel: string;
  localPath: string;
  configPath: string;
  relativePath: string;
  resourceType: string;
  version?: string;
  size: number;
  lastModified: number;
}

export interface LocalAssetScanResult {
  kind: LocalAssetKind;
  sources: LocalAssetSource[];
  items: LocalManagedAsset[];
  scannedAt: number;
}

export type ManagementModuleId =
  | 'local-cli'
  | 'local-plugins'
  | 'local-mcp'
  | 'local-agents'
  | 'skills'
  | 'local-prompts'
  | 'local-memories';

export interface ManagementModuleStatus {
  count: number;
  scanned: boolean;
  loading: boolean;
}

export type AiClientId = 'codex' | 'claude' | 'gemini' | 'openclaw' | 'other';

export type LocalGitProvider = 'github' | 'gitee' | 'other' | 'local';

export interface LocalGitRepository {
  id: string;
  name: string;
  localPath: string;
  currentBranch: string;
  remoteUrl?: string;
  provider: LocalGitProvider;
  dirtyFiles?: number;
  lastCommit?: string;
  lastCommitAt?: string;
}

export interface LocalGitScanResult {
  roots: string[];
  repositories: LocalGitRepository[];
  scannedAt: number;
}

export interface SceneMemoryReference {
  name: string;
  path: string;
  sourceLabel: string;
}

export interface ReusableScene {
  id: string;
  title: string;
  clientId: AiClientId;
  task: string;
  context: string;
  constraints: string;
  expectedOutput: string;
  tags: string[];
  memories: SceneMemoryReference[];
  createdAt: string;
  updatedAt: string;
}

export interface SaveReusableSceneInput {
  id?: string;
  title: string;
  clientId: AiClientId;
  task: string;
  context?: string;
  constraints?: string;
  expectedOutput?: string;
  tags?: string[];
  memories?: SceneMemoryReference[];
}

export interface ReusableSceneStore {
  path: string;
  scenes: ReusableScene[];
}

export interface SkillParseResult {
  name: string;
  description: string;
  version?: string;
  author?: string;
}

export interface InstalledSkill extends SkillParseResult {
  id: string;
  directoryId: string;
  product: ProductKind;
  localPath: string;
  skillFilePath: string;
  storageKind: SkillStorageKind;
  linkTarget?: string;
  source: SkillSource;
  sourceUrl?: string;
  favorite: boolean;
  tags: string[];
  moduleTags: string[];
  callTrackingEnabled: boolean;
  memoryOptimizationEnabled: boolean;
  callCount: number;
  lastCalledAt?: number;
  installDate?: number;
  lastModified?: number;
  disabled: boolean;
  securityLevel: SecurityLevel;
  securityScore?: number;
  lastScannedAt?: number;
}

export interface SecurityIssue {
  ruleId: string;
  ruleName: string;
  file: string;
  line: number;
  code: string;
  severity: Exclude<SecurityLevel, 'safe' | 'unscanned'>;
  description: string;
  recommendation: string;
}

export interface SecurityReport {
  skillId: string;
  score: number;
  level: Exclude<SecurityLevel, 'unscanned'>;
  issues: SecurityIssue[];
  recommendations: string[];
  scannedFiles: string[];
  blocked: boolean;
}

export interface SkillUsageEvent {
  id: string;
  skillId: string;
  eventType: 'manualCall' | 'view' | 'openFolder' | 'scan' | 'optimize' | 'agentCall';
  source: 'manual' | 'manager' | 'claude' | 'codex' | 'custom';
  timestamp: number;
  note?: string;
}

export interface SkillUserMeta {
  skillId: string;
  name?: string;
  localPath?: string;
  product?: ProductKind;
  favorite: boolean;
  tags: string[];
  callCount: number;
  lastCalledAt?: number;
  usageEvents: SkillUsageEvent[];
  source?: SkillSource;
  sourceUrl?: string;
  installDate?: number;
  securityReport?: SecurityReport;
}

export interface OperationLogEntry {
  id: string;
  skillId: string;
  skillName: string;
  skillPath?: string;
  product?: ProductKind;
  eventType: SkillUsageEvent['eventType'];
  action: string;
  source: SkillUsageEvent['source'];
  timestamp: number;
  detail?: string;
}

export interface OperationResult {
  success: boolean;
  message: string;
  outputPath?: string;
}

export interface PromptBatchUpdateResult {
  updated: string[];
  skipped: string[];
  failed: Array<{ path: string; error: string }>;
}

export interface TokenUsageDay {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
}

export interface TokenUsageSession extends TokenUsageDay {
  id: string;
  name: string;
  project: string;
}

export interface TokenUsageModule {
  name: string;
  sessionCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
}

export interface TokenUsageReport {
  source: 'ccusage';
  fetchedAt: number;
  since: string;
  until: string;
  days: TokenUsageDay[];
  sessions: TokenUsageSession[];
  modules: TokenUsageModule[];
  totals: Omit<TokenUsageDay, 'date'>;
  error?: string;
}

export interface StorageSettings {
  directory: string;
  defaultDirectory: string;
  error?: string;
}

export interface SwitchStorageInput {
  directory: string;
  mode: 'migrate' | 'restore';
}

export interface SkillsManagerApi {
  getStorageSettings: () => Promise<StorageSettings>;
  chooseStorageDirectory: () => Promise<string | null>;
  openStorageDirectory: () => Promise<void>;
  switchStorageDirectory: (input: SwitchStorageInput) => Promise<StorageSettings>;
  loadPreferences: (legacy: Record<string, string>) => Promise<Record<string, string>>;
  savePreference: (key: string, value: string | null) => Promise<void>;
  ping: () => Promise<string>;
  copyText: (text: string) => Promise<void>;
  openExternalUrl: (url: string) => Promise<void>;
  getAppSettings: () => Promise<AppSettings>;
  saveAppSettings: (input: UpdateAppSettingsInput) => Promise<AppSettings>;
  getDirectories: () => Promise<SkillDirectory[]>;
  saveDefaultDirectories: (directories: SkillDirectory[]) => Promise<SkillDirectory[]>;
  saveCustomDirectories: (directories: SkillDirectory[]) => Promise<SkillDirectory[]>;
  getDefaultModuleCandidates: () => Promise<DefaultModuleCandidate[]>;
  createModule: (input: CreateModuleInput) => Promise<OperationResult>;
  removeModule: (directoryId: string) => Promise<OperationResult>;
  scanSkills: () => Promise<InstalledSkill[]>;
  scanLocalPrompts: (options?: LocalPromptScanOptions) => Promise<LocalPromptScanResult>;
  readLocalPrompt: (promptPath: string) => Promise<string>;
  applyTokenSavingPrompt: (promptPaths: string[]) => Promise<PromptBatchUpdateResult>;
  getTokenSavingFeatureStatus: (promptPaths: string[]) => Promise<import('./tokenSavingFeatures.js').TokenSavingFileStatus[]>;
  setTokenSavingFeature: (promptPaths: string[], id: import('./tokenSavingFeatures.js').TokenSavingFeatureId, enabled: boolean, mode: import('./tokenSavingFeatures.js').TokenSavingMode) => Promise<PromptBatchUpdateResult>;
  executeRtk: (action: 'status' | 'install' | 'enable' | 'gain', client: 'codex' | 'claude') => Promise<string>;
  exportTokenSavingGuide: () => Promise<{ localPath: string; reference: string }>;
  restoreTokenSavingPrompt: (promptPaths: string[]) => Promise<PromptBatchUpdateResult>;
  getTokenUsage: (days?: number) => Promise<TokenUsageReport>;
  revealLocalPrompt: (promptPath: string) => Promise<void>;
  scanLocalClis: () => Promise<LocalCliScanResult>;
  scanLocalMcps: () => Promise<LocalMcpScanResult>;
  readLocalConfig: (configPath: string) => Promise<string>;
  revealLocalResource: (resourcePath: string) => Promise<void>;
  scanLocalMemories: () => Promise<LocalAssetScanResult>;
  scanLocalPlugins: () => Promise<LocalAssetScanResult>;
  scanLocalAgents: () => Promise<LocalAssetScanResult>;
  readLocalAsset: (assetPath: string) => Promise<string>;
  revealLocalAsset: (assetPath: string) => Promise<void>;
  scanLocalRepositories: (rootPath?: string) => Promise<LocalGitScanResult>;
  chooseLocalRepositoryRoot: () => Promise<string | undefined>;
  revealLocalRepository: (repositoryPath: string) => Promise<void>;
  listReusableScenes: () => Promise<ReusableSceneStore>;
  saveReusableScene: (input: SaveReusableSceneInput) => Promise<ReusableScene>;
  deleteReusableScene: (sceneId: string) => Promise<void>;
  revealReusableSceneStore: () => Promise<void>;
  readSkill: (skillPath: string) => Promise<string>;
  setSkillEnabled: (skillPath: string, enabled: boolean) => Promise<OperationResult>;
  setSkillCallTracking: (skillPath: string, skillId: string, enabled: boolean) => Promise<OperationResult>;
  recordSkillCall: (skillPath: string, source?: SkillUsageEvent['source']) => Promise<OperationResult>;
  openFolder: (folderPath: string) => Promise<void>;
  uninstallSkill: (skillPath: string) => Promise<OperationResult>;
  importLocalSkill: (sourcePath: string, targetDirectoryId?: string) => Promise<OperationResult>;
  importGithubSkill: (repoUrl: string, targetDirectoryId?: string) => Promise<OperationResult>;
  syncSkillToDirectory: (skillPath: string, targetDirectoryId: string, mode: SyncMode) => Promise<OperationResult>;
  syncRepositoryModule: (directoryId: string) => Promise<OperationResult>;
  createGithubSkill: (input: CreateGithubSkillInput) => Promise<OperationResult>;
  checkGithubSkillUpdates: () => Promise<GithubSkillUpdateStatus[]>;
  updateGithubSkill: (skillPath: string, skillId: string) => Promise<GithubSkillUpdateResult>;
  listMarketplaceSkills: () => Promise<MarketplaceSkill[]>;
  addMarketplaceSkill: (input: MarketplaceAddInput) => Promise<OperationResult>;
  removeMarketplaceSkill: (id: string) => Promise<OperationResult>;
  installMarketplaceSkill: (input: MarketplaceInstallInput) => Promise<OperationResult>;
  shareMarketplaceSkill: (id: string) => Promise<OperationResult>;
  getOperationLogs: () => Promise<OperationLogEntry[]>;
  getGithubStarSettings: () => Promise<GithubStarSettings>;
  saveGithubStarCredentials: (input: GithubStarCredentialsInput) => Promise<GithubStarSettings>;
  syncGithubStars: (input?: GithubStarSyncInput) => Promise<OperationResult>;
  listGithubStars: () => Promise<GithubStarRepository[]>;
  updateGithubStarMeta: (input: GithubStarMetaInput) => Promise<GithubStarRepository>;
  searchGithubRepositories: (input?: GithubRepositorySearchInput) => Promise<GithubRecommendedRepository[]>;
  starGithubRepository: (input: GithubStarRepositoryInput) => Promise<OperationResult>;
  getGiteeSettings: () => Promise<GiteeSettings>;
  saveGiteeCredentials: (input: GiteeCredentialsInput) => Promise<GiteeSettings>;
  syncGiteeStars: (input?: GiteeStarSyncInput) => Promise<OperationResult>;
  listGiteeStars: () => Promise<GiteeRepository[]>;
  updateGiteeRepoMeta: (input: GiteeRepoMetaInput) => Promise<GiteeRepository>;
  tagGiteeRepositoriesByPrefix: (input: GiteeBatchTagInput) => Promise<GiteeBatchTagResult>;
  searchGiteeRepositories: (input?: GiteeRepositorySearchInput) => Promise<GiteeRecommendedRepository[]>;
  starGiteeRepository: (input: GiteeStarRepositoryInput) => Promise<OperationResult>;
  saveGiteeRepository: (input: { fullName: string }) => Promise<OperationResult>;
  packageSkills: (input: PackageSkillsInput) => Promise<OperationResult>;
  optimizeSkill: (skillPath: string, skillId: string) => Promise<OperationResult>;
  setSkillOptimization: (skillPath: string, skillId: string, enabled: boolean) => Promise<OperationResult>;
  recordSkillEvolution: (skillPath: string, skillId: string, note: string) => Promise<OperationResult>;
  updateSkillUserMeta: (skillId: string, input: { favorite?: boolean; tags?: string[] }) => Promise<SkillUserMeta>;
  recordUsage: (
    skillId: string,
    eventType?: SkillUsageEvent['eventType'],
    source?: SkillUsageEvent['source'],
    note?: string
  ) => Promise<SkillUserMeta>;
  scanSkillSecurity: (skillPath: string, skillId: string) => Promise<SecurityReport>;
  scanAllSecurity: () => Promise<SecurityReport[]>;
}
