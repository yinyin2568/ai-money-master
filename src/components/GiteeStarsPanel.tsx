import { Copy, ExternalLink, GitBranch, RefreshCw, Search, Star, Tags, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { GiteeRepository, GiteeSettings } from '../shared/types';
import { getErrorMessage, parseTags } from '../shared/uiUtils';
import LocalGitRepositoriesPanel from './LocalGitRepositoriesPanel';

interface GiteeStarsPanelProps {
  setNotice: (message: string) => void;
}

export default function GiteeStarsPanel({ setNotice }: GiteeStarsPanelProps) {
  const [settings, setSettings] = useState<GiteeSettings | null>(null);
  const [repositories, setRepositories] = useState<GiteeRepository[]>([]);
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [updatedOnly, setUpdatedOnly] = useState(false);
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [editingRepo, setEditingRepo] = useState<GiteeRepository | null>(null);
  const [tagDraft, setTagDraft] = useState('');
  const [recommendQuery, setRecommendQuery] = useState('AI agent');
  const [recommendMinStars, setRecommendMinStars] = useState('1000');
  const [pastedRepo, setPastedRepo] = useState('');
  const [pasteBusy, setPasteBusy] = useState(false);
  const [batchPrefix, setBatchPrefix] = useState('proxy-ip/');
  const [batchTags, setBatchTags] = useState('ipdodo');
  const [batchBusy, setBatchBusy] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refresh();
  }, []);

  const allTags = useMemo(
    () => Array.from(new Set(repositories.flatMap((repo) => repo.tags))).sort((a, b) => a.localeCompare(b, 'zh-CN')),
    [repositories]
  );

  const filteredRepositories = useMemo(() => {
    return repositories.filter((repo) => {
      const text = `${repo.fullName} ${repo.description} ${repo.tags.join(' ')}`.toLowerCase();
      if (query.trim() && !text.includes(query.trim().toLowerCase())) return false;
      if (tagFilter && !repo.tags.includes(tagFilter)) return false;
      if (updatedOnly && !repo.hasUpdate) return false;
      if (favoriteOnly && !repo.favorite) return false;
      return true;
    });
  }, [favoriteOnly, query, repositories, tagFilter, updatedOnly]);

  const batchMatchCount = useMemo(() => {
    const prefix = normalizePrefix(batchPrefix);
    if (!prefix) return 0;
    return repositories.filter((repo) => repo.fullName.startsWith(prefix)).length;
  }, [batchPrefix, repositories]);

  async function refresh() {
    try {
      const api = getApi();
      const [nextSettings, nextRepositories] = await Promise.all([api.getGiteeSettings(), api.listGiteeStars()]);
      setSettings(nextSettings);
      setRepositories(nextRepositories);
    } catch (error) {
      setNotice(`Gitee 管理加载失败：${getErrorMessage(error)}`);
    }
  }

  async function syncStars() {
    setBusy(true);
    try {
      const result = await getApi().syncGiteeStars({ pages: 3, perPage: 100 });
      setNotice(result.message);
      await refresh();
    } catch (error) {
      setNotice(`同步 Gitee 失败：${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function openGiteeSearch() {
    try {
      await getApi().openExternalUrl(buildGiteeSearchUrl(recommendQuery, recommendMinStars));
      setNotice('已在浏览器打开 Gitee 搜索页，可复制仓库链接后粘贴收藏');
    } catch (error) {
      setNotice(`打开 Gitee 搜索失败：${getErrorMessage(error)}`);
    }
  }

  async function addPastedRepository() {
    const value = pastedRepo.trim();
    if (!value) {
      setNotice('请粘贴 Gitee 仓库链接或 owner/repo');
      return;
    }
    setPasteBusy(true);
    try {
      const result = await getApi().saveGiteeRepository({ fullName: value });
      setNotice(result.message);
      setPastedRepo('');
      await refresh();
    } catch (error) {
      setNotice(`粘贴收藏失败：${getErrorMessage(error)}`);
    } finally {
      setPasteBusy(false);
    }
  }

  async function toggleFavorite(repo: GiteeRepository) {
    try {
      await getApi().updateGiteeRepoMeta({
        fullName: repo.fullName,
        favorite: !repo.favorite,
        watchBranches: repo.favorite ? false : repo.watchBranches
      });
      await refresh();
    } catch (error) {
      setNotice(`更新 Gitee 重点收藏失败：${getErrorMessage(error)}`);
    }
  }

  async function toggleBranchMonitoring(repo: GiteeRepository) {
    try {
      await getApi().updateGiteeRepoMeta({
        fullName: repo.fullName,
        favorite: repo.watchBranches ? repo.favorite : true,
        watchBranches: !repo.watchBranches
      });
      setNotice(repo.watchBranches ? `已停止全分支监控：${repo.fullName}` : `已开启全分支监控：${repo.fullName}`);
      await refresh();
    } catch (error) {
      setNotice(`更新 Gitee 全分支监控失败：${getErrorMessage(error)}`);
    }
  }

  function openTagDialog(repo: GiteeRepository) {
    setEditingRepo(repo);
    setTagDraft(repo.tags.join('，'));
  }

  function closeTagDialog() {
    setEditingRepo(null);
    setTagDraft('');
  }

  async function saveRepoTags() {
    if (!editingRepo) return;
    try {
      await getApi().updateGiteeRepoMeta({ fullName: editingRepo.fullName, tags: parseTags(tagDraft) });
      setNotice(`已更新 Gitee 标签：${editingRepo.fullName}`);
      closeTagDialog();
      await refresh();
    } catch (error) {
      setNotice(`更新 Gitee 标签失败：${getErrorMessage(error)}`);
    }
  }

  async function batchTagByPrefix() {
    const tags = parseTags(batchTags);
    const prefix = batchPrefix.trim();
    if (!prefix) {
      setNotice('请填写 Gitee 仓库前缀，例如 proxy-ip/');
      return;
    }
    if (tags.length === 0) {
      setNotice('请填写要添加的标签');
      return;
    }

    setBatchBusy(true);
    try {
      const result = await getApi().tagGiteeRepositoriesByPrefix({ prefix, tags });
      setNotice(result.message);
      await refresh();
    } catch (error) {
      setNotice(`批量添加 Gitee 标签失败：${getErrorMessage(error)}`);
    } finally {
      setBatchBusy(false);
    }
  }

  return (
    <div className="stack github-stars-panel">
      <LocalGitRepositoriesPanel defaultProvider="gitee" setNotice={setNotice} />
      <section className="panel">
        <div className="panel-header">
          <div>
            <h3>Gitee 仓库管理</h3>
            <p>账号配置在“设置”中维护；这里同步收藏仓库和我的仓库，管理标签并跟踪最近更新。</p>
          </div>
          <button className="button primary" disabled={busy || !settings?.tokenConfigured} onClick={() => void syncStars()}>
            <RefreshCw size={16} />
            同步 Gitee
          </button>
        </div>

        <div className="github-star-stats">
          <div>
            <strong>{settings?.repositoryCount ?? 0}</strong>
            <span>已同步仓库</span>
          </div>
          <div>
            <strong>{settings?.tagCount ?? 0}</strong>
            <span>本地标签</span>
          </div>
          <div>
            <strong>{settings?.updatedCount ?? 0}</strong>
            <span>最近更新</span>
          </div>
          <div>
            <strong>{formatDateTime(settings?.lastSyncedAt)}</strong>
            <span>上次同步</span>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header compact">
          <div>
            <h3>批量标签</h3>
            <p>按 Gitee 仓库前缀批量添加标签，常用于同一组织或命名空间下的项目。</p>
          </div>
        </div>
        <div className="github-star-settings">
          <label className="field">
            <span>仓库前缀</span>
            <input value={batchPrefix} onChange={(event) => setBatchPrefix(event.target.value)} placeholder="例如 proxy-ip/" />
          </label>
          <label className="field">
            <span>标签</span>
            <input value={batchTags} onChange={(event) => setBatchTags(event.target.value)} placeholder="多个标签用中英文逗号分隔" />
          </label>
          <button className="button secondary" disabled={batchBusy || !batchPrefix.trim() || parseTags(batchTags).length === 0} onClick={() => void batchTagByPrefix()}>
            <Tags size={16} />
            批量添加
          </button>
        </div>
        <p className="muted-text">当前匹配 {batchMatchCount} 个仓库。</p>
      </section>

      <section className="panel">
        <div className="panel-header compact">
          <div>
            <h3>Gitee 高星推荐</h3>
            <p>直接跳转浏览器搜索 Gitee 项目，复制仓库链接后粘贴收藏到本地列表。</p>
          </div>
        </div>
        <div className="github-star-settings">
          <label className="field">
            <span>搜索关键词</span>
            <input value={recommendQuery} onChange={(event) => setRecommendQuery(event.target.value)} placeholder="例如 AI agent、低代码、数据治理" />
          </label>
          <label className="field">
            <span>最低 Star</span>
            <input value={recommendMinStars} onChange={(event) => setRecommendMinStars(event.target.value)} inputMode="numeric" />
          </label>
          <button className="button secondary" onClick={() => void openGiteeSearch()}>
            <ExternalLink size={16} />
            浏览器搜索
          </button>
        </div>
        <div className="github-star-settings gitee-paste-favorite">
          <label className="field">
            <span>粘贴收藏</span>
            <input
              value={pastedRepo}
              onChange={(event) => setPastedRepo(event.target.value)}
              placeholder="https://gitee.com/owner/repo 或 owner/repo"
            />
          </label>
          <button className="button secondary" disabled={pasteBusy || !pastedRepo.trim()} onClick={() => void addPastedRepository()}>
            <Copy size={16} />
            {pasteBusy ? '收藏中…' : '收藏到本地'}
          </button>
        </div>
        <div className="empty-inline">粘贴仓库链接即可收藏到本地，无需 Token。也可点击“浏览器搜索”查找项目。</div>
      </section>

      <section className="panel">
        <div className="panel-header compact">
          <div>
            <h3>Gitee 仓库项目</h3>
            <p>{filteredRepositories.length} / {repositories.length} 个仓库</p>
          </div>
        </div>
        <div className="filters">
          <label className="search-box">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索仓库名、描述、标签" />
          </label>
          <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
            <option value="">全部标签</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
          <button className={`button small ${updatedOnly ? 'primary' : 'secondary'}`} onClick={() => setUpdatedOnly(!updatedOnly)}>
            <RefreshCw size={14} />
            只看更新
          </button>
          <button className={`button small ${favoriteOnly ? 'primary' : 'secondary'}`} onClick={() => setFavoriteOnly(!favoriteOnly)}>
            <Star size={14} />
            重点收藏
          </button>
        </div>

        <div className="github-repo-list">
          {filteredRepositories.length === 0 ? (
            <div className="empty-inline">暂无匹配的 Gitee 仓库。可在上方粘贴链接收藏到本地，或在“设置”配置 Token 后同步 Gitee。</div>
          ) : (
            filteredRepositories.map((repo) => (
              <article className="github-repo-item" key={repo.fullName}>
                <div className="repo-main">
                  <div>
                    <strong>{repo.fullName}</strong>
                    {repo.hasUpdate && <span className="repo-update-badge">有更新</span>}
                    {repo.favorite && repo.watchBranches && <span className="repo-update-badge branch-watch">全分支监控</span>}
                  </div>
                  <p>{repo.description || '暂无描述'}</p>
                  <code title={repo.cloneUrl}>{repo.cloneUrl}</code>
                  <div className="tag-list">
                    {repo.tags.length === 0 ? <span className="muted-text">未标记</span> : repo.tags.map((tag) => <em key={tag}>{tag}</em>)}
                  </div>
                </div>
                <div className="repo-meta">
                  <span>{repo.language || '语言未知'}</span>
                  <span>Star {repo.stars}</span>
                  <span>推送 {formatDate(repo.pushedAt)}</span>
                  {repo.branchUpdateSummary && <span>分支更新 {repo.branchUpdateSummary}</span>}
                </div>
                <div className="repo-actions">
                  <button className="icon-button" title="重点收藏" onClick={() => void toggleFavorite(repo)}>
                    <Star size={16} fill={repo.favorite ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    className={`button small ${repo.watchBranches ? 'primary' : 'secondary'}`}
                    title="重点收藏仓库全分支更新监控"
                    onClick={() => void toggleBranchMonitoring(repo)}
                  >
                    <GitBranch size={14} />
                    {repo.watchBranches ? '停全分支' : '监控全分支'}
                  </button>
                  <button className="icon-button" title="编辑标签" onClick={() => openTagDialog(repo)}>
                    <Tags size={16} />
                  </button>
                  <a className="button small secondary" href={repo.htmlUrl} target="_blank" rel="noreferrer">
                    打开
                  </a>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      {editingRepo && (
        <div className="dialog-backdrop">
          <section className="module-dialog tag-dialog">
            <header className="dialog-header">
              <div>
                <h3>编辑 Gitee 标签</h3>
                <p>{editingRepo.fullName}</p>
              </div>
              <button className="icon-button" onClick={closeTagDialog}>
                <X size={18} />
              </button>
            </header>
            <label className="field">
              <span>标签</span>
              <input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} placeholder="多个标签用中英文逗号分隔" />
            </label>
            <footer className="dialog-actions">
              <button className="button ghost" onClick={closeTagDialog}>取消</button>
              <button className="button primary" onClick={() => void saveRepoTags()}>
                <Tags size={15} />
                保存标签
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}

function normalizePrefix(value: string) {
  const prefix = value.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!prefix) return '';
  if (prefix.endsWith('/')) return prefix;
  return prefix.includes('/') ? prefix : `${prefix}/`;
}

function buildGiteeSearchUrl(query: string, minStars: string) {
  const url = new URL('https://gitee.com/search');
  const normalizedQuery = query.trim() || 'AI agent';
  const stars = Number(minStars);
  url.searchParams.set('utf8', '✓');
  url.searchParams.set('type', 'repository');
  url.searchParams.set('q', Number.isFinite(stars) && stars > 0 ? `${normalizedQuery} stars:>=${stars}` : normalizedQuery);
  url.searchParams.set('sort', 'stars_count');
  return url.toString();
}

function formatDate(value?: string) {
  if (!value) return '无';
  return new Date(value).toLocaleDateString('zh-CN');
}

function formatDateTime(timestamp?: number) {
  if (!timestamp) return '未同步';
  return new Date(timestamp).toLocaleString('zh-CN');
}

function getApi() {
  if (!window.skillsManager) {
    throw new Error('桌面能力不可用：请在 Electron 应用中使用完整功能');
  }
  return window.skillsManager;
}
