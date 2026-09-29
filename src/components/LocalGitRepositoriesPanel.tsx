import { FolderGit2, FolderOpen, GitBranch, RefreshCw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { LocalGitProvider, LocalGitRepository, LocalGitScanResult } from '../shared/types';
import { getErrorMessage } from '../shared/uiUtils';

interface LocalGitRepositoriesPanelProps {
  defaultProvider?: Extract<LocalGitProvider, 'github' | 'gitee'>;
  setNotice: (message: string) => void;
}

const emptyScan: LocalGitScanResult = { roots: [], repositories: [], scannedAt: 0 };

export default function LocalGitRepositoriesPanel({ defaultProvider, setNotice }: LocalGitRepositoriesPanelProps) {
  const [scanResult, setScanResult] = useState<LocalGitScanResult>(emptyScan);
  const [providerFilter, setProviderFilter] = useState<LocalGitProvider | 'all'>(defaultProvider ?? 'all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const visibleRepositories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return scanResult.repositories.filter((repository) => {
      if (providerFilter !== 'all' && repository.provider !== providerFilter) return false;
      if (!normalizedQuery) return true;
      return `${repository.name} ${repository.localPath} ${repository.currentBranch} ${repository.remoteUrl ?? ''}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [providerFilter, query, scanResult.repositories]);

  async function scan(rootPath?: string) {
    setBusy(true);
    try {
      const result = await getApi().scanLocalRepositories(rootPath);
      setScanResult(result);
      setNotice(`已扫描到 ${result.repositories.length} 个本地 Git 仓库`);
    } catch (error) {
      setNotice(`扫描本地 Git 仓库失败：${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function chooseRoot() {
    try {
      const rootPath = await getApi().chooseLocalRepositoryRoot();
      if (rootPath) await scan(rootPath);
    } catch (error) {
      setNotice(`选择仓库扫描目录失败：${getErrorMessage(error)}`);
    }
  }

  async function reveal(repository: LocalGitRepository) {
    try {
      await getApi().revealLocalRepository(repository.localPath);
      setNotice(`已在资源管理器中定位：${repository.name}`);
    } catch (error) {
      setNotice(`打开仓库失败：${getErrorMessage(error)}`);
    }
  }

  return (
    <section className="panel local-git-panel">
      <div className="panel-header">
        <div>
          <h3>本地 Git 仓库</h3>
          <p>快速发现本机代码仓库，查看当前检出分支、远端地址和最近提交。</p>
        </div>
        <div className="inline-actions">
          <button className="button secondary" disabled={busy} onClick={() => void chooseRoot()}>
            <FolderOpen size={15} />选择目录扫描
          </button>
          <button className="button primary" disabled={busy} onClick={() => void scan()}>
            <RefreshCw size={15} />{busy ? '扫描中...' : '快速扫描本地仓库'}
          </button>
        </div>
      </div>

      {scanResult.scannedAt === 0 ? (
        <div className="empty-inline">点击“快速扫描本地仓库”，默认扫描当前用户的文档和桌面；也可指定目录。</div>
      ) : (
        <>
          <div className="local-git-roots">
            <span>扫描范围</span>
            {scanResult.roots.map((root) => <code key={root}>{root}</code>)}
            <strong>{scanResult.repositories.length} 个仓库</strong>
          </div>
          <div className="local-tools-toolbar">
            <label className="search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索仓库、路径、分支或远端" /></label>
            <div className="local-tools-filters compact-filters">
              {(['all', 'github', 'gitee', 'other', 'local'] as const).map((provider) => (
                <button className={providerFilter === provider ? 'active' : ''} key={provider} onClick={() => setProviderFilter(provider)}>
                  {provider === 'all' ? '全部' : provider === 'local' ? '仅本地' : provider === 'other' ? '其他远端' : provider === 'github' ? 'GitHub' : 'Gitee'}
                </button>
              ))}
            </div>
            <span className="result-count">{visibleRepositories.length} / {scanResult.repositories.length}</span>
          </div>
          <div className="local-git-list">
            {visibleRepositories.length === 0 ? <div className="empty-inline">当前筛选条件下没有本地仓库。</div> : visibleRepositories.map((repository) => (
              <article className="local-git-item" key={repository.id}>
                <span className="local-asset-icon"><FolderGit2 size={18} /></span>
                <div className="repo-main">
                  <div><strong>{repository.name}</strong><em>{providerLabel(repository.provider)}</em></div>
                  <code title={repository.localPath}>{repository.localPath}</code>
                  <small title={repository.remoteUrl}>{repository.remoteUrl ?? '未配置 origin 远端'}</small>
                </div>
                <div className="local-git-branch">
                  <span><GitBranch size={14} />当前分支</span>
                  <strong>{repository.currentBranch}</strong>
                  <small>{repository.remoteUrl ? '已配置 origin' : '仅本地仓库'}</small>
                </div>
                <div className="local-git-commit">
                  <span>{repository.lastCommit ?? '暂无提交信息'}</span>
                  <small>{formatDate(repository.lastCommitAt)}</small>
                </div>
                <button className="button small secondary" onClick={() => void reveal(repository)}><FolderOpen size={14} />打开位置</button>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function providerLabel(provider: LocalGitProvider) {
  if (provider === 'github') return 'GitHub';
  if (provider === 'gitee') return 'Gitee';
  if (provider === 'local') return '本地仓库';
  return '其他远端';
}

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '时间未知';
}

function getApi() {
  if (!window.skillsManager) throw new Error('桌面能力不可用：请在 Electron 应用中使用完整功能');
  return window.skillsManager;
}
