import { Copy, Eye, FolderOpen, Network, Search, ShieldCheck, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { LocalMcpScanResult, LocalMcpServer } from '../shared/types';
import { getErrorMessage } from '../shared/uiUtils';

interface McpManagerPanelProps {
  scanResult: LocalMcpScanResult;
  loading: boolean;
  onRescan: () => Promise<void>;
  setNotice: (message: string) => void;
}

export default function McpManagerPanel(props: McpManagerPanelProps) {
  const [query, setQuery] = useState('');
  const [clientFilter, setClientFilter] = useState('all');
  const [selectedServer, setSelectedServer] = useState<LocalMcpServer | null>(null);

  const clients = useMemo(() => Array.from(new Set(props.scanResult.servers.map((server) => server.clientLabel))), [props.scanResult.servers]);
  const visibleServers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return props.scanResult.servers.filter((server) => {
      if (clientFilter !== 'all' && server.clientLabel !== clientFilter) return false;
      if (!normalizedQuery) return true;
      return `${server.name} ${server.clientLabel} ${server.command ?? ''} ${server.url ?? ''} ${server.version}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [clientFilter, props.scanResult.servers, query]);

  async function revealConfig(server: LocalMcpServer) {
    try {
      await getApi().revealLocalResource(server.configPath);
      props.setNotice(`已定位 MCP 配置：${server.name}`);
    } catch (error) {
      props.setNotice(`定位失败：${getErrorMessage(error)}`);
    }
  }

  async function copyConfig(server: LocalMcpServer) {
    await getApi().copyText(server.redactedConfig);
    props.setNotice(`已复制脱敏 MCP 配置：${server.name}`);
  }

  return (
    <div className="stack local-tools-panel">
      <section className="panel mcp-summary-panel">
        <div className="panel-header compact">
          <div>
            <h3>本地 MCP</h3>
            <p>{props.loading ? '正在扫描配置...' : `发现 ${props.scanResult.servers.length} 个 MCP Server，来自 ${clients.length} 个客户端`}</p>
          </div>
          <button className="button secondary" disabled={props.loading} onClick={() => void props.onRescan()}>
            重新扫描 MCP
          </button>
        </div>
        <div className="security-display-note"><ShieldCheck size={15} />界面中的 Token、Authorization、API Key、密码和 URL 敏感参数会自动脱敏。</div>
        <div className="mcp-config-sources">
          {props.scanResult.configFiles.filter((file) => file.exists).map((file) => (
            <button key={file.id} onClick={() => void getApi().revealLocalResource(file.path)} title={file.path}>
              <span>{file.clientLabel}</span><code>{file.label}</code><strong>{props.scanResult.servers.filter((server) => server.configPath === file.path).length} 个</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="local-tools-toolbar">
          <label className="search-box">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 MCP 名称、命令、URL 或版本" />
          </label>
          <span className="result-count">{visibleServers.length} / {props.scanResult.servers.length}</span>
        </div>
        <div className="local-tools-filters">
          <button className={clientFilter === 'all' ? 'active' : ''} onClick={() => setClientFilter('all')}>全部</button>
          {clients.map((client) => (
            <button className={clientFilter === client ? 'active' : ''} key={client} onClick={() => setClientFilter(client)}>
              {client} {props.scanResult.servers.filter((server) => server.clientLabel === client).length}
            </button>
          ))}
        </div>

        {visibleServers.length === 0 ? (
          <div className="empty-inline">{props.loading ? '正在扫描 MCP 配置...' : '暂无匹配的 MCP 配置。'}</div>
        ) : (
          <div className="mcp-server-list">
            {visibleServers.map((server) => (
              <article className="mcp-server-item" key={server.id}>
                <div className="mcp-server-icon"><Network size={18} /></div>
                <div className="mcp-server-main">
                  <div>
                    <strong>{server.name}</strong>
                    <span>{server.clientLabel}</span>
                    <em className={server.enabled ? 'enabled' : 'disabled'}>{server.enabled ? '启用' : '停用'}</em>
                  </div>
                  <p title={server.url ?? [server.command, ...server.args].filter(Boolean).join(' ')}>
                    {server.url ?? ([server.command, ...server.args].filter(Boolean).join(' ') || '未配置启动命令')}
                  </p>
                  <code title={server.configPath}>{server.configPath}</code>
                </div>
                <dl className="mcp-server-meta">
                  <div><dt>传输</dt><dd>{server.transport}</dd></div>
                  <div><dt>版本</dt><dd>{server.version}</dd></div>
                </dl>
                <div className="local-prompt-actions">
                  <button className="button small secondary" onClick={() => setSelectedServer(server)}><Eye size={14} />查看配置</button>
                  <button className="button small secondary" onClick={() => void copyConfig(server)}><Copy size={14} />复制</button>
                  <button className="button small secondary" onClick={() => void revealConfig(server)}><FolderOpen size={14} />打开位置</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {selectedServer && (
        <div className="dialog-backdrop" onMouseDown={() => setSelectedServer(null)}>
          <section className="module-dialog local-config-dialog" onMouseDown={(event) => event.stopPropagation()}>
            <div className="dialog-header">
              <div><h3>{selectedServer.name}</h3><p>{selectedServer.clientLabel} · {selectedServer.configPath}</p></div>
              <button className="icon-button" title="关闭" onClick={() => setSelectedServer(null)}><X size={18} /></button>
            </div>
            <div className="mcp-detail-badges">
              <span>传输：{selectedServer.transport}</span><span>版本：{selectedServer.version}</span><span>{selectedServer.enabled ? '已启用' : '已停用'}</span>
            </div>
            <pre className="local-config-content">{selectedServer.redactedConfig}</pre>
            <div className="dialog-actions">
              <button className="button secondary" onClick={() => void revealConfig(selectedServer)}><FolderOpen size={15} />打开位置</button>
              <button className="button primary" onClick={() => void copyConfig(selectedServer)}><Copy size={15} />复制脱敏配置</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function getApi() {
  if (!window.skillsManager) throw new Error('桌面能力不可用：请在 Electron 应用中使用完整功能');
  return window.skillsManager;
}
