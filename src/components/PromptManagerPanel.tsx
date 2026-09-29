import { CheckSquare, Copy, Eye, FileText, FolderOpen, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { LocalPrompt, LocalPromptScanOptions, LocalPromptScanResult } from '../shared/types';
import { getErrorMessage } from '../shared/uiUtils';
import { TOKEN_SAVING_GUIDE } from '../shared/tokenSavingPrompt';

import TokenSavingFeaturePanel from './TokenSavingFeaturePanel';

interface PromptManagerPanelProps {
  scanResult: LocalPromptScanResult;
  loading: boolean;
  onRescan: () => Promise<void>;
  scanOptions: LocalPromptScanOptions;
  onScanOptionsChange: (options: LocalPromptScanOptions) => Promise<void>;
  setNotice: (message: string) => void;
}

export default function PromptManagerPanel(props: PromptManagerPanelProps) {
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [selectedPrompt, setSelectedPrompt] = useState<LocalPrompt | null>(null);
  const [promptContent, setPromptContent] = useState('');
  const [contentLoading, setContentLoading] = useState(false);
  const [selectedPromptPaths, setSelectedPromptPaths] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [rtkClient, setRtkClient] = useState<'codex' | 'claude'>('codex');
  const [rtkBusy, setRtkBusy] = useState(false);
  const [guidePath, setGuidePath] = useState('');
  const [guideBusy, setGuideBusy] = useState(false);
  async function saveGuide(copyReference = false) {
    setGuideBusy(true);
    try {
      const guide = await getApi().exportTokenSavingGuide();
      setGuidePath(guide.localPath);
      if (copyReference) await getApi().copyText(guide.reference);
      props.setNotice(copyReference ? '已复制引用指令，请粘贴到所用 AI 客户端的全局提示词中；客户端需能够读取本机文件。' : `指南已保存：${guide.localPath}`);
      await props.onRescan();
    } catch (error) { props.setNotice(getErrorMessage(error)); }
    finally { setGuideBusy(false); }
  }
  const [rtkOutput, setRtkOutput] = useState('尚未检测。优化提示词和 RTK 可以独立使用，也可以组合使用。');
  async function runRtk(action: 'status' | 'install' | 'enable' | 'gain') {
    setRtkBusy(true);
    setRtkOutput(action === 'install' ? '正在通过 winget 安装，首次下载可能需要几分钟…' : '正在执行…');
    try { setRtkOutput(await getApi().executeRtk(action, rtkClient)); }
    catch (error) { setRtkOutput(getErrorMessage(error)); }
    finally { setRtkBusy(false); }
  }
  const includeSkills = props.scanOptions.includeSkills === true;

  const sourceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    props.scanResult.prompts.forEach((prompt) => counts.set(prompt.sourceId, (counts.get(prompt.sourceId) ?? 0) + 1));
    return counts;
  }, [props.scanResult.prompts]);

  const visiblePrompts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return props.scanResult.prompts.filter((prompt) => {
      if (sourceFilter !== 'all' && prompt.sourceId !== sourceFilter) return false;
      if (!normalizedQuery) return true;
      return `${prompt.name} ${prompt.description} ${prompt.relativePath} ${prompt.sourceLabel}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [props.scanResult.prompts, query, sourceFilter]);

  const existingSources = props.scanResult.sources.filter((source) => source.exists);
  const selectedVisibleCount = visiblePrompts.filter((prompt) => selectedPromptPaths.has(prompt.localPath)).length;

  function togglePrompt(promptPath: string) {
    setSelectedPromptPaths((current) => {
      const next = new Set(current);
      if (next.has(promptPath)) next.delete(promptPath);
      else next.add(promptPath);
      return next;
    });
  }

  function toggleVisiblePrompts() {
    setSelectedPromptPaths((current) => {
      const next = new Set(current);
      const shouldSelect = selectedVisibleCount !== visiblePrompts.length;
      visiblePrompts.forEach((prompt) => {
        if (shouldSelect) next.add(prompt.localPath);
        else next.delete(prompt.localPath);
      });
      return next;
    });
  }

  async function viewPrompt(prompt: LocalPrompt) {
    setSelectedPrompt(prompt);
    setPromptContent('');
    setContentLoading(true);
    try {
      setPromptContent(await getApi().readLocalPrompt(prompt.localPath));
    } catch (error) {
      setPromptContent(`读取失败：${getErrorMessage(error)}`);
    } finally {
      setContentLoading(false);
    }
  }

  async function copyPrompt(prompt: LocalPrompt) {
    try {
      const content = await getApi().readLocalPrompt(prompt.localPath);
      await getApi().copyText(content);
      props.setNotice(`已复制提示词：${prompt.name}`);
    } catch (error) {
      props.setNotice(`复制失败：${getErrorMessage(error)}`);
    }
  }

  async function revealPrompt(prompt: LocalPrompt) {
    await revealPromptPath(prompt.localPath, prompt.name);
  }

  async function revealPromptPath(promptPath: string, label: string) {
    try {
      await getApi().revealLocalPrompt(promptPath);
      props.setNotice(`已在资源管理器中打开：${label}`);
    } catch (error) {
      props.setNotice(`打开位置失败：${getErrorMessage(error)}`);
    }
  }

  return (
    <div className="stack prompt-manager">
      <section className="panel">
        <div className="panel-header compact"><div><h3>节约 Token · 两种方式</h3><p>① 优化提示词：在下方选择文件并开启所需分项。② 开启 RTK：精简命令输出。</p></div></div>
        <div className="prompt-batch-toolbar">
          <button className="button small secondary" disabled={guideBusy} onClick={() => void saveGuide()}>保存指南到本机</button>
          <button className="button small primary" disabled={guideBusy} onClick={() => void saveGuide(true)}>复制全局引用指令</button>
          {guidePath && <button className="button small secondary" onClick={() => void revealPromptPath(guidePath, 'Token 节约指南')}>打开指南位置</button>}
        </div>
        <p>安装包内置完整指南，无需下载。保存到当前用户目录后，将引用指令粘贴到全局提示词；不支持读取本地文件的客户端，可在下方分项开关中选择“完整正文”。</p>
        {guidePath && <code style={{ overflowWrap: 'anywhere' }}>{guidePath}</code>}
        <details><summary>查看完整节约 Token 指南</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{TOKEN_SAVING_GUIDE}</pre></details>
        <div className="prompt-batch-toolbar">
          <select aria-label="RTK 目标客户端" value={rtkClient} disabled={rtkBusy} onChange={(event) => setRtkClient(event.target.value as 'codex' | 'claude')}><option value="codex">Codex</option><option value="claude">Claude Code</option></select>
          <button className="button small secondary" disabled={rtkBusy} onClick={() => void runRtk('status')}>检测 RTK</button>
          <button className="button small secondary" disabled={rtkBusy} onClick={() => void runRtk('install')}>安装 RTK（需联网）</button>
          <button className="button small primary" disabled={rtkBusy} onClick={() => void runRtk('enable')}>开启 RTK</button>
          <button className="button small secondary" disabled={rtkBusy} onClick={() => void runRtk('gain')}>查看 RTK 收益</button>
          <button className="button small secondary" onClick={() => void getApi().openExternalUrl('https://github.com/rtk-ai/rtk/releases')}>官方下载</button>
        </div>
        <p>开启会调用 RTK 官方全局初始化并修改所选客户端配置，主要配置先保存快照。完成后重启该客户端。Codex 在部分 RTK 版本中依靠提示词引导主动调用；Claude 使用命令 Hook。统计为命令输出 Token 估算，不代表总费用降幅。</p>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 260, overflow: 'auto' }} role="status">{rtkOutput}</pre>
      </section>
      <section className="panel prompt-scan-summary">
        <div className="panel-header compact">
          <div>
            <h3>本地提示词</h3>
            <p>
              {props.loading
                ? '扫描中...'
                : `共 ${props.scanResult.prompts.length} 个，已发现 ${existingSources.length} 个本地目录`}
            </p>
          </div>
          <button className="button secondary" disabled={props.loading} onClick={() => void props.onRescan()}>
            重新扫描提示词
          </button>
        </div>
        <div className="prompt-scan-options">
          <label className="prompt-token-toggle">
            <input
              type="checkbox"
              checked={includeSkills}
              disabled={props.loading}
              onChange={(event) => void props.onScanOptionsChange({ includeSkills: event.target.checked })}
            />
            <FileText size={14} />扫描 Skills
          </label>
          <span>默认只扫描已选模块根目录下的全局提示词（如 test agent）；开启后才递归扫描模块内全部 Skills。</span>
        </div>
        <div className="prompt-source-paths">
          {props.scanResult.sources.map((source) => (
            <div className={source.exists ? 'available' : 'missing'} key={source.id}>
              <span>{source.label}</span>
              <code title={source.path}>{source.path}</code>
              <strong>{source.exists ? `${sourceCounts.get(source.id) ?? 0} 个` : '未发现'}</strong>
              <button className="icon-button" title={`打开 ${source.label} 目录`} disabled={!source.exists} onClick={() => void revealPromptPath(source.path, source.label)}>
                <FolderOpen size={14} />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="prompt-manager-toolbar">
          <label className="search-box">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索名称、描述或路径"
            />
          </label>
          <span>{visiblePrompts.length} / {props.scanResult.prompts.length}</span>
        </div>
        <div className="prompt-batch-toolbar">
          <button className="button small secondary" disabled={batchBusy || visiblePrompts.length === 0} onClick={toggleVisiblePrompts}>
            <CheckSquare size={14} />
            {selectedVisibleCount === visiblePrompts.length && visiblePrompts.length > 0 ? '取消选择当前结果' : '选择当前结果'}
          </button>
          <span className="prompt-batch-hint">选择要配置的全局提示词或指令文件，再操作下方开关</span>
        </div>
        <TokenSavingFeaturePanel paths={[...selectedPromptPaths].filter((item) => props.scanResult.prompts.some((prompt) => prompt.localPath === item))} revision={props.scanResult.scannedAt} busy={batchBusy} onBusy={setBatchBusy} onChanged={props.onRescan} setNotice={props.setNotice} />
        <div className="prompt-source-filters" aria-label="按提示词来源筛选">
          <button className={sourceFilter === 'all' ? 'active' : ''} onClick={() => setSourceFilter('all')}>
            全部 {props.scanResult.prompts.length}
          </button>
          {existingSources.map((source) => (
            <button
              className={sourceFilter === source.id ? 'active' : ''}
              key={source.id}
              onClick={() => setSourceFilter(source.id)}
            >
              {source.label} {sourceCounts.get(source.id) ?? 0}
            </button>
          ))}
        </div>

        {visiblePrompts.length === 0 ? (
          <div className="empty-inline">
            {props.loading ? '正在扫描本地提示词...' : '暂无匹配的提示词。可将文件放入上方任一提示词目录后重新扫描。'}
          </div>
        ) : (
          <div className="local-prompt-list">
            {visiblePrompts.map((prompt) => (
              <article className={`local-prompt-item${selectedPromptPaths.has(prompt.localPath) ? ' selected' : ''}`} key={prompt.id}>
                <label className="local-prompt-select" title="选择提示词">
                  <input type="checkbox" aria-label={`选择 ${prompt.name}`} disabled={batchBusy} checked={selectedPromptPaths.has(prompt.localPath)} onChange={() => togglePrompt(prompt.localPath)} />
                </label>
                <div className="local-prompt-icon"><FileText size={18} /></div>
                <div className="local-prompt-main">
                  <div>
                    <strong title={prompt.name}>{prompt.name}</strong>
                    <span className="prompt-source-badge">{prompt.sourceLabel}</span>
                    <span className="prompt-extension-badge">.{prompt.extension}</span>
                  </div>
                  <p title={prompt.description}>{prompt.description}</p>
                  <code title={prompt.localPath}>{prompt.relativePath}</code>
                </div>
                <div className="local-prompt-meta">
                  <span>{formatFileSize(prompt.size)}</span>
                  <span>{formatDate(prompt.lastModified)}</span>
                </div>
                <div className="local-prompt-actions">
                  <button className="button small secondary" onClick={() => void viewPrompt(prompt)}>
                    <Eye size={14} />查看
                  </button>
                  <button className="button small secondary" onClick={() => void copyPrompt(prompt)}>
                    <Copy size={14} />复制
                  </button>
                  <button className="button small secondary" onClick={() => void revealPrompt(prompt)}>
                    <FolderOpen size={14} />打开位置
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {selectedPrompt && (
        <div className="dialog-backdrop" onMouseDown={() => setSelectedPrompt(null)}>
          <section className="module-dialog prompt-viewer-dialog" onMouseDown={(event) => event.stopPropagation()}>
            <div className="dialog-header">
              <div>
                <h3>{selectedPrompt.name}</h3>
                <p>{selectedPrompt.localPath}</p>
              </div>
              <button className="icon-button" title="关闭" onClick={() => setSelectedPrompt(null)}><X size={18} /></button>
            </div>
            <pre className="prompt-file-content">{contentLoading ? '加载中...' : promptContent}</pre>
            <div className="dialog-actions">
              <button className="button secondary" onClick={() => void revealPrompt(selectedPrompt)}>
                <FolderOpen size={15} />打开位置
              </button>
              <button className="button primary" disabled={contentLoading} onClick={() => void copyPrompt(selectedPrompt)}>
                <Copy size={15} />复制全文
              </button>
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
  return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
}

function getApi() {
  if (!window.skillsManager) throw new Error('桌面能力不可用：请在 Electron 应用中使用完整功能');
  return window.skillsManager;
}
