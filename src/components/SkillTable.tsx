import {
  Archive,
  Ban,
  ChevronDown,
  CircleCheck,
  Eye,
  FolderOpen,
  Link2,
  MessageCircle,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Tags,
  Trash2,
  X,
  Zap
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { InstalledSkill, ProductKind, ShareTarget, SkillDirectory, SkillStorageKind, SyncMode } from '../shared/types';
import { parseTags } from '../shared/uiUtils';

interface SkillTableProps {
  skills: InstalledSkill[];
  directories: SkillDirectory[];
  loading: boolean;
  onView: (skill: InstalledSkill) => void | Promise<void>;
  onOpenFolder: (skill: InstalledSkill) => void | Promise<void>;
  onToggleFavorite: (skill: InstalledSkill) => void | Promise<void>;
  onSetEnabled: (skill: InstalledSkill, enabled: boolean) => void | Promise<void>;
  onEditTags: (skill: InstalledSkill, tags: string[]) => void | Promise<void>;
  onSetCallTracking: (skill: InstalledSkill, enabled: boolean) => void | Promise<void>;
  onScan: (skill: InstalledSkill) => void | Promise<void>;
  onSetOptimization: (skill: InstalledSkill, enabled: boolean) => void | Promise<void>;
  onDelete: (skill: InstalledSkill) => void | Promise<void>;
  onDeleteSelected: (skills: InstalledSkill[]) => Promise<boolean>;
  onPackageSelected: (skills: InstalledSkill[], shareTarget: ShareTarget) => Promise<boolean>;
  onSyncToDirectory: (skill: InstalledSkill, targetDirectoryId: string, mode: SyncMode) => void | Promise<void>;
}

type SortKey = 'name' | 'callCount' | 'lastCalledAt' | 'lastModified';

export default function SkillTable(props: SkillTableProps) {
  const [query, setQuery] = useState('');
  const [directoryFilter, setDirectoryFilter] = useState('all');
  const [directoryMenuOpen, setDirectoryMenuOpen] = useState(false);
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [enabledFilter, setEnabledFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [tagFilter, setTagFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(() => new Set());
  const [syncDialogSkill, setSyncDialogSkill] = useState<InstalledSkill | null>(null);
  const [syncTargetDirectoryId, setSyncTargetDirectoryId] = useState('');
  const [syncMode, setSyncMode] = useState<SyncMode>('symlink');
  const [tagDialogSkill, setTagDialogSkill] = useState<InstalledSkill | null>(null);
  const [tagDraft, setTagDraft] = useState('');
  const directoryFilterRef = useRef<HTMLDivElement>(null);

  const enabledDirectories = useMemo(
    () => props.directories.filter((directory) => directory.enabled),
    [props.directories]
  );
  const selectedDirectoryLabel =
    directoryFilter === 'all'
      ? '全部目录'
      : enabledDirectories.find((directory) => directory.id === directoryFilter)?.label ?? '全部目录';

  const allTags = useMemo(
    () => Array.from(new Set(props.skills.flatMap((skill) => [...skill.tags, ...skill.moduleTags]))).sort(),
    [props.skills]
  );

  const filteredSkills = useMemo(() => {
    return props.skills
      .filter((skill) => {
        const text = `${skill.name} ${skill.description} ${skill.localPath}`.toLowerCase();
        if (query && !text.includes(query.toLowerCase())) return false;
        if (directoryFilter !== 'all' && skill.directoryId !== directoryFilter) return false;
        if (favoriteOnly && !skill.favorite) return false;
        if (enabledFilter === 'enabled' && skill.disabled) return false;
        if (enabledFilter === 'disabled' && !skill.disabled) return false;
        if (tagFilter && !skill.tags.includes(tagFilter) && !skill.moduleTags.includes(tagFilter)) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortKey === 'name') return a.name.localeCompare(b.name, 'zh-CN');
        return (b[sortKey] ?? 0) - (a[sortKey] ?? 0);
      });
  }, [directoryFilter, enabledFilter, favoriteOnly, props.skills, query, sortKey, tagFilter]);

  const selectedSkills = useMemo(
    () => props.skills.filter((skill) => selectedSkillIds.has(skill.id)),
    [props.skills, selectedSkillIds]
  );
  const allVisibleSelected =
    filteredSkills.length > 0 && filteredSkills.every((skill) => selectedSkillIds.has(skill.id));
  const syncTargetOptions = useMemo(
    () =>
      syncDialogSkill
        ? props.directories.filter((directory) => directory.enabled && directory.id !== syncDialogSkill.directoryId)
        : [],
    [props.directories, syncDialogSkill]
  );
  const effectiveSyncTargetId = syncTargetOptions.some((directory) => directory.id === syncTargetDirectoryId)
    ? syncTargetDirectoryId
    : syncTargetOptions[0]?.id ?? '';

  useEffect(() => {
    if (directoryFilter === 'all') return;
    const directoryStillExists = props.directories.some(
      (directory) => directory.enabled && directory.id === directoryFilter
    );
    if (!directoryStillExists) setDirectoryFilter('all');
  }, [directoryFilter, props.directories]);

  useEffect(() => {
    if (!directoryMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!directoryFilterRef.current?.contains(event.target as Node)) {
        setDirectoryMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setDirectoryMenuOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [directoryMenuOpen]);

  function chooseDirectory(directoryId: string) {
    setDirectoryFilter(directoryId);
    setDirectoryMenuOpen(false);
  }

  function toggleSkillSelection(skillId: string) {
    setSelectedSkillIds((current) => {
      const next = new Set(current);
      if (next.has(skillId)) next.delete(skillId);
      else next.add(skillId);
      return next;
    });
  }

  function toggleVisibleSelection() {
    setSelectedSkillIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        filteredSkills.forEach((skill) => next.delete(skill.id));
      } else {
        filteredSkills.forEach((skill) => next.add(skill.id));
      }
      return next;
    });
  }

  async function deleteSelectedSkills() {
    const deleted = await props.onDeleteSelected(selectedSkills);
    if (!deleted) return;
    setSelectedSkillIds((current) => {
      const next = new Set(current);
      selectedSkills.forEach((skill) => next.delete(skill.id));
      return next;
    });
  }

  async function packageSelectedSkills(shareTarget: ShareTarget) {
    if (selectedSkills.length === 0) return;
    await props.onPackageSelected(selectedSkills, shareTarget);
  }

  function openTagDialog(skill: InstalledSkill) {
    setTagDialogSkill(skill);
    setTagDraft(skill.tags.join('，'));
  }

  function closeTagDialog() {
    setTagDialogSkill(null);
    setTagDraft('');
  }

  function appendTagToDraft(tag: string) {
    const nextTags = parseTags(tagDraft);
    if (!nextTags.includes(tag)) nextTags.push(tag);
    setTagDraft(nextTags.join('，'));
  }

  async function confirmTagEdit() {
    if (!tagDialogSkill) return;
    await props.onEditTags(tagDialogSkill, parseTags(tagDraft));
    closeTagDialog();
  }

  function openSyncDialog(skill: InstalledSkill) {
    const firstTarget = props.directories.find((directory) => directory.enabled && directory.id !== skill.directoryId);
    setSyncDialogSkill(skill);
    setSyncTargetDirectoryId(firstTarget?.id ?? '');
    setSyncMode('symlink');
  }

  function closeSyncDialog() {
    setSyncDialogSkill(null);
    setSyncTargetDirectoryId('');
    setSyncMode('symlink');
  }

  async function confirmSyncToDirectory() {
    if (!syncDialogSkill || !effectiveSyncTargetId) return;
    await props.onSyncToDirectory(syncDialogSkill, effectiveSyncTargetId, syncMode);
    closeSyncDialog();
  }

  return (
    <section className="panel">
      <div className="panel-header compact">
        <div>
          <h3>我的 Skills</h3>
          <p>{props.loading ? '扫描中...' : `共 ${filteredSkills.length} / ${props.skills.length} 个`}</p>
        </div>
        <div className="bulk-actions">
          <span>已选 {selectedSkills.length} 个</span>
          <button className="button small secondary" disabled={selectedSkills.length === 0} onClick={() => void packageSelectedSkills('wechat')}>
            <MessageCircle size={14} />
            微信 zip
          </button>
          <button className="button small secondary" disabled={selectedSkills.length === 0} onClick={() => void packageSelectedSkills('dingtalk')}>
            <Send size={14} />
            钉钉 zip
          </button>
          <button className="button small secondary" disabled={selectedSkills.length === 0} onClick={() => void packageSelectedSkills('file')}>
            <Archive size={14} />
            仅打包
          </button>
          <button className="button small danger" disabled={selectedSkills.length === 0} onClick={() => void deleteSelectedSkills()}>
            <Trash2 size={14} />
            批量删除
          </button>
        </div>
      </div>
      <div className="filters">
        <label className="search-box">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、描述或路径" />
        </label>
        <div className="directory-filter" ref={directoryFilterRef}>
          <button
            type="button"
            className="directory-filter-trigger"
            aria-haspopup="listbox"
            aria-expanded={directoryMenuOpen}
            onClick={() => setDirectoryMenuOpen((open) => !open)}
          >
            <span>{selectedDirectoryLabel}</span>
            <ChevronDown size={15} aria-hidden="true" />
          </button>
          {directoryMenuOpen && (
            <div className="directory-filter-menu" role="listbox" aria-label="按目录筛选">
              <button
                type="button"
                role="option"
                aria-selected={directoryFilter === 'all'}
                className={directoryFilter === 'all' ? 'selected' : ''}
                onClick={() => chooseDirectory('all')}
              >
                全部目录
              </button>
              {enabledDirectories.map((directory) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={directoryFilter === directory.id}
                  className={directoryFilter === directory.id ? 'selected' : ''}
                  key={directory.id}
                  onClick={() => chooseDirectory(directory.id)}
                >
                  {directory.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
          <option value="">全部标签</option>
          {allTags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
        <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
          <option value="name">按名称</option>
          <option value="callCount">按调用次数</option>
          <option value="lastCalledAt">按最近调用</option>
          <option value="lastModified">按更新时间</option>
        </select>
        <select value={enabledFilter} onChange={(event) => setEnabledFilter(event.target.value as 'all' | 'enabled' | 'disabled')}>
          <option value="all">全部状态</option>
          <option value="enabled">仅启用</option>
          <option value="disabled">仅停用</option>
        </select>
        <button className={`button small ${favoriteOnly ? 'primary' : 'secondary'}`} onClick={() => setFavoriteOnly(!favoriteOnly)}>
          <Star size={14} />
          星标
        </button>
      </div>

      <div className="skill-table">
        <div className="skill-row header">
          <label className="table-check" title="选择当前列表">
            <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisibleSelection} />
          </label>
          <span>名称 / 描述</span>
          <span>标签</span>
          <span>目录 / 形态</span>
          <span>调用</span>
          <span>安全</span>
          <span>操作</span>
        </div>
        {filteredSkills.length === 0 ? (
          <div className="empty-inline">暂无匹配的 Skills。可以先导入或在目录设置中添加自定义目录。</div>
        ) : (
          filteredSkills.map((skill) => (
            <div className="skill-row" key={skill.id}>
              <div className="select-favorite-cell">
                <input
                  type="checkbox"
                  aria-label={`选择 ${skill.name}`}
                  checked={selectedSkillIds.has(skill.id)}
                  onChange={() => toggleSkillSelection(skill.id)}
                />
                <button className="icon-button" title="星标" onClick={() => void props.onToggleFavorite(skill)}>
                  <Star size={16} fill={skill.favorite ? 'currentColor' : 'none'} />
                </button>
              </div>
              <div className="skill-main">
                <strong>{skill.name}</strong>
                {skill.disabled && <span className="repo-update-badge">已停用</span>}
                <p>{skill.description || '暂无描述'}</p>
                <code title={skill.localPath}>{skill.localPath}</code>
              </div>
              <div className="tag-list">
                {skill.tags.length === 0 && skill.moduleTags.length === 0 ? (
                  <span className="muted-text">未标记</span>
                ) : (
                  <>
                    {skill.tags.map((tag) => (
                      <em key={`skill-${tag}`}>{tag}</em>
                    ))}
                    {skill.moduleTags
                      .filter((tag) => !skill.tags.includes(tag))
                      .map((tag) => (
                        <em className="module-tag" key={`module-${tag}`}>
                          {tag}
                        </em>
                      ))}
                  </>
                )}
              </div>
              <div className="module-cell">
                <span className={`product-badge ${skill.product}`}>{productLabel(skill.product)}</span>
                <span className={`storage-badge ${skill.storageKind}`} title={skill.linkTarget ?? skill.localPath}>
                  {storageLabel(skill.storageKind)}
                </span>
              </div>
              <div className="usage-cell">
                <strong>{skill.callCount}</strong>
                <span>{formatDate(skill.lastCalledAt)}</span>
              </div>
              <span className={`risk-badge ${skill.securityLevel}`}>{securityLabel(skill.securityLevel)}</span>
              <div className="row-actions">
                <div className="action-icons">
                  <button
                    className="button small secondary action-button"
                    title="复用到其他模块"
                    disabled={!hasOtherEnabledModules(props.directories, skill.directoryId)}
                    onClick={() => openSyncDialog(skill)}
                  >
                    <Link2 size={14} />
                    复用
                  </button>
                  <button
                    className="button small secondary action-button"
                    title={skill.disabled ? '启用此工具中的 Skill' : '禁用此工具中的 Skill'}
                    onClick={() => void props.onSetEnabled(skill, skill.disabled)}
                  >
                    {skill.disabled ? <CircleCheck size={14} /> : <Ban size={14} />}
                    {skill.disabled ? '启用' : '停用'}
                  </button>
                  <button className="button small secondary action-button" title="查看 Skill 内容" onClick={() => void props.onView(skill)}>
                    <Eye size={14} />
                    查看
                  </button>
                  <button className="button small secondary action-button" title="在资源管理器中打开所在目录" onClick={() => void props.onOpenFolder(skill)}>
                    <FolderOpen size={14} />
                    打开位置
                  </button>
                  <button className="button small secondary action-button" title="编辑标签" onClick={() => openTagDialog(skill)}>
                    <Tags size={14} />
                    标签
                  </button>
                  <button
                    className="button small secondary action-button"
                    title={skill.callTrackingEnabled ? '停用调用统计注入并清零' : '启用调用统计注入'}
                    onClick={() => void props.onSetCallTracking(skill, !skill.callTrackingEnabled)}
                  >
                    {skill.callTrackingEnabled ? <Ban size={14} /> : <Zap size={14} />}
                    {skill.callTrackingEnabled ? '停用调用' : '启用调用'}
                  </button>
                  <button className="button small secondary action-button" title="安全扫描" onClick={() => void props.onScan(skill)}>
                    <ShieldCheck size={14} />
                    扫描
                  </button>
                  <button
                    className="button small secondary action-button"
                    title={skill.memoryOptimizationEnabled ? '停用优化记忆注入' : '启用优化记忆注入'}
                    onClick={() => void props.onSetOptimization(skill, !skill.memoryOptimizationEnabled)}
                  >
                    {skill.memoryOptimizationEnabled ? <Ban size={14} /> : <Sparkles size={14} />}
                    {skill.memoryOptimizationEnabled ? '停用优化' : '启用优化'}
                  </button>
                  <button className="button small danger action-button" title="删除 Skill" onClick={() => void props.onDelete(skill)}>
                    <Trash2 size={14} />
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {syncDialogSkill && (
        <div className="dialog-backdrop">
          <section className="module-dialog sync-dialog">
            <header className="dialog-header">
              <div>
                <h3>复制到其他模块</h3>
                <p>{syncDialogSkill.name}</p>
              </div>
              <button className="icon-button" onClick={closeSyncDialog}>
                <X size={18} />
              </button>
            </header>
            <label className="field">
              <span>目标模块</span>
              <select
                value={effectiveSyncTargetId}
                disabled={syncTargetOptions.length === 0}
                onChange={(event) => setSyncTargetDirectoryId(event.target.value)}
              >
                {syncTargetOptions.map((directory) => (
                  <option key={directory.id} value={directory.id}>
                    {directory.label} - {directory.path}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>复制方式</span>
              <select value={syncMode} onChange={(event) => setSyncMode(event.target.value as SyncMode)}>
                <option value="symlink">兼容软连接</option>
                <option value="copy">完整复制</option>
              </select>
            </label>
            <footer className="dialog-actions">
              <button className="button ghost" onClick={closeSyncDialog}>
                取消
              </button>
              <button className="button primary" disabled={!effectiveSyncTargetId} onClick={() => void confirmSyncToDirectory()}>
                <Link2 size={15} />
                确认复制
              </button>
            </footer>
          </section>
        </div>
      )}

      {tagDialogSkill && (
        <div className="dialog-backdrop">
          <section className="module-dialog tag-dialog">
            <header className="dialog-header">
              <div>
                <h3>编辑标签</h3>
                <p>{tagDialogSkill.name}</p>
              </div>
              <button className="icon-button" onClick={closeTagDialog}>
                <X size={18} />
              </button>
            </header>
            <label className="field">
              <span>Skill 标签</span>
              <input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} placeholder="多个标签用逗号分隔" />
            </label>
            {tagDialogSkill.moduleTags.length > 0 && (
              <div className="tag-suggestions">
                <span>模块标签</span>
                <div>
                  {tagDialogSkill.moduleTags.map((tag) => (
                    <button className="button small secondary" key={tag} onClick={() => appendTagToDraft(tag)}>
                      <Tags size={13} />
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <footer className="dialog-actions">
              <button className="button ghost" onClick={closeTagDialog}>
                取消
              </button>
              <button className="button primary" onClick={() => void confirmTagEdit()}>
                <Tags size={15} />
                保存标签
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}

export function productLabel(product: ProductKind) {
  const labels: Record<ProductKind, string> = {
    claude: 'Claude',
    codex: 'Codex',
    cursor: 'Cursor',
    gemini: 'Gemini',
    windsurf: 'Windsurf',
    trae: 'Trae',
    cline: 'Cline',
    roo: 'Roo',
    augment: 'Augment',
    goose: 'Goose',
    continue: 'Continue',
    openclaw: 'OpenClaw',
    qwen: 'Qwen',
    opencode: 'OpenCode',
    aider: 'Aider',
    openhands: 'OpenHands',
    kiro: 'Kiro',
    zed: 'Zed',
    copilot: 'Copilot',
    amazonq: 'Amazon Q',
    tabnine: 'Tabnine',
    codeium: 'Codeium',
    jetbrains: 'JetBrains',
    vscode: 'VS Code',
    devin: 'Devin',
    sourcegraph: 'Cody',
    replit: 'Replit',
    codewhisperer: 'CodeWhisperer',
    supermaven: 'Supermaven',
    custom: '自定义'
  };
  return labels[product] ?? '自定义';
}

export function storageLabel(storageKind: SkillStorageKind) {
  if (storageKind === 'symlink') return '兼容软连接';
  return '完整 Skill';
}

export function securityLabel(level: InstalledSkill['securityLevel']) {
  const labels = {
    unscanned: '未扫描',
    safe: '安全',
    low: '低风险',
    medium: '中风险',
    high: '高风险',
    critical: '严重'
  };
  return labels[level];
}

function formatDate(timestamp?: number) {
  if (!timestamp) return '无记录';
  return new Date(timestamp).toLocaleDateString('zh-CN');
}

function hasOtherEnabledModules(directories: SkillDirectory[], currentDirectoryId: string) {
  return directories.some((directory) => directory.enabled && directory.id !== currentDirectoryId);
}
