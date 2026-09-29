import { Bot, Brain, Copy, Eye, FolderOpen, Package, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { LocalAssetKind, LocalAssetScanResult, LocalManagedAsset } from '../shared/types';
import { getErrorMessage } from '../shared/uiUtils';

interface LocalAssetManagerPanelProps {
  kind: LocalAssetKind;
  scanResult: LocalAssetScanResult;
  loading: boolean;
  onRescan: () => Promise<void>;
  setNotice: (message: string) => void;
}

const kindLabels = {
  memory: { title: '本地记忆', item: '记忆', action: '重新扫描记忆', icon: Brain },
  plugin: { title: '本地插件', item: '插件', action: '重新扫描插件', icon: Package },
  agent: { title: '本地 Agent', item: 'Agent', action: '重新扫描 Agent', icon: Bot }
} satisfies Record<LocalAssetKind, { title: string; item: string; action: string; icon: typeof Brain }>;

export default function LocalAssetManagerPanel(props: LocalAssetManagerPanelProps) {
  const labels = kindLabels[props.kind];
  const Icon = labels.icon;
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [selectedAsset, setSelectedAsset] = useState<LocalManagedAsset | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [contentLoading, setContentLoading] = useState(false);

  const existingSources = props.scanResult.sources.filter((source) => source.exists);
  const sourceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    props.scanResult.items.forEach((item) => counts.set(item.sourceId, (counts.get(item.sourceId) ?? 0) + 1));
    return counts;
  }, [props.scanResult.items]);
  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return props.scanResult.items.filter((item) => {
      if (sourceFilter !== 'all' && item.sourceId !== sourceFilter) return false;
      if (!normalizedQuery) return true;
      return `${item.name} ${item.description} ${item.sourceLabel} ${item.relativePath} ${item.version ?? ''}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [props.scanResult.items, query, sourceFilter]);

  async function viewAsset(asset: LocalManagedAsset, filePath = asset.configPath) {
    setSelectedAsset(asset);
    setSelectedFilePath(filePath);
    setFileContent('');
    setContentLoading(true);
    try {
      setFileContent(await getApi().readLocalAsset(filePath));
    } catch (error) {
      setFileContent(`读取失败：${getErrorMessage(error)}`);
    } finally {
      setContentLoading(false);
    }
  }

  async function revealAsset(assetPath: string, name: string) {
    try {
      await getApi().revealLocalAsset(assetPath);
      props.setNotice(`已在资源管理器中打开：${name}`);
    } catch (error) {
      props.setNotice(`打开位置失败：${getErrorMessage(error)}`);
    }
  }

  async function copyContent() {
    if (!selectedAsset || !fileContent) return;
    await getApi().copyText(fileContent);
    props.setNotice(`已复制${labels.item}配置：${selectedAsset.name}`);
  }

  return (
    <div className="stack local-assets-panel">
      <section className="panel">
        <div className="panel-header compact">
          <div><h3>{labels.title}</h3><p>{props.loading ? '扫描中...' : `发现 ${props.scanResult.items.length} 个${labels.item}`}</p></div>
          <button className="button secondary" disabled={props.loading} onClick={() => void props.onRescan()}>{labels.action}</button>
        </div>
        <div className="asset-source-summary">
          {props.scanResult.sources.map((source) => (
            <div className={source.exists ? 'available' : 'missing'} key={source.id}>
              <span>{source.label}</span><code title={source.path}>{source.path}</code><strong>{source.exists ? `${sourceCounts.get(source.id) ?? 0} 个` : '未发现'}</strong>
              <button className="icon-button" title={`打开 ${source.label} 目录`} disabled={!source.exists} onClick={() => void revealAsset(source.path, source.label)}><FolderOpen size={14} /></button>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="local-tools-toolbar">
          <label className="search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`搜索${labels.item}名称、描述或路径`} /></label>
          <span className="result-count">{visibleItems.length} / {props.scanResult.items.length}</span>
        </div>
        <div className="local-tools-filters">
          <button className={sourceFilter === 'all' ? 'active' : ''} onClick={() => setSourceFilter('all')}>全部</button>
          {existingSources.map((source) => (
            <button className={sourceFilter === source.id ? 'active' : ''} key={source.id} onClick={() => setSourceFilter(source.id)}>
              {source.label} {sourceCounts.get(source.id) ?? 0}
            </button>
          ))}
        </div>

        {visibleItems.length === 0 ? (
          <div className="empty-inline">{props.loading ? `正在扫描本地${labels.item}...` : `暂无匹配的${labels.item}。`}</div>
        ) : (
          <div className="local-asset-list">
            {visibleItems.map((asset) => (
              <article className="local-asset-item" key={asset.id}>
                <div className="local-asset-icon"><Icon size={18} /></div>
                <div className="local-asset-main">
                  <div><strong>{asset.name}</strong><span>{asset.sourceLabel}</span><em>{asset.resourceType}</em></div>
                  <p>{asset.description}</p>
                  <code title={asset.configPath}>{asset.relativePath}</code>
                </div>
                <dl className="local-asset-meta">
                  <div><dt>版本</dt><dd>{asset.version ?? '未声明'}</dd></div>
                  <div><dt>大小</dt><dd>{formatFileSize(asset.size)}</dd></div>
                  <div><dt>更新</dt><dd>{formatDate(asset.lastModified)}</dd></div>
                </dl>
                <div className="local-prompt-actions">
                  <button className="button small secondary" onClick={() => void viewAsset(asset)}><Eye size={14} />查看详情</button>
                  <button className="button small secondary" onClick={() => void revealAsset(asset.configPath, asset.name)}><FolderOpen size={14} />打开位置</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {selectedAsset && (
        <div className="dialog-backdrop" onMouseDown={() => setSelectedAsset(null)}>
          <section className="module-dialog local-config-dialog" onMouseDown={(event) => event.stopPropagation()}>
            <div className="dialog-header">
              <div><h3>{selectedAsset.name}</h3><p>{selectedFilePath}</p></div>
              <button className="icon-button" title="关闭" onClick={() => setSelectedAsset(null)}><X size={18} /></button>
            </div>
            {selectedAsset.localPath !== selectedAsset.configPath && (
              <div className="asset-file-tabs">
                <button className={selectedFilePath === selectedAsset.configPath ? 'active' : ''} onClick={() => void viewAsset(selectedAsset, selectedAsset.configPath)}>配置文件</button>
                <button className={selectedFilePath === selectedAsset.localPath ? 'active' : ''} onClick={() => void viewAsset(selectedAsset, selectedAsset.localPath)}>Agent 定义</button>
              </div>
            )}
            <pre className="local-config-content">{contentLoading ? '加载中...' : fileContent}</pre>
            <div className="dialog-actions">
              <button className="button secondary" onClick={() => void revealAsset(selectedFilePath, selectedAsset.name)}><FolderOpen size={15} />资源管理器定位</button>
              <button className="button primary" disabled={contentLoading} onClick={() => void copyContent()}><Copy size={15} />复制内容</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function formatDate(value: number) {
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getApi() {
  if (!window.skillsManager) throw new Error('桌面能力不可用：请在 Electron 应用中使用完整功能');
  return window.skillsManager;
}
