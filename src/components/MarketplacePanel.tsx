import { BookmarkPlus, Download, ExternalLink, Search, Share2, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { MarketplaceSkill, SkillDirectory } from '../shared/types';
import { getErrorMessage, parseTags } from '../shared/uiUtils';

interface MarketplacePanelProps {
  directories: SkillDirectory[];
  onInstalled: () => void | Promise<void>;
  setNotice: (message: string) => void;
}

export default function MarketplacePanel({ directories, onInstalled, setNotice }: MarketplacePanelProps) {
  const [items, setItems] = useState<MarketplaceSkill[]>([]);
  const [query, setQuery] = useState('');
  const [targetDirectoryId, setTargetDirectoryId] = useState('codex');
  const [busyId, setBusyId] = useState('');
  const [cloudProjectUrl, setCloudProjectUrl] = useState('');
  const [cloudProjectName, setCloudProjectName] = useState('');
  const [cloudProjectTags, setCloudProjectTags] = useState('');

  useEffect(() => {
    void loadItems();
  }, []);

  const enabledDirectories = directories.filter((directory) => directory.enabled);
  const effectiveTargetId = enabledDirectories.some((directory) => directory.id === targetDirectoryId)
    ? targetDirectoryId
    : enabledDirectories[0]?.id ?? '';
  const filteredItems = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return items.filter((item) => {
      if (!keyword) return true;
      return `${item.name} ${item.description} ${item.author} ${item.tags.join(' ')}`.toLowerCase().includes(keyword);
    });
  }, [items, query]);

  async function loadItems() {
    try {
      setItems(await getApi().listMarketplaceSkills());
    } catch (error) {
      setNotice(`加载社区市场失败：${getErrorMessage(error)}`);
    }
  }

  async function installItem(item: MarketplaceSkill) {
    if (!effectiveTargetId) {
      setNotice('请先启用至少一个目标工具模块');
      return;
    }
    setBusyId(item.id);
    try {
      const result = await getApi().installMarketplaceSkill({ id: item.id, targetDirectoryId: effectiveTargetId });
      setNotice(result.message);
      await onInstalled();
    } catch (error) {
      setNotice(`安装失败：${getErrorMessage(error)}`);
    } finally {
      setBusyId('');
    }
  }

  async function addCloudProject() {
    const repoUrl = cloudProjectUrl.trim();
    if (!repoUrl) {
      setNotice('请填写云端项目地址');
      return;
    }

    setBusyId('__cloud_project__');
    try {
      const result = await getApi().addMarketplaceSkill({
        repoUrl,
        name: cloudProjectName.trim() || undefined,
        tags: parseTags(cloudProjectTags)
      });
      setNotice(result.message);
      setCloudProjectUrl('');
      setCloudProjectName('');
      setCloudProjectTags('');
      await loadItems();
    } catch (error) {
      setNotice(`收藏云端项目失败：${getErrorMessage(error)}`);
    } finally {
      setBusyId('');
    }
  }

  async function removeCloudProject(item: MarketplaceSkill) {
    setBusyId(item.id);
    try {
      const result = await getApi().removeMarketplaceSkill(item.id);
      setNotice(result.message);
      await loadItems();
    } catch (error) {
      setNotice(`移除收藏失败：${getErrorMessage(error)}`);
    } finally {
      setBusyId('');
    }
  }

  async function shareItem(item: MarketplaceSkill) {
    setBusyId(item.id);
    try {
      const result = await getApi().shareMarketplaceSkill(item.id);
      setNotice(result.message);
    } catch (error) {
      setNotice(`分享失败：${getErrorMessage(error)}`);
    } finally {
      setBusyId('');
    }
  }

  async function openRepository(item: MarketplaceSkill) {
    try {
      await getApi().openExternalUrl(item.repoUrl);
      setNotice(`已打开仓库：${item.name}`);
    } catch (error) {
      setNotice(`打开仓库失败：${getErrorMessage(error)}`);
    }
  }

  return (
    <div className="stack marketplace-panel">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h3>社区市场</h3>
            <p>浏览、安装并分享社区贡献的 Skills。当前使用内置社区源，后续可接入你的市场网站或爬虫数据。</p>
          </div>
          <select value={effectiveTargetId} onChange={(event) => setTargetDirectoryId(event.target.value)}>
            {enabledDirectories.length === 0 ? (
              <option value="">无已启动模块</option>
            ) : enabledDirectories.map((directory) => (
              <option key={directory.id} value={directory.id}>
                {directory.label}
              </option>
            ))}
          </select>
        </div>
        <label className="search-box marketplace-search">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索社区 Skill、作者或标签" />
        </label>
      </section>

      <section className="panel">
        <div className="panel-header compact">
          <div>
            <h3>收藏云端项目</h3>
            <p>粘贴 GitHub、Gitee 等云端仓库地址，保存到本机社区市场列表，后续可打开、分享或安装。</p>
          </div>
        </div>
        <div className="marketplace-manual-import">
          <label className="field">
            <span>云端项目地址</span>
            <input
              value={cloudProjectUrl}
              onChange={(event) => setCloudProjectUrl(event.target.value)}
              placeholder="例如 https://github.com/user/repo 或 https://gitee.com/owner/repo"
            />
          </label>
          <label className="field">
            <span>名称</span>
            <input
              value={cloudProjectName}
              onChange={(event) => setCloudProjectName(event.target.value)}
              placeholder="可留空，自动取仓库名"
            />
          </label>
          <label className="field">
            <span>标签</span>
            <input
              value={cloudProjectTags}
              onChange={(event) => setCloudProjectTags(event.target.value)}
              placeholder="例如 Gitee，技能库，收藏"
            />
          </label>
          <button
            className="button primary"
            disabled={busyId === '__cloud_project__' || !cloudProjectUrl.trim()}
            onClick={() => void addCloudProject()}
          >
            <BookmarkPlus size={16} />
            收藏项目
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="marketplace-grid">
          {filteredItems.map((item) => (
            <article className="marketplace-item" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <p>{item.description}</p>
                <code title={item.repoUrl}>{item.repoUrl}</code>
              </div>
              <div className="tag-list">
                {item.tags.map((tag) => (
                  <em key={tag}>{tag}</em>
                ))}
              </div>
              <div className="repo-actions">
                <span className="muted-text">作者：{item.author}</span>
                <button className="button small secondary" disabled={busyId === item.id} onClick={() => void openRepository(item)}>
                  <ExternalLink size={14} />
                  打开
                </button>
                <button className="button small secondary" disabled={busyId === item.id} onClick={() => void shareItem(item)}>
                  <Share2 size={14} />
                  分享
                </button>
                {item.custom && (
                  <button className="button small danger" disabled={busyId === item.id} onClick={() => void removeCloudProject(item)}>
                    <Trash2 size={14} />
                    移除
                  </button>
                )}
                <button className="button small primary" disabled={busyId === item.id || !effectiveTargetId} onClick={() => void installItem(item)}>
                  <Download size={14} />
                  安装
                </button>
              </div>
            </article>
          ))}
          {filteredItems.length === 0 && <div className="empty-inline">暂无匹配的社区 Skill。</div>}
        </div>
      </section>
    </div>
  );
}

function getApi() {
  if (!window.skillsManager) {
    throw new Error('桌面能力不可用：请在 Electron 应用中使用完整功能');
  }
  return window.skillsManager;
}
