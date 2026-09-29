import {
  CheckCircle2,
  Github,
  GitPullRequest,
  HardDrive,
  Package,
  Pencil,
  RefreshCw,
  Save,
  ScanSearch,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type {
  CreateModuleInput,
  DefaultModuleCandidate,
  GithubSkillUpdateResult,
  GithubSkillUpdateStatus,
  ModuleImportMode,
  SkillDirectory
} from '../shared/types';
import { getErrorMessage, parseTags } from '../shared/uiUtils';

interface ImportPanelProps {
  mode?: 'all' | 'github-to-skill' | 'repo-management';
  directories: SkillDirectory[];
  skillCount: number;
  moduleDialogOpen: boolean;
  onModuleDialogOpenChange: (open: boolean) => void;
  onImported: () => void | Promise<void>;
  onSyncRepositoryModule: (directoryId: string) => void | Promise<void>;
  setNotice: (message: string) => void;
}

export default function ImportPanel({
  mode = 'all',
  directories,
  skillCount,
  moduleDialogOpen,
  onModuleDialogOpenChange,
  onImported,
  onSyncRepositoryModule,
  setNotice
}: ImportPanelProps) {
  const [moduleName, setModuleName] = useState('');
  const [moduleTags, setModuleTags] = useState('');
  const [moduleMode, setModuleMode] = useState<ModuleImportMode>('default');
  const [moduleGithubUrl, setModuleGithubUrl] = useState('');
  const [moduleLocalPath, setModuleLocalPath] = useState('');
  const [moduleNpxPackage, setModuleNpxPackage] = useState('');
  const [moduleNpxVersion, setModuleNpxVersion] = useState('');
  const [moduleNpxRegistry, setModuleNpxRegistry] = useState('');
  const [defaultCandidates, setDefaultCandidates] = useState<DefaultModuleCandidate[]>([]);
  const [selectedDefaultPath, setSelectedDefaultPath] = useState('');
  const [githubSkillUrl, setGithubSkillUrl] = useState('');
  const [githubSkillModuleName, setGithubSkillModuleName] = useState('');
  const [githubLocalRoot, setGithubLocalRoot] = useState('');
  const [githubPreserveGitRemote, setGithubPreserveGitRemote] = useState(true);
  const [updateStatuses, setUpdateStatuses] = useState<GithubSkillUpdateStatus[]>([]);
  const [lastGithubUpdate, setLastGithubUpdate] = useState<GithubSkillUpdateResult | null>(null);
  const [editingDirectory, setEditingDirectory] = useState<SkillDirectory | null>(null);
  const [busy, setBusy] = useState(false);

  const outdatedGithubSkillCount = updateStatuses.filter((status) => status.status === 'outdated').length;

  useEffect(() => {
    if (!moduleDialogOpen) return;

    getApi()
      .getDefaultModuleCandidates()
      .then((candidates) => {
        const existingCandidates = candidates.filter((candidate) => candidate.exists);
        setDefaultCandidates(existingCandidates);
        setSelectedDefaultPath((current) =>
          current && existingCandidates.some((candidate) => candidate.path === current)
            ? current
            : existingCandidates[0]?.path || ''
        );
      })
      .catch((error) => setNotice(`默认路径扫描失败：${getErrorMessage(error)}`));
  }, [moduleDialogOpen, setNotice]);

  async function createModule() {
    const input = buildCreateModuleInput();
    if (!input) return;

    setBusy(true);
    try {
      const result = await getApi().createModule(input);
      setNotice(result.message);
      resetDialog();
      await onImported();
    } catch (error) {
      setNotice(`新增模块失败：${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function removeModule(directory: SkillDirectory) {
    const confirmed = window.confirm(
      `确认移除模块并删除该模块目录下的 Skills？\n\n模块：${directory.label}\n目录：${directory.path}`
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const result = await getApi().removeModule(directory.id);
      setNotice(result.message);
      await onImported();
    } catch (error) {
      setNotice(`移除模块失败：${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function createGithubSkill() {
    const repoUrl = githubSkillUrl.trim();
    const localRoot = githubLocalRoot.trim();
    const moduleName = githubSkillModuleName.trim();
    if (!repoUrl) {
      setNotice('GitHub 转 Skill 失败：请填写仓库地址');
      return;
    }
    if (!localRoot) {
      setNotice('GitHub 转 Skill 失败：请填写本地仓库根路径');
      return;
    }
    if (!moduleName) {
      setNotice('GitHub 转 Skill 失败：请填写模块名称');
      return;
    }

    setBusy(true);
    try {
      const result = await getApi().createGithubSkill({
        repoUrl,
        localRepositoryRoot: localRoot,
        name: moduleName,
        preserveGitRemote: githubPreserveGitRemote
      });
      setNotice(result.message);
      setGithubSkillUrl('');
      setGithubSkillModuleName('');
      setGithubLocalRoot('');
      await onImported();
    } catch (error) {
      setNotice(`GitHub 转 Skill 失败：${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveEditedModule() {
    if (!editingDirectory) return;
    const nextDirectory = {
      ...editingDirectory,
      label: editingDirectory.label.trim(),
      path: editingDirectory.path.trim(),
      tags: normalizeTags(editingDirectory.tags)
    };
    if (!nextDirectory.label) {
      setNotice('编辑模块失败：请填写模块名称');
      return;
    }
    if (!nextDirectory.path) {
      setNotice('编辑模块失败：请填写模块路径');
      return;
    }

    const nextDirectories = directories.map((directory) => (directory.id === nextDirectory.id ? nextDirectory : directory));
    if (hasDuplicateDirectoryPath(nextDirectories)) {
      setNotice('编辑模块失败：模块路径不能重复');
      return;
    }

    setBusy(true);
    try {
      if (nextDirectory.builtIn) {
        await getApi().saveDefaultDirectories(nextDirectories.filter((directory) => directory.builtIn));
      } else {
        await getApi().saveCustomDirectories(nextDirectories.filter((directory) => !directory.builtIn));
      }
      setNotice(`已保存模块：${nextDirectory.label}`);
      setEditingDirectory(null);
      await onImported();
    } catch (error) {
      setNotice(`编辑模块失败：${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function checkGithubSkillUpdates() {
    setBusy(true);
    try {
      const statuses = await getApi().checkGithubSkillUpdates();
      setUpdateStatuses(statuses);
      setLastGithubUpdate(null);
      const outdatedCount = statuses.filter((status) => status.status === 'outdated').length;
      setNotice(`仓库技能检查完成：${statuses.length} 个，${outdatedCount} 个可同步`);
    } catch (error) {
      setNotice(`仓库技能检查失败：${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function updateGithubSkill(status: GithubSkillUpdateStatus) {
    setBusy(true);
    try {
      const result = await getApi().updateGithubSkill(status.localPath, status.skillId);
      setLastGithubUpdate(result);
      setNotice(result.message);
      await onImported();
      await checkGithubSkillUpdates();
    } catch (error) {
      setNotice(`仓库技能同步失败：${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  function buildCreateModuleInput(): CreateModuleInput | undefined {
    const name = moduleName.trim();
    if (!name) {
      setNotice('新增模块失败：请填写模块名称');
      return undefined;
    }

    if (moduleMode === 'github') {
      const githubUrlValue = moduleGithubUrl.trim();
      if (!githubUrlValue) {
        setNotice('新增模块失败：请填写 GitHub 仓库地址');
        return undefined;
      }
      return { name, tags: parseTags(moduleTags), mode: 'github', githubUrl: githubUrlValue };
    }

    if (moduleMode === 'local') {
      const localPathValue = moduleLocalPath.trim();
      if (!localPathValue) {
        setNotice('新增模块失败：请填写本地目录');
        return undefined;
      }
      return { name, tags: parseTags(moduleTags), mode: 'local', localPath: localPathValue };
    }

    if (moduleMode === 'npx') {
      const packageName = moduleNpxPackage.trim();
      if (!packageName) {
        setNotice('新增模块失败：请填写 NPX 包名');
        return undefined;
      }
      return {
        name,
        tags: parseTags(moduleTags),
        mode: 'npx',
        packageName,
        versionRange: moduleNpxVersion.trim() || undefined,
        registry: moduleNpxRegistry.trim() || undefined
      };
    }

    if (!selectedDefaultPath) {
      setNotice('新增模块失败：请选择默认路径');
      return undefined;
    }
    return { name, tags: parseTags(moduleTags), mode: 'default', defaultPath: selectedDefaultPath };
  }

  function resetDialog() {
    onModuleDialogOpenChange(false);
    setModuleName('');
    setModuleTags('');
    setModuleMode('default');
    setModuleGithubUrl('');
    setModuleLocalPath('');
    setModuleNpxPackage('');
    setModuleNpxVersion('');
    setModuleNpxRegistry('');
    setSelectedDefaultPath('');
  }

  function selectDefaultCandidate(candidate: DefaultModuleCandidate) {
    setSelectedDefaultPath(candidate.path);
    if (!moduleName.trim()) setModuleName(`${candidate.label} Skills`);
  }

  return (
    <div className={`import-panel mode-${mode}`}>
      <section className="panel module-board">
        <div className="panel-header compact">
          <div>
            <h3>模块</h3>
            <p>新增模块、我的 Skills 目录筛选和复制目标都来自这里。</p>
          </div>
        </div>
        <div className="module-tile-grid">
          {directories.map((directory) => (
            <article className="module-tile" key={directory.id}>
              <div>
                <strong>{directory.label}</strong>
                <span>{directory.builtIn ? '默认模块' : '自定义模块'} · {directory.enabled ? '已启用' : '已停用'}</span>
                {(directory.tags ?? []).length > 0 && (
                  <div className="tag-list module-tags">
                    {(directory.tags ?? []).map((tag) => (
                      <em key={tag}>{tag}</em>
                    ))}
                  </div>
                )}
                <code title={directory.path}>{directory.path}</code>
              </div>
              <div className="module-tile-actions">
                <button className="button small secondary" disabled={busy} title="编辑模块" onClick={() => setEditingDirectory(directory)}>
                  <Pencil size={14} />
                  编辑
                </button>
                {!directory.builtIn && (
                  <>
                    <button
                      className="button small secondary"
                      disabled={busy || !directory.enabled}
                      title="Git 仓库一键同步"
                      onClick={() => void onSyncRepositoryModule(directory.id)}
                    >
                      <RefreshCw size={14} />
                      同步仓库
                    </button>
                    <button className="button small danger" disabled={busy} title="移除模块" onClick={() => void removeModule(directory)}>
                      <Trash2 size={14} />
                      移除
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="lifecycle-grid">
        <article className="panel github-to-skill-section">
          <div className="panel-header compact">
            <div>
              <h3>GitHub 转 Skill</h3>
              <p>拉取云端仓库到本地根路径，并自动生成一个模块。</p>
            </div>
            <Github size={20} />
          </div>
          <div className="form-grid">
            <label className="field">
              <span>仓库地址</span>
              <input
                value={githubSkillUrl}
                onChange={(event) => setGithubSkillUrl(event.target.value)}
                placeholder="https://github.com/user/repo"
              />
            </label>
            <label className="field">
              <span>本地仓库根路径</span>
              <input
                value={githubLocalRoot}
                onChange={(event) => setGithubLocalRoot(event.target.value)}
                placeholder="例如 D:\\AI\\github-skills"
              />
            </label>
            <label className="field">
              <span>模块名称</span>
              <input
                value={githubSkillModuleName}
                onChange={(event) => setGithubSkillModuleName(event.target.value)}
                placeholder="如：Khazix Skills"
              />
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={githubPreserveGitRemote}
                onChange={(event) => setGithubPreserveGitRemote(event.target.checked)}
              />
              保留云端 Git 地址，后续支持同步更新
            </label>
            <button
              className="button primary"
              disabled={busy || !githubSkillUrl.trim() || !githubLocalRoot.trim() || !githubSkillModuleName.trim()}
              onClick={() => void createGithubSkill()}
            >
              <Upload size={15} />
              生成模块
            </button>
          </div>
        </article>

        <article className="panel repo-management-section">
          <div className="panel-header compact">
            <div>
              <h3>仓库技能管理</h3>
              <p>检查 `github_url` 与 `github_hash`，可一键同步 references，并保留更新前备份。</p>
            </div>
            <button className="button small secondary" disabled={busy} onClick={() => void checkGithubSkillUpdates()}>
              <GitPullRequest size={14} />
              检查更新
            </button>
          </div>
          <div className="repo-update-summary">
            <div>
              <strong>{skillCount}</strong>
              <span>已安装技能总数</span>
            </div>
            <div>
              <strong>{updateStatuses.length}</strong>
              <span>GitHub 来源技能</span>
            </div>
            <div>
              <strong>{outdatedGithubSkillCount}</strong>
              <span>可更新</span>
            </div>
          </div>
          <div className="repo-status-list">
            {updateStatuses.length === 0 ? (
              <div className="empty-status">暂无检查结果</div>
            ) : (
              <>
                <div className="repo-status-table header">
                  <strong>技能名称</strong>
                  <strong>状态</strong>
                  <strong>本地哈希</strong>
                  <strong>远程哈希</strong>
                  <strong>消息</strong>
                  <strong>操作</strong>
                </div>
                {updateStatuses.map((status) => (
                  <div className="repo-status-table" key={status.localPath}>
                    <div>
                      <strong>{status.name}</strong>
                      <span title={status.githubUrl}>{status.githubUrl}</span>
                    </div>
                    <span className={`repo-status-badge ${status.status}`}>{statusLabel(status.status)}</span>
                    <code>{formatShortHash(status.currentHash)}</code>
                    <code>{formatShortHash(status.latestHash)}</code>
                    <span>{status.message ?? '-'}</span>
                    {status.status === 'outdated' ? (
                      <button className="button small primary" disabled={busy} onClick={() => void updateGithubSkill(status)}>
                        <RefreshCw size={14} />
                        更新
                      </button>
                    ) : (
                      <span className={`repo-status-badge ${status.status}`}>
                        <CheckCircle2 size={13} />
                        {status.status === 'current' ? '无需更新' : '查看消息'}
                      </span>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
          {lastGithubUpdate && (
            <div className="github-update-result">
              <div className="panel-header compact">
                <div>
                  <h3>更新完成</h3>
                  <p>{lastGithubUpdate.skillName} 更新成功</p>
                </div>
                <CheckCircle2 size={18} />
              </div>
              <div className="github-update-compare">
                <strong>项目</strong>
                <strong>更新前</strong>
                <strong>更新后</strong>
                <span>GitHub 哈希</span>
                <code>{formatShortHash(lastGithubUpdate.before.currentHash)}</code>
                <code>{formatShortHash(lastGithubUpdate.after.currentHash)}</code>
                <span>状态</span>
                <span className={`repo-status-badge ${lastGithubUpdate.before.status}`}>{statusLabel(lastGithubUpdate.before.status)}</span>
                <span className={`repo-status-badge ${lastGithubUpdate.after.status}`}>{statusLabel(lastGithubUpdate.after.status)}</span>
                <span>版本</span>
                <span>{lastGithubUpdate.before.version ?? '-'}</span>
                <span>{lastGithubUpdate.after.version ?? '-'}</span>
              </div>
              <div className="github-update-detail">
                {lastGithubUpdate.backupPath && <p>备份文件：<code>{lastGithubUpdate.backupPath}</code></p>}
                <p>更新时间：{formatDateTime(lastGithubUpdate.updatedAt)}</p>
                <p>更新内容：{lastGithubUpdate.updateContent}</p>
              </div>
            </div>
          )}
        </article>
      </section>

      {moduleDialogOpen && (
        <div className="dialog-backdrop">
          <section className="module-dialog">
            <header className="dialog-header">
              <div>
                <h3>新增模块</h3>
                <p>模块会出现在我的 Skills 目录筛选和复制目标中。</p>
              </div>
              <button className="icon-button" onClick={resetDialog}>
                <X size={18} />
              </button>
            </header>

            <label className="field">
              <span>模块名称</span>
              <input value={moduleName} onChange={(event) => setModuleName(event.target.value)} placeholder="如：阿里云 Skills 源" />
            </label>
            <label className="field">
              <span>模块标签</span>
              <input value={moduleTags} onChange={(event) => setModuleTags(event.target.value)} placeholder="如：团队，常用，查询" />
            </label>

            <div className="segmented-control">
              <button className={moduleMode === 'default' ? 'active' : ''} onClick={() => setModuleMode('default')}>
                <ScanSearch size={14} />
                默认路径扫描
              </button>
              <button className={moduleMode === 'local' ? 'active' : ''} onClick={() => setModuleMode('local')}>
                <HardDrive size={14} />
                本地导入
              </button>
              <button className={moduleMode === 'github' ? 'active' : ''} onClick={() => setModuleMode('github')}>
                <Github size={14} />
                GitHub 导入
              </button>
              <button className={moduleMode === 'npx' ? 'active' : ''} onClick={() => setModuleMode('npx')}>
                <Package size={14} />
                NPX 导入
              </button>
            </div>

            {moduleMode === 'default' && (
              <div className="default-path-list">
                {defaultCandidates.length === 0 ? (
                  <div className="empty-inline">未扫描到本机已存在的默认工具目录。可以先安装/创建对应目录，或改用“本地导入”。</div>
                ) : defaultCandidates.map((candidate) => (
                  <button
                    key={candidate.productId}
                    className={selectedDefaultPath === candidate.path ? 'selected' : ''}
                    onClick={() => selectDefaultCandidate(candidate)}
                  >
                    <strong>{candidate.label}</strong>
                    <span>已检测到目录</span>
                    <code>{candidate.path}</code>
                  </button>
                ))}
              </div>
            )}

            {moduleMode === 'local' && (
              <label className="field">
                <span>本地目录</span>
                <input value={moduleLocalPath} onChange={(event) => setModuleLocalPath(event.target.value)} placeholder="例如 D:\\AI\\skills" />
              </label>
            )}

            {moduleMode === 'github' && (
              <label className="field">
                <span>GitHub 仓库</span>
                <input value={moduleGithubUrl} onChange={(event) => setModuleGithubUrl(event.target.value)} placeholder="https://github.com/user/skills-repo" />
              </label>
            )}

            {moduleMode === 'npx' && (
              <div className="form-grid">
                <label className="field">
                  <span>包名或本地包路径</span>
                  <input
                    value={moduleNpxPackage}
                    onChange={(event) => setModuleNpxPackage(event.target.value)}
                    placeholder="@scope/skills-package 或 D:\\packages\\skills"
                  />
                </label>
                <label className="field">
                  <span>版本范围</span>
                  <input value={moduleNpxVersion} onChange={(event) => setModuleNpxVersion(event.target.value)} placeholder="latest / ^1.0.0，可留空" />
                </label>
                <label className="field">
                  <span>Registry</span>
                  <input
                    value={moduleNpxRegistry}
                    onChange={(event) => setModuleNpxRegistry(event.target.value)}
                    placeholder="https://registry.npmmirror.com，可留空"
                  />
                </label>
              </div>
            )}

            <footer className="dialog-actions">
              <button className="button ghost" onClick={resetDialog}>
                取消
              </button>
              <button className="button primary" disabled={busy || !moduleName.trim()} onClick={() => void createModule()}>
                <Upload size={15} />
                创建模块
              </button>
            </footer>
          </section>
        </div>
      )}

      {editingDirectory && (
        <div className="dialog-backdrop">
          <section className="module-dialog">
            <header className="dialog-header">
              <div>
                <h3>编辑模块</h3>
                <p>模块路径不能与其他模块重复，保存后会重新扫描。</p>
              </div>
              <button className="icon-button" onClick={() => setEditingDirectory(null)}>
                <X size={18} />
              </button>
            </header>

            <label className="field">
              <span>模块名称</span>
              <input
                value={editingDirectory.label}
                onChange={(event) => setEditingDirectory((current) => (current ? { ...current, label: event.target.value } : current))}
              />
            </label>
            <label className="field">
              <span>模块路径</span>
              <input
                value={editingDirectory.path}
                onChange={(event) => setEditingDirectory((current) => (current ? { ...current, path: event.target.value } : current))}
              />
            </label>
            <label className="field">
              <span>模块标签</span>
              <input
                value={(editingDirectory.tags ?? []).join('，')}
                onChange={(event) =>
                  setEditingDirectory((current) => (current ? { ...current, tags: [event.target.value] } : current))
                }
                placeholder="如：团队，常用，查询"
              />
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={editingDirectory.enabled}
                onChange={(event) => setEditingDirectory((current) => (current ? { ...current, enabled: event.target.checked } : current))}
              />
              启用模块
            </label>

            <footer className="dialog-actions">
              <button className="button ghost" onClick={() => setEditingDirectory(null)}>
                取消
              </button>
              <button className="button primary" disabled={busy} onClick={() => void saveEditedModule()}>
                <Save size={15} />
                保存模块
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}

function hasDuplicateDirectoryPath(directories: SkillDirectory[]) {
  const seen = new Set<string>();
  for (const directory of directories) {
    const normalizedPath = directory.path.trim().replace(/\\/g, '/').replace(/\/+$/g, '').toLowerCase();
    if (!normalizedPath) continue;
    if (seen.has(normalizedPath)) return true;
    seen.add(normalizedPath);
  }
  return false;
}

function statusLabel(status: GithubSkillUpdateStatus['status']) {
  if (status === 'current') return '最新';
  if (status === 'outdated') return '过期';
  return '异常';
}

function formatShortHash(value?: string) {
  return value ? value.slice(0, 8) : '-';
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('zh-CN');
}

function normalizeTags(tags?: string[]) {
  return Array.from(
    new Set(
      (tags ?? [])
        .flatMap((tag) => tag.split(/[，,、;\r\n]+/))
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  );
}

function getApi() {
  if (!window.skillsManager) {
    throw new Error('桌面能力不可用：请在 Electron 应用中导入 Skill');
  }
  return window.skillsManager;
}
