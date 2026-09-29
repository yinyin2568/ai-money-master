import { RefreshCw, Search, Star, Tags, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { GithubRecommendedRepository, GithubStarRepository, GithubStarSettings } from '../shared/types';
import { getErrorMessage, parseTags } from '../shared/uiUtils';
import LocalGitRepositoriesPanel from './LocalGitRepositoriesPanel';

interface GithubStarsPanelProps {
  setNotice: (message: string) => void;
}

export default function GithubStarsPanel({ setNotice }: GithubStarsPanelProps) {
  const [settings, setSettings] = useState<GithubStarSettings | null>(null);
  const [repositories, setRepositories] = useState<GithubStarRepository[]>([]);
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [updatedOnly, setUpdatedOnly] = useState(false);
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [editingRepo, setEditingRepo] = useState<GithubStarRepository | null>(null);
  const [tagDraft, setTagDraft] = useState('');
  const [recommendQuery, setRecommendQuery] = useState('ai agent mcp');
  const [recommendMinStars, setRecommendMinStars] = useState('5000');
  const [recommendations, setRecommendations] = useState<GithubRecommendedRepository[]>([]);
  const [recommendBusy, setRecommendBusy] = useState(false);
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
      const text = `${repo.fullName} ${repo.description} ${repo.topics.join(' ')} ${repo.tags.join(' ')}`.toLowerCase();
      if (query.trim() && !text.includes(query.trim().toLowerCase())) return false;
      if (tagFilter && !repo.tags.includes(tagFilter)) return false;
      if (updatedOnly && !repo.hasUpdate) return false;
      if (favoriteOnly && !repo.favorite) return false;
      return true;
    });
  }, [favoriteOnly, query, repositories, tagFilter, updatedOnly]);

  async function refresh() {
    try {
      const api = getApi();
      const [nextSettings, nextRepositories] = await Promise.all([api.getGithubStarSettings(), api.listGithubStars()]);
      setSettings(nextSettings);
      setRepositories(nextRepositories);
    } catch (error) {
      setNotice(`GitHub 管理加载失败：${getErrorMessage(error)}`);
    }
  }

  async function syncStars() {
    setBusy(true);
    try {
      const result = await getApi().syncGithubStars({ sort: 'updated', pages: 3, perPage: 100 });
      setNotice(result.message);
      await refresh();
    } catch (error) {
      setNotice(`同步 GitHub Stars 失败：${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function searchGithubRecommendations() {
    setRecommendBusy(true);
    try {
      const results = await getApi().searchGithubRepositories({
        query: recommendQuery,
        minStars: Number(recommendMinStars) || 0,
        perPage: 20
      });
      setRecommendations(results);
      setNotice(`已找到 ${results.length} 个 GitHub 高星项目`);
    } catch (error) {
      setNotice(`GitHub 高星推荐搜索失败：${getErrorMessage(error)}`);
    } finally {
      setRecommendBusy(false);
    }
  }

  async function starGithubRecommendation(repo: GithubRecommendedRepository) {
    setRecommendBusy(true);
    try {
      const result = await getApi().starGithubRepository({ fullName: repo.fullName, repository: repo });
      setNotice(result.message);
      await refresh();
    } catch (error) {
      setNotice(`GitHub 快速加星失败：${getErrorMessage(error)}`);
    } finally {
      setRecommendBusy(false);
    }
  }

  async function toggleFavorite(repo: GithubStarRepository) {
    try {
      await getApi().updateGithubStarMeta({ fullName: repo.fullName, favorite: !repo.favorite });
      await refresh();
    } catch (error) {
      setNotice(`更新收藏失败：${getErrorMessage(error)}`);
    }
  }

  function openTagDialog(repo: GithubStarRepository) {
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
      await getApi().updateGithubStarMeta({ fullName: editingRepo.fullName, tags: parseTags(tagDraft) });
      setNotice(`已更新 GitHub 标签：${editingRepo.fullName}`);
      closeTagDialog();
      await refresh();
    } catch (error) {
      setNotice(`更新 GitHub 标签失败：${getErrorMessage(error)}`);
    }
  }

  return (
    <div className="stack github-stars-panel">
      <LocalGitRepositoriesPanel defaultProvider="github" setNotice={setNotice} />
      <section className="panel">
        <div className="panel-header">
          <div>
            <h3>GitHub Star 管理</h3>
            <p>账号配置在“设置”中维护；这里同步 Star 仓库、管理标签和跟踪最近更新。</p>
          </div>
          <button className="button primary" disabled={busy || !settings?.tokenConfigured} onClick={() => void syncStars()}>
            <RefreshCw size={16} />
            同步 Stars
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
            <h3>GitHub 高星推荐</h3>
            <p>用 GitHub Search 快速发现高星项目，搜索后可一键加星并写入本地列表。</p>
          </div>
        </div>
        <div className="github-star-settings">
          <label className="field">
            <span>搜索关键词</span>
            <input value={recommendQuery} onChange={(event) => setRecommendQuery(event.target.value)} placeholder="例如 ai agent、mcp、skills" />
          </label>
          <label className="field">
            <span>最低 Star</span>
            <input value={recommendMinStars} onChange={(event) => setRecommendMinStars(event.target.value)} inputMode="numeric" />
          </label>
          <button className="button secondary" disabled={recommendBusy} onClick={() => void searchGithubRecommendations()}>
            <Search size={16} />
            搜索高星项目
          </button>
        </div>
        <div className="github-repo-list recommendation-list">
          {recommendations.length === 0 ? (
            <div className="empty-inline">输入关键词后搜索，可以一键加星并写入本地 Star 列表。</div>
          ) : (
            recommendations.map((repo) => (
              <article className="github-repo-item" key={repo.fullName}>
                <div className="repo-main">
                  <div>
                    <strong>{repo.fullName}</strong>
                  </div>
                  <p>{repo.description || '暂无描述'}</p>
                  <code title={repo.cloneUrl}>{repo.cloneUrl}</code>
                  <div className="tag-list">
                    {repo.topics.length === 0 ? <span className="muted-text">暂无 topic</span> : repo.topics.slice(0, 6).map((tag) => <em key={tag}>{tag}</em>)}
                  </div>
                </div>
                <div className="repo-meta">
                  <span>{repo.language || '语言未知'}</span>
                  <span>Star {repo.stars}</span>
                  <span>推送 {formatDate(repo.pushedAt)}</span>
                </div>
                <div className="repo-actions">
                  <button className="button small primary" disabled={recommendBusy || !settings?.tokenConfigured} onClick={() => void starGithubRecommendation(repo)}>
                    <Star size={14} />
                    加星
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

      <section className="panel">
        <div className="panel-header compact">
          <div>
            <h3>Star 项目</h3>
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
            <div className="empty-inline">暂无 Star 仓库。先到“设置”配置 Token，再点击“同步 Stars”。</div>
          ) : (
            filteredRepositories.map((repo) => (
              <article className="github-repo-item" key={repo.fullName}>
                <div className="repo-main">
                  <div>
                    <strong>{repo.fullName}</strong>
                    {repo.hasUpdate && <span className="repo-update-badge">有更新</span>}
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
                </div>
                <div className="repo-actions">
                  <button className="icon-button" title="重点收藏" onClick={() => void toggleFavorite(repo)}>
                    <Star size={16} fill={repo.favorite ? 'currentColor' : 'none'} />
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
                <h3>编辑 GitHub 标签</h3>
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
