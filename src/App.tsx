import { appStorage } from './shared/appStorage';
import {
  Bot,
  Brain,
  BookOpen,
  Box,
  Database,
  FolderPlus,
  FolderCog,
  FileText,
  Network,
  Package,
  Github,
  LayoutDashboard,
  History,
  Store,
  RefreshCw,
  ShieldCheck,
  GitBranch,
  Sparkles,
  SquareTerminal
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Dashboard from './components/Dashboard';
import TokenUsagePanel from './components/TokenUsagePanel';
import GiteeStarsPanel from './components/GiteeStarsPanel';
import GithubStarsPanel from './components/GithubStarsPanel';
import ImportPanel from './components/ImportPanel';
import OperationLogsPanel from './components/OperationLogsPanel';
import MarketplacePanel from './components/MarketplacePanel';
import SecurityPanel from './components/SecurityPanel';
import SettingsPanel from './components/SettingsPanel';
import SkillDetails from './components/SkillDetails';
import SkillTable from './components/SkillTable';
import PromptGeneratorPanel from './components/PromptGeneratorPanel';
import PromptManagerPanel from './components/PromptManagerPanel';
import SceneMemoryPanel from './components/SceneMemoryPanel';
import CliManagerPanel from './components/CliManagerPanel';
import McpManagerPanel from './components/McpManagerPanel';
import LocalAssetManagerPanel from './components/LocalAssetManagerPanel';
import type { AiClientId, InstalledSkill, LocalAssetKind, LocalAssetScanResult, LocalCliScanResult, LocalMcpScanResult, LocalPromptScanOptions, LocalPromptScanResult, ManagementModuleId, OperationLogEntry, SecurityReport, ShareTarget, SkillDirectory, SyncMode } from './shared/types';
import { getErrorMessage } from './shared/uiUtils';

type PageId =
  | 'dashboard'
  | 'token-usage'
  | 'github-to-skill'
  | 'repo-management'
  | 'prompt'
  | 'scene-memory'
  | 'local-prompts'
  | 'local-cli'
  | 'local-mcp'
  | 'local-plugins'
  | 'local-agents'
  | 'local-memories'
  | 'skills'
  | 'marketplace'
  | 'import'
  | 'security'
  | 'settings'
  | 'github'
  | 'gitee'
  | 'logs';

type NavItem = { id: PageId; label: string; description: string; icon: typeof LayoutDashboard };
type NavSection = { label?: string; items: NavItem[] };

const navSections: NavSection[] = [
  { items: [
    { id: 'dashboard', label: '总览', description: '查看本机 Skills 数量、风险、星标和最近使用。', icon: LayoutDashboard },
    { id: 'token-usage', label: '统计', description: '按模块查看本地会话 Token 消耗、Skills 调用次数和费用估算。', icon: History }
  ] },
  { label: 'AI 管理', items: [
    { id: 'local-cli', label: '我的 CLI', description: '查看本机 CLI 的安装状态、版本、程序路径和配置文件。', icon: SquareTerminal },
    { id: 'local-plugins', label: '我的插件', description: '查看本地插件与版本。', icon: Package },
    { id: 'local-mcp', label: '我的 MCP', description: '汇总本机 MCP Server 配置、传输方式、版本和来源路径。', icon: Network },
    { id: 'local-agents', label: '我的 Agent', description: '扫描本地 Agent 定义与配置文件。', icon: Bot },
    { id: 'skills', label: '我的 Skills', description: '管理 Skills、标签、星标、同步、打包和优化记忆。', icon: BookOpen },
    { id: 'local-prompts', label: '我的提示词', description: '扫描并管理本地提示词文件。', icon: FileText },
    { id: 'local-memories', label: '我的记忆', description: '查看本地记忆文件。', icon: Brain }
  ] },
  { label: '代码仓库 AI 化 · GitHub 管理', items: [
    { id: 'github-to-skill', label: 'GitHub 转 Skill', description: '将 GitHub 仓库包装为本地 Skill 模块。', icon: Github },
    { id: 'repo-management', label: '仓库技能管理', description: '检查并同步仓库来源 Skills。', icon: GitBranch },
    { id: 'github', label: 'GitHub 收藏管理', description: '管理 GitHub Star、高星推荐和标签。', icon: Github },
    { id: 'gitee', label: 'Gitee 管理', description: '管理 Gitee 收藏、高星推荐和标签。', icon: GitBranch }
  ] },
  { items: [
    { id: 'import', label: '设置', description: '管理模块、新增模块、默认路径和扫描入口。', icon: FolderCog },
    { id: 'security', label: '安全扫描', description: '检查 Skills 中的高风险脚本、敏感路径和提示注入风险。', icon: ShieldCheck },
    { id: 'logs', label: '日志', description: '查看扫描、同步、优化记忆和系统操作记录。', icon: History }
  ] },
  { label: '社区市场', items: [
    { id: 'marketplace', label: '社区市场首页', description: '浏览、安装并分享社区贡献的 Skills。', icon: Store },
    { id: 'scene-memory', label: '场景复用', description: '沉淀任务场景，关联本地记忆并复用到提示词。', icon: Brain }
  ] }
];

const navItems = navSections.flatMap((section) => section.items);

export default function App() {
  const [activePage, setActivePage] = useState<PageId>('dashboard');
  const [directories, setDirectories] = useState<SkillDirectory[]>([]);
  const [skills, setSkills] = useState<InstalledSkill[]>([]);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [skillContent, setSkillContent] = useState('');
  const [securityReports, setSecurityReports] = useState<SecurityReport[]>([]);
  const [operationLogs, setOperationLogs] = useState<OperationLogEntry[]>([]);
  const [promptScan, setPromptScan] = useState<LocalPromptScanResult>({ sources: [], prompts: [], scannedAt: 0 });
  const [promptScanOptions, setPromptScanOptions] = useState<LocalPromptScanOptions>(() => ({
    includeSkills: appStorage.getItem('ai-money-master:prompt-scan-skills') === 'true'
  }));
  const [cliScan, setCliScan] = useState<LocalCliScanResult>({ tools: [], scannedAt: 0 });
  const [mcpScan, setMcpScan] = useState<LocalMcpScanResult>({ configFiles: [], servers: [], scannedAt: 0 });
  const [pluginScan, setPluginScan] = useState<LocalAssetScanResult>(() => emptyAssetScan('plugin'));
  const [agentScan, setAgentScan] = useState<LocalAssetScanResult>(() => emptyAssetScan('agent'));
  const [memoryScan, setMemoryScan] = useState<LocalAssetScanResult>(() => emptyAssetScan('memory'));
  const [skillsScannedAt, setSkillsScannedAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [promptLoading, setPromptLoading] = useState(true);
  const [cliLoading, setCliLoading] = useState(false);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [pluginLoading, setPluginLoading] = useState(false);
  const [agentLoading, setAgentLoading] = useState(false);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [moduleScanRunning, setModuleScanRunning] = useState(false);
  const [notice, setNotice] = useState('正在连接本地桌面能力...');
  const [moduleDialogOpen, setModuleDialogOpen] = useState(false);

  const refreshData = useCallback(async () => {
    setLoading(true);
    if (!window.skillsManager) {
      setLoading(false);
      setPromptLoading(false);
      setNotice('浏览器预览：提示词生成可用；Skills 管理请在桌面应用中使用');
      return;
    }
    try {
      const api = getApi();
      const [nextDirectories, nextSkills, nextLogs, nextPromptScan] = await Promise.all([
        api.getDirectories(),
        api.scanSkills(),
        api.getOperationLogs(),
        api.scanLocalPrompts(promptScanOptions)
      ]);
      setDirectories(nextDirectories);
      setSkills(nextSkills);
      setSkillsScannedAt(Date.now());
      setOperationLogs(nextLogs);
      setPromptScan(nextPromptScan);
      setNotice(`已扫描 ${nextSkills.length} 个 Skills、${nextPromptScan.prompts.length} 个提示词`);
    } catch (error) {
      setNotice(`扫描失败：${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
      setPromptLoading(false);
    }
  }, [promptScanOptions]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  useEffect(() => {
    if (activePage === 'local-cli' && cliScan.scannedAt === 0 && !cliLoading) void handleRescanClis();
    if (activePage === 'local-mcp' && mcpScan.scannedAt === 0 && !mcpLoading) void handleRescanMcps();
    if (activePage === 'local-plugins' && pluginScan.scannedAt === 0 && !pluginLoading) void handleRescanAsset('plugin');
    if (activePage === 'local-agents' && agentScan.scannedAt === 0 && !agentLoading) void handleRescanAsset('agent');
    if ((activePage === 'local-memories' || activePage === 'scene-memory') && memoryScan.scannedAt === 0 && !memoryLoading) void handleRescanAsset('memory');
  }, [activePage]);

  const selectedSkill = useMemo(
    () => (selectedSkillId ? skills.find((skill) => skill.id === selectedSkillId) ?? null : null),
    [selectedSkillId, skills]
  );
  const selectedReport = useMemo(
    () => (selectedSkillId ? securityReports.find((report) => report.skillId === selectedSkillId) : undefined),
    [securityReports, selectedSkillId]
  );
  const activeNavItem = navItems.find((item) => item.id === activePage) ?? navItems[0];
  const desktopAvailable = Boolean(window.skillsManager);

  async function handleViewSkill(skill: InstalledSkill) {
    const api = getApi();
    setSelectedSkillId(skill.id);
    setSkillContent('加载中...');
    try {
      const content = await api.readSkill(skill.localPath);
      setSkillContent(content);
      await api.recordUsage(skill.id, 'view', 'manager');
      await refreshData();
    } catch (error) {
      setSkillContent(`读取失败：${getErrorMessage(error)}`);
    }
  }

  async function handleOpenFolder(skill: InstalledSkill) {
    const api = getApi();
    await api.openFolder(skill.localPath);
    await api.recordUsage(skill.id, 'openFolder', 'manager');
    await refreshData();
  }

  async function handleToggleFavorite(skill: InstalledSkill) {
    await getApi().updateSkillUserMeta(skill.id, { favorite: !skill.favorite });
    await refreshData();
  }

  async function handleEditTags(skill: InstalledSkill, tags: string[]) {
    await getApi().updateSkillUserMeta(skill.id, { tags });
    setNotice(`已更新标签：${skill.name}`);
    await refreshData();
  }

  async function handleSetSkillEnabled(skill: InstalledSkill, enabled: boolean) {
    try {
      const result = await getApi().setSkillEnabled(skill.localPath, enabled);
      setNotice(`${result.message}：${skill.name}`);
      await refreshData();
    } catch (error) {
      setNotice(`${enabled ? '启用' : '禁用'}失败：${getErrorMessage(error)}`);
    }
  }

  async function handleSetCallTracking(skill: InstalledSkill, enabled: boolean) {
    try {
      const result = await getApi().setSkillCallTracking(skill.localPath, skill.id, enabled);
      setNotice(`${result.message}：${skill.name}`);
      await refreshData();
      if (selectedSkillId === skill.id) {
        const content = await getApi().readSkill(skill.localPath);
        setSkillContent(content);
      }
    } catch (error) {
      setNotice(`${enabled ? '启用调用统计' : '停用调用统计'}失败：${getErrorMessage(error)}`);
    }
  }

  async function handleScanSkill(skill: InstalledSkill) {
    try {
      const report = await getApi().scanSkillSecurity(skill.localPath, skill.id);
      setSecurityReports((reports) => [report, ...reports.filter((item) => item.skillId !== skill.id)]);
      await refreshData();
      setNotice(`${skill.name} 安全扫描完成：${report.score} 分`);
    } catch (error) {
      setNotice(`安全扫描失败：${getErrorMessage(error)}`);
    }
  }

  async function handleSetOptimization(skill: InstalledSkill, enabled: boolean) {
    try {
      const result = await getApi().setSkillOptimization(skill.localPath, skill.id, enabled);
      setNotice(`${result.message}：${skill.name}`);
      await refreshData();
      if (selectedSkillId === skill.id) {
        const content = await getApi().readSkill(skill.localPath);
        setSkillContent(content);
      }
    } catch (error) {
      setNotice(`${enabled ? '启用优化' : '停用优化'}失败：${getErrorMessage(error)}`);
    }
  }

  async function handleRecordSkillEvolution(skill: InstalledSkill) {
    const note = window.prompt('请输入要沉淀到此 Skill 的经验、偏好或失败教训：');
    if (note === null) return;
    try {
      const result = await getApi().recordSkillEvolution(skill.localPath, skill.id, note);
      setNotice(result.message);
      await refreshData();
      if (selectedSkillId === skill.id) {
        const content = await getApi().readSkill(skill.localPath);
        setSkillContent(content);
      }
    } catch (error) {
      setNotice(`沉淀失败：${getErrorMessage(error)}`);
    }
  }

  async function handleDeleteSkill(skill: InstalledSkill) {
    const confirmed = window.confirm(`确认删除此 Skill 文件夹？\n\n${skill.localPath}`);
    if (!confirmed) return;
    try {
      const result = await getApi().uninstallSkill(skill.localPath);
      setNotice(result.message);
      if (selectedSkillId === skill.id) setSelectedSkillId(null);
      await refreshData();
    } catch (error) {
      setNotice(`删除失败：${getErrorMessage(error)}`);
    }
  }

  async function handleDeleteSelectedSkills(selectedSkills: InstalledSkill[]) {
    if (selectedSkills.length === 0) return false;
    const samplePaths = selectedSkills
      .slice(0, 5)
      .map((skill) => skill.localPath)
      .join('\n');
    const suffix = selectedSkills.length > 5 ? `\n... 另有 ${selectedSkills.length - 5} 个` : '';
    const confirmed = window.confirm(`确认删除选中的 ${selectedSkills.length} 个 Skills？\n\n${samplePaths}${suffix}`);
    if (!confirmed) return false;

    const api = getApi();
    let deletedCount = 0;
    const failures: string[] = [];
    for (const skill of selectedSkills) {
      try {
        await api.uninstallSkill(skill.localPath);
        deletedCount += 1;
      } catch (error) {
        failures.push(`${skill.name}: ${getErrorMessage(error)}`);
      }
    }

    if (selectedSkillId && selectedSkills.some((skill) => skill.id === selectedSkillId)) {
      setSelectedSkillId(null);
    }
    await refreshData();
    if (failures.length > 0) {
      setNotice(`已删除 ${deletedCount} 个，失败 ${failures.length} 个：${failures.slice(0, 2).join('；')}`);
    } else {
      setNotice(`已删除 ${deletedCount} 个 Skills`);
    }
    return deletedCount > 0;
  }

  async function handlePackageSelectedSkills(selectedSkills: InstalledSkill[], shareTarget: ShareTarget) {
    if (selectedSkills.length === 0) return false;
    try {
      const result = await getApi().packageSkills({
        skillPaths: selectedSkills.map((skill) => skill.localPath),
        shareTarget
      });
      setNotice(result.message);
      return true;
    } catch (error) {
      setNotice(`打包失败：${getErrorMessage(error)}`);
      return false;
    }
  }

  async function handleSyncSkillToDirectory(skill: InstalledSkill, targetDirectoryId: string, mode: SyncMode) {
    try {
      const result = await getApi().syncSkillToDirectory(skill.localPath, targetDirectoryId, mode);
      setNotice(result.message);
      await refreshData();
    } catch (error) {
      setNotice(`同步失败：${getErrorMessage(error)}`);
    }
  }

  async function handleRunAllSecurityScan() {
    setNotice('正在扫描全部 Skills...');
    try {
      const reports = await getApi().scanAllSecurity();
      setSecurityReports(reports);
      await refreshData();
      setNotice(`全部安全扫描完成：${reports.length} 个 Skills`);
    } catch (error) {
      setNotice(`批量扫描失败：${getErrorMessage(error)}`);
    }
  }

  async function handleSaveCustomDirectories(customDirectories: SkillDirectory[]) {
    const saved = await getApi().saveCustomDirectories(customDirectories);
    setDirectories(saved);
    await refreshData();
  }

  async function handleSyncRepositoryModule(directoryId: string) {
    try {
      const result = await getApi().syncRepositoryModule(directoryId);
      setNotice(result.message);
      await refreshData();
    } catch (error) {
      setNotice(`仓库同步失败：${getErrorMessage(error)}`);
    }
  }

  async function handleSaveDefaultDirectories(defaultDirectories: SkillDirectory[]) {
    const saved = await getApi().saveDefaultDirectories(defaultDirectories);
    setDirectories(saved);
    await refreshData();
  }

  async function handleRescanPrompts() {
    setPromptLoading(true);
    try {
      const nextPromptScan = await getApi().scanLocalPrompts(promptScanOptions);
      setPromptScan(nextPromptScan);
      setNotice(`已扫描 ${nextPromptScan.prompts.length} 个本地提示词`);
    } catch (error) {
      setNotice(`提示词扫描失败：${getErrorMessage(error)}`);
    } finally {
      setPromptLoading(false);
    }
  }

  async function handlePromptScanOptionsChange(nextOptions: LocalPromptScanOptions) {
    setPromptScanOptions(nextOptions);
    appStorage.setItem('ai-money-master:prompt-scan-skills', String(nextOptions.includeSkills === true));
    setPromptLoading(true);
    try {
      const nextPromptScan = await getApi().scanLocalPrompts(nextOptions);
      setPromptScan(nextPromptScan);
      setNotice(`已按${nextOptions.includeSkills ? '全局提示词和 Skills' : '全局提示词'}范围扫描 ${nextPromptScan.prompts.length} 个提示词`);
    } catch (error) {
      setNotice(`提示词扫描失败：${getErrorMessage(error)}`);
    } finally {
      setPromptLoading(false);
    }
  }

  async function handleRescanClis() {
    setCliLoading(true);
    try {
      const nextScan = await getApi().scanLocalClis();
      setCliScan(nextScan);
      setNotice(`已发现 ${nextScan.tools.filter((tool) => tool.installed).length} 个本地 CLI`);
    } catch (error) {
      setNotice(`CLI 扫描失败：${getErrorMessage(error)}`);
    } finally {
      setCliLoading(false);
    }
  }

  async function handleRescanMcps() {
    setMcpLoading(true);
    try {
      const nextScan = await getApi().scanLocalMcps();
      setMcpScan(nextScan);
      setNotice(`已发现 ${nextScan.servers.length} 个本地 MCP Server`);
    } catch (error) {
      setNotice(`MCP 扫描失败：${getErrorMessage(error)}`);
    } finally {
      setMcpLoading(false);
    }
  }

  async function handleRescanAsset(kind: LocalAssetKind) {
    const api = getApi();
    const setLoadingState = kind === 'plugin' ? setPluginLoading : kind === 'agent' ? setAgentLoading : setMemoryLoading;
    setLoadingState(true);
    try {
      const nextScan = kind === 'plugin'
        ? await api.scanLocalPlugins()
        : kind === 'agent'
          ? await api.scanLocalAgents()
          : await api.scanLocalMemories();
      if (kind === 'plugin') setPluginScan(nextScan);
      else if (kind === 'agent') setAgentScan(nextScan);
      else setMemoryScan(nextScan);
      const label = kind === 'plugin' ? '插件' : kind === 'agent' ? 'Agent' : '记忆';
      setNotice(`已发现 ${nextScan.items.length} 个本地${label}`);
    } catch (error) {
      setNotice(`本地资源扫描失败：${getErrorMessage(error)}`);
    } finally {
      setLoadingState(false);
    }
  }

  async function scanManagementModule(moduleId: ManagementModuleId, selectedClients: Set<AiClientId>) {
    const api = getApi();
    if (moduleId === 'local-cli') {
      setCliLoading(true);
      try {
        const nextScan = await api.scanLocalClis();
        setCliScan((current) => ({ ...nextScan, tools: mergeClientItems(current.tools, nextScan.tools, (tool) => cliClientId(tool.id), selectedClients) }));
      } finally { setCliLoading(false); }
      return;
    }
    if (moduleId === 'local-plugins') {
      setPluginLoading(true);
      try {
        const nextScan = await api.scanLocalPlugins();
        setPluginScan((current) => ({ ...nextScan, items: mergeClientItems(current.items, nextScan.items, (item) => sourceClientId(item.sourceId), selectedClients) }));
      } finally { setPluginLoading(false); }
      return;
    }
    if (moduleId === 'local-mcp') {
      setMcpLoading(true);
      try {
        const nextScan = await api.scanLocalMcps();
        setMcpScan((current) => ({
          ...nextScan,
          configFiles: mergeClientItems(current.configFiles, nextScan.configFiles, (file) => sourceClientId(file.clientId), selectedClients),
          servers: mergeClientItems(current.servers, nextScan.servers, (server) => sourceClientId(server.clientId), selectedClients)
        }));
      } finally { setMcpLoading(false); }
      return;
    }
    if (moduleId === 'local-agents') {
      setAgentLoading(true);
      try {
        const nextScan = await api.scanLocalAgents();
        setAgentScan((current) => ({ ...nextScan, items: mergeClientItems(current.items, nextScan.items, (item) => sourceClientId(item.sourceId), selectedClients) }));
      } finally { setAgentLoading(false); }
      return;
    }
    if (moduleId === 'skills') {
      setLoading(true);
      try {
        const [nextDirectories, nextSkills, nextLogs] = await Promise.all([
          api.getDirectories(),
          api.scanSkills(),
          api.getOperationLogs()
        ]);
        setDirectories(nextDirectories);
        setSkills((current) => mergeClientItems(current, nextSkills, (skill) => sourceClientId(skill.product), selectedClients));
        setOperationLogs(nextLogs);
        setSkillsScannedAt(Date.now());
      } finally {
        setLoading(false);
      }
      return;
    }
    if (moduleId === 'local-prompts') {
      setPromptLoading(true);
      try {
      const nextScan = await api.scanLocalPrompts(promptScanOptions);
        setPromptScan((current) => ({ ...nextScan, prompts: mergeClientItems(current.prompts, nextScan.prompts, (prompt) => sourceClientId(prompt.sourceId), selectedClients) }));
      } finally { setPromptLoading(false); }
      return;
    }
    setMemoryLoading(true);
    try {
      const nextScan = await api.scanLocalMemories();
      setMemoryScan((current) => ({ ...nextScan, items: mergeClientItems(current.items, nextScan.items, (item) => sourceClientId(item.sourceId), selectedClients) }));
    } finally { setMemoryLoading(false); }
  }

  async function handleScanManagementModules(moduleIds: ManagementModuleId[], clientIds: AiClientId[]) {
    if (moduleIds.length === 0 || clientIds.length === 0 || moduleScanRunning) return;
    const selectedClients = new Set(clientIds);
    const clientLabel = clientIds.length === 5 ? '全部客户端' : clientIds.map(aiClientLabel).join('、');
    setModuleScanRunning(true);
    setNotice(`正在扫描 ${clientLabel} 的 ${moduleIds.length} 个能力层...`);
    try {
      const results = await Promise.allSettled(moduleIds.map((moduleId) => scanManagementModule(moduleId, selectedClients)));
      const failedCount = results.filter((result) => result.status === 'rejected').length;
      setNotice(failedCount > 0
        ? `${clientLabel}扫描完成：成功 ${results.length - failedCount} 层，失败 ${failedCount} 层`
        : `${clientLabel}扫描完成：${results.length} 个能力层全部成功`);
    } finally {
      setModuleScanRunning(false);
    }
  }

  function renderPage() {
    if (activePage === 'token-usage') {
      return <TokenUsagePanel onConfigureTokenSaving={() => setActivePage('local-prompts')} />;
    }

    if (activePage === 'prompt') {
      return <PromptGeneratorPanel setNotice={setNotice} />;
    }

    if (activePage === 'scene-memory') {
      return (
        <SceneMemoryPanel
          memoryScan={memoryScan}
          memoryLoading={memoryLoading}
          onRescanMemories={() => handleRescanAsset('memory')}
          onUseInPrompt={() => {
            setActivePage('prompt');
            setNotice('已将场景与本地记忆载入提示词生成');
          }}
          setNotice={setNotice}
        />
      );
    }

    if (activePage === 'local-prompts') {
      return (
        <PromptManagerPanel
          scanResult={promptScan}
          loading={promptLoading}
          onRescan={handleRescanPrompts}
          scanOptions={promptScanOptions}
          onScanOptionsChange={handlePromptScanOptionsChange}
          setNotice={setNotice}
        />
      );
    }

    if (activePage === 'local-cli') {
      return <CliManagerPanel scanResult={cliScan} loading={cliLoading} onRescan={handleRescanClis} setNotice={setNotice} />;
    }

    if (activePage === 'local-mcp') {
      return <McpManagerPanel scanResult={mcpScan} loading={mcpLoading} onRescan={handleRescanMcps} setNotice={setNotice} />;
    }

    if (activePage === 'local-plugins') {
      return <LocalAssetManagerPanel kind="plugin" scanResult={pluginScan} loading={pluginLoading} onRescan={() => handleRescanAsset('plugin')} setNotice={setNotice} />;
    }

    if (activePage === 'local-agents') {
      return <LocalAssetManagerPanel kind="agent" scanResult={agentScan} loading={agentLoading} onRescan={() => handleRescanAsset('agent')} setNotice={setNotice} />;
    }

    if (activePage === 'local-memories') {
      return <LocalAssetManagerPanel kind="memory" scanResult={memoryScan} loading={memoryLoading} onRescan={() => handleRescanAsset('memory')} setNotice={setNotice} />;
    }

    if (activePage === 'dashboard') {
      return (
        <Dashboard
          skills={skills}
          directories={directories}
          loading={loading}
          onRefresh={refreshData}
          onImport={() => setActivePage('import')}
          onSecurityScan={handleRunAllSecurityScan}
          moduleStatus={{
            'local-cli': { count: cliScan.tools.filter((tool) => tool.installed).length, scanned: cliScan.scannedAt > 0, loading: cliLoading },
            'local-plugins': { count: pluginScan.items.length, scanned: pluginScan.scannedAt > 0, loading: pluginLoading },
            'local-mcp': { count: mcpScan.servers.length, scanned: mcpScan.scannedAt > 0, loading: mcpLoading },
            'local-agents': { count: agentScan.items.length, scanned: agentScan.scannedAt > 0, loading: agentLoading },
            skills: { count: skills.length, scanned: skillsScannedAt > 0, loading },
            'local-prompts': { count: promptScan.prompts.length, scanned: promptScan.scannedAt > 0, loading: promptLoading },
            'local-memories': { count: memoryScan.items.length, scanned: memoryScan.scannedAt > 0, loading: memoryLoading }
          }}
          moduleScanRunning={moduleScanRunning}
          onScanModules={handleScanManagementModules}
          onNavigateModule={(moduleId) => setActivePage(moduleId)}
        />
      );
    }

    if (activePage === 'skills') {
      return (
        <SkillTable
          skills={skills}
          directories={directories}
          loading={loading}
          onView={handleViewSkill}
          onOpenFolder={handleOpenFolder}
          onToggleFavorite={handleToggleFavorite}
          onSetEnabled={handleSetSkillEnabled}
          onEditTags={handleEditTags}
          onSetCallTracking={handleSetCallTracking}
          onScan={handleScanSkill}
          onSetOptimization={handleSetOptimization}
          onDelete={handleDeleteSkill}
          onDeleteSelected={handleDeleteSelectedSkills}
          onPackageSelected={handlePackageSelectedSkills}
          onSyncToDirectory={handleSyncSkillToDirectory}
        />
      );
    }

    if (activePage === 'import') {
      return (
        <div className="stack">
          <ImportPanel
            mode="all"
            directories={directories}
            skillCount={skills.length}
            moduleDialogOpen={moduleDialogOpen}
            onModuleDialogOpenChange={setModuleDialogOpen}
            onImported={refreshData}
            onSyncRepositoryModule={handleSyncRepositoryModule}
            setNotice={setNotice}
          />
          <SettingsPanel
            directories={directories}
            onSaveDefaultDirectories={handleSaveDefaultDirectories}
            onSaveCustomDirectories={handleSaveCustomDirectories}
          />
        </div>
      );
    }

    if (activePage === 'github-to-skill' || activePage === 'repo-management') {
      return (
        <ImportPanel
          mode={activePage}
          directories={directories}
          skillCount={skills.length}
          moduleDialogOpen={false}
          onModuleDialogOpenChange={setModuleDialogOpen}
          onImported={refreshData}
          onSyncRepositoryModule={handleSyncRepositoryModule}
          setNotice={setNotice}
        />
      );
    }

    if (activePage === 'marketplace') {
      return <MarketplacePanel directories={directories} onInstalled={refreshData} setNotice={setNotice} />;
    }

    if (activePage === 'security') {
      return (
        <SecurityPanel
          skills={skills}
          reports={securityReports}
          onScanAll={handleRunAllSecurityScan}
          onScanOne={handleScanSkill}
        />
      );
    }

    if (activePage === 'settings') {
      return (
        <SettingsPanel
          directories={directories}
          onSaveDefaultDirectories={handleSaveDefaultDirectories}
          onSaveCustomDirectories={handleSaveCustomDirectories}
        />
      );
    }

    if (activePage === 'logs') {
      return <OperationLogsPanel logs={operationLogs} loading={loading} />;
    }

    if (activePage === 'github') {
      return <GithubStarsPanel setNotice={setNotice} />;
    }

    return <GiteeStarsPanel setNotice={setNotice} />;
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <Box size={22} />
          </div>
          <div>
            <h1>AI省钱大师</h1>
            <p>本地 QA 工作台</p>
          </div>
        </div>
        <nav className="nav-list">
          {navSections.map((section, sectionIndex) => (
            <div className="nav-section" key={section.label ?? `section-${sectionIndex}`}>
              {section.label && <div className="nav-section-label">{section.label}</div>}
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    className={`nav-item ${activePage === item.id ? 'active' : ''}`}
                    onClick={() => setActivePage(item.id)}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-card">
          <Database size={16} />
          <span>{notice}</span>
        </div>
      </aside>
      <section className="workspace">
        <header className="page-header">
          <div>
            <p className="eyebrow">AI省钱大师</p>
            <h2>{activeNavItem.label}</h2>
            <p className="subtitle">{activeNavItem.description}</p>
          </div>
          <div className="page-actions">
            {activePage === 'import' && (
              <button className="button secondary" onClick={() => setModuleDialogOpen(true)}>
                <FolderPlus size={16} />
                新增模块
              </button>
            )}
            {!['prompt', 'scene-memory', 'local-prompts', 'local-cli', 'local-plugins', 'local-mcp', 'local-agents', 'local-memories'].includes(activePage) && (
              <button className="button secondary" onClick={() => void refreshData()}>
                <RefreshCw size={16} />
                重新扫描
              </button>
            )}
          </div>
        </header>
        {desktopAvailable || activePage === 'prompt' ? renderPage() : <BrowserFallback />}
      </section>

      {selectedSkill && (
        <SkillDetails
          skill={selectedSkill}
          content={skillContent}
          report={selectedReport}
          onClose={() => setSelectedSkillId(null)}
          onSetCallTracking={handleSetCallTracking}
          onToggleFavorite={handleToggleFavorite}
          onEditTags={handleEditTags}
          onScan={handleScanSkill}
          onSetOptimization={handleSetOptimization}
          onRecordEvolution={handleRecordSkillEvolution}
        />
      )}
    </main>
  );
}

function BrowserFallback() {
  return (
    <div className="placeholder-panel desktop-required">
      <ShieldCheck size={42} />
      <h2>请在桌面应用窗口中使用完整功能</h2>
      <p>当前页面是浏览器预览页，不能访问本机 Skills 目录，因此扫描、导入、删除和安全检测都会被禁用。</p>
      <p>请打开 Electron 窗口，或在项目目录运行：</p>
      <code>npm run dev</code>
    </div>
  );
}

function getApi() {
  if (!window.skillsManager) {
    throw new Error('桌面能力不可用：请在 Electron 应用中使用完整功能');
  }
  return window.skillsManager;
}

function mergeClientItems<T extends { id: string }>(
  currentItems: T[],
  scannedItems: T[],
  getClientId: (item: T) => AiClientId | 'shared',
  selectedClients: Set<AiClientId>
) {
  const belongsToSelection = (item: T) => {
    const clientId = getClientId(item);
    return clientId === 'shared' || selectedClients.has(clientId);
  };
  const merged = [
    ...currentItems.filter((item) => !belongsToSelection(item)),
    ...scannedItems.filter(belongsToSelection)
  ];
  return Array.from(new Map(merged.map((item) => [item.id, item])).values());
}

function cliClientId(toolId: string): AiClientId | 'shared' {
  if (toolId === 'codex' || toolId === 'claude' || toolId === 'gemini' || toolId === 'openclaw') return toolId;
  return 'shared';
}

function sourceClientId(sourceId: string): AiClientId {
  const normalizedId = sourceId.toLowerCase();
  if (normalizedId.startsWith('codex')) return 'codex';
  if (normalizedId.startsWith('claude')) return 'claude';
  if (normalizedId.startsWith('gemini')) return 'gemini';
  if (normalizedId.startsWith('openclaw')) return 'openclaw';
  return 'other';
}

function aiClientLabel(clientId: AiClientId) {
  if (clientId === 'codex') return 'Codex';
  if (clientId === 'claude') return 'Claude Code';
  if (clientId === 'gemini') return 'Gemini';
  if (clientId === 'openclaw') return 'OpenClaw';
  return '其他客户端';
}

function emptyAssetScan(kind: LocalAssetKind): LocalAssetScanResult {
  return { kind, sources: [], items: [], scannedAt: 0 };
}
