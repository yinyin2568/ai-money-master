import { appStorage } from '../shared/appStorage';
import { Bot, Brain, BookOpen, ChevronRight, FileText, Folder, Heart, Import, Layers3, Network, Package, RefreshCw, ShieldCheck, SquareTerminal, Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AiClientId, InstalledSkill, ManagementModuleId, ManagementModuleStatus, SkillDirectory, TokenUsageReport } from '../shared/types';

interface DashboardProps {
  skills: InstalledSkill[];
  directories: SkillDirectory[];
  loading: boolean;
  onRefresh: () => void | Promise<void>;
  onImport: () => void;
  onSecurityScan: () => void | Promise<void>;
  moduleStatus: Record<ManagementModuleId, ManagementModuleStatus>;
  moduleScanRunning: boolean;
  onScanModules: (moduleIds: ManagementModuleId[], clientIds: AiClientId[]) => void | Promise<void>;
  onNavigateModule: (moduleId: ManagementModuleId) => void;
}

const managementModules: Array<{
  id: ManagementModuleId;
  layer: string;
  label: string;
  description: string;
  icon: typeof BookOpen;
}> = [
  { id: 'local-cli', layer: 'L1 · 运行入口', label: '我的 CLI', description: '本机命令、版本与运行路径', icon: SquareTerminal },
  { id: 'local-plugins', layer: 'L2 · 扩展层', label: '我的插件', description: '客户端插件与版本清单', icon: Package },
  { id: 'local-mcp', layer: 'L3 · 连接层', label: '我的 MCP', description: '外部服务与工具连接配置', icon: Network },
  { id: 'local-agents', layer: 'L4 · 执行层', label: '我的 Agent', description: 'Agent 定义与执行配置', icon: Bot },
  { id: 'skills', layer: 'L5 · 能力层', label: '我的 Skills', description: '可复用技能与模块能力', icon: BookOpen },
  { id: 'local-prompts', layer: 'L6 · 指令层', label: '我的提示词', description: '本地命令和提示词模板', icon: FileText },
  { id: 'local-memories', layer: 'L7 · 沉淀层', label: '我的记忆', description: '长期记忆与经验沉淀', icon: Brain }
];

const aiClients: Array<{ id: AiClientId; label: string; description: string }> = [
  { id: 'codex', label: 'Codex', description: 'Codex CLI 与本地能力' },
  { id: 'claude', label: 'Claude Code', description: 'Claude 配置与资源' },
  { id: 'gemini', label: 'Gemini', description: 'Gemini CLI 与资源' },
  { id: 'openclaw', label: 'OpenClaw', description: 'OpenClaw 插件与配置' },
  { id: 'other', label: '其他客户端', description: 'Cursor、Trae、Kiro 等' }
];

export default function Dashboard({
  skills,
  directories,
  loading,
  onRefresh,
  onImport,
  onSecurityScan,
  moduleStatus,
  moduleScanRunning,
  onScanModules,
  onNavigateModule
}: DashboardProps) {
  const [selectedModules, setSelectedModules] = useState<Set<ManagementModuleId>>(
    () => readStoredSelection('skills-manager:selected-modules', managementModules.map((module) => module.id))
  );
  const [selectedClients, setSelectedClients] = useState<Set<AiClientId>>(
    () => readStoredSelection('skills-manager:selected-clients', aiClients.map((client) => client.id))
  );
  const [tokenUsage, setTokenUsage] = useState<TokenUsageReport | null>(null);
  const [tokenUsageLoading, setTokenUsageLoading] = useState(false);
  const [tokenPricePerThousand, setTokenPricePerThousand] = useState(() => Number(appStorage.getItem('ai-money-master:token-price-per-thousand') ?? '0'));
  useEffect(() => appStorage.setItem('skills-manager:selected-modules', JSON.stringify([...selectedModules])), [selectedModules]);
  useEffect(() => appStorage.setItem('skills-manager:selected-clients', JSON.stringify([...selectedClients])), [selectedClients]);
  useEffect(() => {
    void refreshTokenUsage();
  }, []);
  useEffect(() => {
    appStorage.setItem('ai-money-master:token-price-per-thousand', String(tokenPricePerThousand || 0));
  }, [tokenPricePerThousand]);
  const claudeCount = skills.filter((skill) => skill.product === 'claude').length;
  const codexCount = skills.filter((skill) => skill.product === 'codex').length;
  const customCount = skills.filter((skill) => skill.product === 'custom').length;
  const riskCount = skills.filter((skill) => ['medium', 'high', 'critical'].includes(skill.securityLevel)).length;
  const favorites = skills.filter((skill) => skill.favorite).length;
  const recent = [...skills].sort((a, b) => (b.lastCalledAt ?? 0) - (a.lastCalledAt ?? 0)).slice(0, 5);

  async function refreshTokenUsage() {
    if (!window.skillsManager) return;
    setTokenUsageLoading(true);
    try {
      setTokenUsage(await window.skillsManager.getTokenUsage(30));
    } finally {
      setTokenUsageLoading(false);
    }
  }

  function toggleModule(moduleId: ManagementModuleId) {
    setSelectedModules((current) => {
      const next = new Set(current);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  }

  function toggleClient(clientId: AiClientId) {
    setSelectedClients((current) => {
      const next = new Set(current);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  }

  return (
    <div className="stack dashboard-page">
      <section className="panel module-overview-panel">
        <div className="panel-header">
          <div>
            <h3>本地 AI 能力栈</h3>
            <p>按顶层入口到底层记忆排列。勾选要执行的模块后统一扫描，点击模块卡片可直接进入详情。</p>
          </div>
          <Layers3 size={20} />
        </div>
        <div className="ai-client-selector">
          <div className="ai-client-selector-header">
            <div>
              <strong>先选择 AI 客户端</strong>
              <span>例如只选 Codex，将更新 Codex 关联的 CLI、插件、MCP、Agent、Skills、提示词和记忆。</span>
            </div>
            <div>
              <button className="button small ghost" onClick={() => setSelectedClients(new Set(aiClients.map((client) => client.id)))}>全选客户端</button>
              <button className="button small ghost" onClick={() => setSelectedClients(new Set())}>清空客户端</button>
            </div>
          </div>
          <div className="ai-client-options">
            {aiClients.map((client) => (
              <label className={selectedClients.has(client.id) ? 'selected' : ''} key={client.id} title={client.description}>
                <input type="checkbox" checked={selectedClients.has(client.id)} onChange={() => toggleClient(client.id)} />
                <span><strong>{client.label}</strong><small>{client.description}</small></span>
              </label>
            ))}
          </div>
        </div>
        <div className="module-scan-toolbar">
          <span>已选 {selectedClients.size} 个客户端、{selectedModules.size} / {managementModules.length} 个能力层</span>
          <button className="button small ghost" onClick={() => setSelectedModules(new Set(managementModules.map((module) => module.id)))}>全选</button>
          <button className="button small ghost" onClick={() => setSelectedModules(new Set())}>清空</button>
          <button className="button secondary" disabled={moduleScanRunning || selectedModules.size === 0 || selectedClients.size === 0} onClick={() => void onScanModules([...selectedModules], [...selectedClients])}>
            <RefreshCw size={15} />{moduleScanRunning ? '扫描中...' : '扫描选中客户端'}
          </button>
          <button className="button primary" disabled={moduleScanRunning} onClick={() => void onScanModules(managementModules.map((module) => module.id), aiClients.map((client) => client.id))}>
            <RefreshCw size={15} />一键扫描全部模块
          </button>
        </div>
        <div className="module-layer-list">
          {managementModules.map((module, index) => {
            const Icon = module.icon;
            const status = moduleStatus[module.id];
            return (
              <div className="module-layer-wrap" key={module.id}>
                <article className={`module-layer-card ${selectedModules.has(module.id) ? 'selected' : ''}`}>
                  <label title={`选择${module.label}`}>
                    <input type="checkbox" checked={selectedModules.has(module.id)} onChange={() => toggleModule(module.id)} />
                  </label>
                  <button className="module-layer-link" onClick={() => onNavigateModule(module.id)}>
                    <span className="module-layer-icon"><Icon size={19} /></span>
                    <span className="module-layer-copy"><em>{module.layer}</em><strong>{module.label}</strong><small>{module.description}</small></span>
                    <span className={`module-layer-status ${status.loading ? 'loading' : status.scanned ? 'scanned' : ''}`}>
                      {status.loading ? '扫描中' : status.scanned ? `${status.count} 个` : '待扫描'}
                    </span>
                    <ChevronRight size={17} />
                  </button>
                </article>
                {index < managementModules.length - 1 && <span className="module-layer-connector" aria-hidden="true" />}
              </div>
            );
          })}
        </div>
      </section>

      <div className="stat-grid">
        <StatCard label="Claude Skills" value={claudeCount} icon={BookOpen} />
        <StatCard label="Codex Skills" value={codexCount} icon={BookOpen} />
        <StatCard label="自定义目录 Skills" value={customCount} icon={Folder} />
        <StatCard label="风险项" value={riskCount} icon={ShieldCheck} tone={riskCount > 0 ? 'danger' : 'success'} />
        <StatCard label="星标收藏" value={favorites} icon={Star} tone="warning" />
        <StatCard label="启用目录" value={directories.filter((directory) => directory.enabled).length} icon={Folder} />
      </div>

      <TokenUsagePanel
        report={tokenUsage}
        loading={tokenUsageLoading}
        pricePerThousand={tokenPricePerThousand}
        onPriceChange={setTokenPricePerThousand}
        onRefresh={() => void refreshTokenUsage()}
      />

      <div className="toolbar-panel">
        <button className="button primary" onClick={onImport}>
          <Import size={16} />
          导入 Skill
        </button>
        <button className="button secondary" onClick={onSecurityScan}>
          <ShieldCheck size={16} />
          扫描全部 Skills
        </button>
        <button className="button ghost" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={16} />
          {loading ? '扫描中...' : '重新扫描'}
        </button>
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h3>最近使用</h3>
            <p>来自本地记录和管理器事件，后续可接入 Claude/Codex 调用日志。</p>
          </div>
          <Heart size={18} />
        </div>
        {recent.length === 0 ? (
          <div className="empty-inline">暂无调用记录，可以在我的 Skills 中启用调用统计。</div>
        ) : (
          <div className="recent-list">
            {recent.map((skill) => (
              <div key={skill.id} className="recent-item">
                <div>
                  <strong>{skill.name}</strong>
                  <span>{skill.localPath}</span>
                </div>
                <b>{skill.callCount} 次</b>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function TokenUsagePanel({
  report,
  loading,
  pricePerThousand,
  onPriceChange,
  onRefresh
}: {
  report: TokenUsageReport | null;
  loading: boolean;
  pricePerThousand: number;
  onPriceChange: (value: number) => void;
  onRefresh: () => void;
}) {
  const maxDailyTokens = Math.max(...(report?.days.map((day) => day.totalTokens) ?? [0]), 1);
  const estimatedCost = ((report?.totals.totalTokens ?? 0) / 1000) * pricePerThousand;
  return (
    <section className="panel token-usage-panel">
      <div className="panel-header">
        <div>
          <h3>本机 Token 消耗</h3>
          <p>数据源：ccusage 扫描本地会话；不需要开启或持续运行 ai省钱大师。</p>
        </div>
        <button className="button small secondary" disabled={loading} onClick={onRefresh}>{loading ? '读取中...' : '刷新统计'}</button>
      </div>
      {report?.error ? <div className="empty-inline">读取 ccusage 失败：{report.error}</div> : (
        <>
          <div className="token-usage-summary">
            <div><span>近 30 天 Token</span><strong>{formatTokens(report?.totals.totalTokens ?? 0)}</strong></div>
            <div><span>本机会话</span><strong>{report?.sessions.length ?? 0}</strong></div>
            <label><span>单价（每 1K Token）</span><input type="number" min="0" step="0.0001" value={pricePerThousand || ''} onChange={(event) => onPriceChange(Number(event.target.value) || 0)} placeholder="0" /></label>
            <div><span>按输入单价估算</span><strong>¥{estimatedCost.toFixed(4)}</strong></div>
          </div>
          <div className="token-usage-chart" aria-label="近 30 天 Token 消耗走势图">
            {(report?.days ?? []).map((day) => (
              <div className="token-usage-bar-wrap" key={day.date} title={`${day.date}: ${formatTokens(day.totalTokens)} tokens`}>
                <div className="token-usage-bar" style={{ height: `${Math.max(4, (day.totalTokens / maxDailyTokens) * 100)}%` }} />
                <small>{day.date.slice(5)}</small>
              </div>
            ))}
            {report?.days.length === 0 && <span className="empty-inline">ccusage 暂无本地会话数据</span>}
          </div>
          <div className="token-usage-modules">
            {(report?.modules ?? []).slice(0, 6).map((module) => <div key={module.name}><span>{module.name}</span><strong>{formatTokens(module.totalTokens)}</strong></div>)}
          </div>
        </>
      )}
    </section>
  );
}

function formatTokens(value: number) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value);
}

function readStoredSelection<T extends string>(storageKey: string, allowedValues: T[]) {
  try {
    const storedValues = JSON.parse(appStorage.getItem(storageKey) ?? 'null');
    if (!Array.isArray(storedValues)) return new Set(allowedValues);
    const allowed = new Set<string>(allowedValues);
    return new Set(storedValues.filter((value): value is T => typeof value === 'string' && allowed.has(value)));
  } catch {
    return new Set(allowedValues);
  }
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'default'
}: {
  label: string;
  value: number;
  icon: typeof BookOpen;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  return (
    <div className={`stat-card ${tone}`}>
      <Icon size={20} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
