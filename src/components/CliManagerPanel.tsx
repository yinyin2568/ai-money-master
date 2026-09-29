import { Copy, FileCog, FolderOpen, Search, SquareTerminal, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { LocalCliScanResult, LocalCliTool, LocalConfigFile } from '../shared/types';
import { getErrorMessage } from '../shared/uiUtils';

interface CliManagerPanelProps {
  scanResult: LocalCliScanResult;
  loading: boolean;
  onRescan: () => Promise<void>;
  setNotice: (message: string) => void;
}

export default function CliManagerPanel(props: CliManagerPanelProps) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'installed' | 'missing'>('all');
  const [selectedTool, setSelectedTool] = useState<LocalCliTool | null>(null);
  const [configContent, setConfigContent] = useState('');
  const [configLoading, setConfigLoading] = useState(false);

  const installedCount = props.scanResult.tools.filter((tool) => tool.installed).length;
  const visibleTools = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return props.scanResult.tools.filter((tool) => {
      if (statusFilter === 'installed' && !tool.installed) return false;
      if (statusFilter === 'missing' && tool.installed) return false;
      if (!normalizedQuery) return true;
      return `${tool.name} ${tool.command} ${tool.version ?? ''} ${tool.executablePath ?? ''}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [props.scanResult.tools, query, statusFilter]);

  async function viewConfigs(tool: LocalCliTool) {
    const files = tool.configFiles.filter((file) => file.exists);
    if (files.length === 0) return;
    setSelectedTool(tool);
    setConfigContent('');
    setConfigLoading(true);
    try {
      const sections = await Promise.all(
        files.map(async (file) => `# ${file.label}\n# ${file.path}\n\n${await getApi().readLocalConfig(file.path)}`)
      );
      setConfigContent(sections.join('\n\n========================================\n\n'));
    } catch (error) {
      setConfigContent(`配置读取失败：${getErrorMessage(error)}`);
    } finally {
      setConfigLoading(false);
    }
  }

  async function revealResource(resourcePath: string, label: string) {
    try {
      await getApi().revealLocalResource(resourcePath);
      props.setNotice(`已在资源管理器中定位：${label}`);
    } catch (error) {
      props.setNotice(`定位失败：${getErrorMessage(error)}`);
    }
  }

  async function copyConfig() {
    if (!selectedTool || !configContent) return;
    await getApi().copyText(configContent);
    props.setNotice(`已复制脱敏配置：${selectedTool.name}`);
  }

  return (
    <div className="stack local-tools-panel">
      <section className="panel">
        <div className="panel-header compact">
          <div>
            <h3>本地 CLI</h3>
            <p>{props.loading ? '正在读取命令与版本...' : `已安装 ${installedCount} / ${props.scanResult.tools.length} 个`}</p>
          </div>
          <button className="button secondary" disabled={props.loading} onClick={() => void props.onRescan()}>
            重新扫描 CLI
          </button>
        </div>
        <div className="local-tools-toolbar">
          <label className="search-box">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 CLI、版本或路径" />
          </label>
          <div className="local-tools-filters">
            <button className={statusFilter === 'all' ? 'active' : ''} onClick={() => setStatusFilter('all')}>全部</button>
            <button className={statusFilter === 'installed' ? 'active' : ''} onClick={() => setStatusFilter('installed')}>已安装 {installedCount}</button>
            <button className={statusFilter === 'missing' ? 'active' : ''} onClick={() => setStatusFilter('missing')}>未发现</button>
          </div>
        </div>

        <div className="cli-tool-grid">
          {visibleTools.map((tool) => {
            const availableConfigs = tool.configFiles.filter((file) => file.exists);
            return (
              <article className={`cli-tool-card ${tool.installed ? 'installed' : 'missing'}`} key={tool.id}>
                <div className="cli-tool-heading">
                  <span><SquareTerminal size={18} /></span>
                  <div>
                    <strong>{tool.name}</strong>
                    <code>{tool.command}</code>
                  </div>
                  <em>{tool.installed ? '已安装' : '未发现'}</em>
                </div>
                <dl className="local-tool-details">
                  <div><dt>版本</dt><dd>{tool.version ?? '—'}</dd></div>
                  <div><dt>程序路径</dt><dd title={tool.executablePath}>{tool.executablePath ?? '未在 PATH 中发现'}</dd></div>
                  <div><dt>配置文件</dt><dd>{availableConfigs.length > 0 ? availableConfigs.map((file) => file.label).join('、') : '未发现'}</dd></div>
                </dl>
                <div className="local-tool-actions">
                  <button className="button small secondary" disabled={availableConfigs.length === 0} onClick={() => void viewConfigs(tool)}>
                    <FileCog size={14} />查看配置
                  </button>
                  <button className="button small secondary" disabled={!tool.executablePath} onClick={() => tool.executablePath && void revealResource(tool.executablePath, tool.name)}>
                    <FolderOpen size={14} />打开程序位置
                  </button>
                  <button className="button small secondary" disabled={availableConfigs.length === 0} onClick={() => availableConfigs[0] && void revealResource(availableConfigs[0].path, availableConfigs[0].label)}>
                    <FolderOpen size={14} />打开配置位置
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {selectedTool && (
        <div className="dialog-backdrop" onMouseDown={() => setSelectedTool(null)}>
          <section className="module-dialog local-config-dialog" onMouseDown={(event) => event.stopPropagation()}>
            <div className="dialog-header">
              <div><h3>{selectedTool.name} 配置</h3><p>敏感字段已自动脱敏</p></div>
              <button className="icon-button" title="关闭" onClick={() => setSelectedTool(null)}><X size={18} /></button>
            </div>
            <ConfigFileLinks files={selectedTool.configFiles.filter((file) => file.exists)} onReveal={revealResource} />
            <pre className="local-config-content">{configLoading ? '加载中...' : configContent}</pre>
            <div className="dialog-actions">
              <button className="button primary" disabled={configLoading} onClick={() => void copyConfig()}><Copy size={15} />复制脱敏配置</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function ConfigFileLinks(props: { files: LocalConfigFile[]; onReveal: (path: string, label: string) => Promise<void> }) {
  return (
    <div className="config-file-links">
      {props.files.map((file) => (
        <button key={file.id} onClick={() => void props.onReveal(file.path, file.label)}>
          <FolderOpen size={13} /><span>{file.label}</span><code>{file.path}</code>
        </button>
      ))}
    </div>
  );
}

function getApi() {
  if (!window.skillsManager) throw new Error('桌面能力不可用：请在 Electron 应用中使用完整功能');
  return window.skillsManager;
}
