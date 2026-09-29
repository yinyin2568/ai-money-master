import { Github, KeyRound, Plus, Save, ScanSearch, ShieldCheck, WifiOff, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { DefaultModuleCandidate, GiteeSettings, GithubStarSettings, ProductKind, SkillDirectory } from '../shared/types';
import { getErrorMessage, parseTags } from '../shared/uiUtils';
import StorageSettingsPanel from './StorageSettingsPanel';

interface SettingsPanelProps {
  directories: SkillDirectory[];
  onSaveDefaultDirectories: (directories: SkillDirectory[]) => void | Promise<void>;
  onSaveCustomDirectories: (directories: SkillDirectory[]) => void | Promise<void>;
}

export default function SettingsPanel({
  directories,
  onSaveDefaultDirectories,
  onSaveCustomDirectories
}: SettingsPanelProps) {
  const [defaultDirectories, setDefaultDirectories] = useState<SkillDirectory[]>([]);
  const [customDirectories, setCustomDirectories] = useState<SkillDirectory[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [newPath, setNewPath] = useState('');
  const [newTags, setNewTags] = useState('');
  const [status, setStatus] = useState('');
  const [offlineMode, setOfflineMode] = useState(false);
  const [githubSettings, setGithubSettings] = useState<GithubStarSettings | null>(null);
  const [githubUsername, setGithubUsername] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [giteeSettings, setGiteeSettings] = useState<GiteeSettings | null>(null);
  const [giteeUsername, setGiteeUsername] = useState('');
  const [giteeToken, setGiteeToken] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDefaultDirectories(directories.filter((directory) => directory.builtIn));
    setCustomDirectories(directories.filter((directory) => !directory.builtIn));
  }, [directories]);

  useEffect(() => {
    void loadAppSettings();
  }, []);

  async function loadAppSettings() {
    try {
      const [settings, nextGithubSettings, nextGiteeSettings] = await Promise.all([
        getApi().getAppSettings(),
        getApi().getGithubStarSettings(),
        getApi().getGiteeSettings()
      ]);
      setOfflineMode(settings.offlineMode);
      setGithubSettings(nextGithubSettings);
      setGithubUsername(nextGithubSettings.username ?? '');
      setGiteeSettings(nextGiteeSettings);
      setGiteeUsername(nextGiteeSettings.username ?? '');
    } catch (error) {
      setStatus(`读取隐私设置失败：${getErrorMessage(error)}`);
    }
  }

  async function toggleOfflineMode(nextOfflineMode: boolean) {
    setBusy(true);
    try {
      const settings = await getApi().saveAppSettings({ offlineMode: nextOfflineMode });
      setOfflineMode(settings.offlineMode);
      setStatus(settings.offlineMode ? '离线模式已开启，联网动作会被阻止' : '离线模式已关闭，可使用云端同步能力');
    } catch (error) {
      setStatus(`保存离线模式失败：${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveGithubCredentials() {
    if (!githubToken.trim()) {
      setStatus('GitHub Token 不能为空');
      return;
    }
    setBusy(true);
    try {
      const nextSettings = await getApi().saveGithubStarCredentials({
        username: githubUsername.trim() || undefined,
        token: githubToken.trim()
      });
      setGithubSettings(nextSettings);
      setGithubToken('');
      setStatus('GitHub 账号配置已保存');
    } catch (error) {
      setStatus(`保存 GitHub 配置失败：${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveGiteeCredentials() {
    if (!giteeToken.trim()) {
      setStatus('Gitee Token 不能为空');
      return;
    }
    setBusy(true);
    try {
      const nextSettings = await getApi().saveGiteeCredentials({
        username: giteeUsername.trim() || undefined,
        token: giteeToken.trim()
      });
      setGiteeSettings(nextSettings);
      setGiteeToken('');
      setStatus('Gitee 账号配置已保存');
    } catch (error) {
      setStatus(`保存 Gitee 配置失败：${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function scanDefaultPaths() {
    setBusy(true);
    try {
      const candidates = await getApi().getDefaultModuleCandidates();
      const existingCandidates = candidates.filter((candidate) => candidate.exists);
      setDefaultDirectories(existingCandidates.map(candidateToDirectory));
      setStatus(`已扫描 ${candidates.length} 个默认路径，发现 ${existingCandidates.length} 个本机已存在路径，保存后生效`);
    } catch (error) {
      setStatus(`默认路径扫描失败：${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveDefaultDirectories() {
    if (hasDuplicateDirectoryPath([...defaultDirectories, ...customDirectories])) {
      setStatus('默认路径保存失败：模块路径不能重复');
      return;
    }
    setBusy(true);
    try {
      await onSaveDefaultDirectories(defaultDirectories);
      setStatus('默认路径已保存');
    } catch (error) {
      setStatus(`默认路径保存失败：${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveCustomDirectories() {
    if (hasDuplicateDirectoryPath([...defaultDirectories, ...customDirectories])) {
      setStatus('自定义目录保存失败：模块路径不能重复');
      return;
    }
    setBusy(true);
    try {
      await onSaveCustomDirectories(customDirectories);
      setStatus('自定义目录已保存');
    } catch (error) {
      setStatus(`自定义目录保存失败：${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  function addCustomDirectory() {
    if (!newPath.trim()) return;
    if (
      hasDuplicateDirectoryPath([
        ...defaultDirectories,
        ...customDirectories,
        {
          id: `custom_preview_${Date.now()}`,
          label: newLabel.trim() || '自定义目录',
          product: 'custom',
          path: newPath.trim(),
          enabled: true,
          builtIn: false,
          tags: parseTags(newTags)
        }
      ])
    ) {
      setStatus('添加失败：模块路径不能重复');
      return;
    }
    setCustomDirectories((items) => [
      ...items,
      {
        id: `custom_${Date.now()}`,
        label: newLabel.trim() || '自定义目录',
        product: 'custom',
        path: newPath.trim(),
        enabled: true,
        builtIn: false,
        tags: parseTags(newTags)
      }
    ]);
    setNewLabel('');
    setNewPath('');
    setNewTags('');
  }

  return (
    <div className="stack">
      <StorageSettingsPanel />
      <section className="panel">
        <div className="panel-header privacy-header">
          <div>
            <h3>隐私与离线模式</h3>
            <p>开启后阻止 GitHub、Gitee、NPX、远程 Git 同步等联网动作，本地扫描、标签、记忆优化和打包继续可用。</p>
          </div>
          <label className={`privacy-toggle ${offlineMode ? 'active' : ''}`}>
            <input
              type="checkbox"
              checked={offlineMode}
              disabled={busy}
              onChange={(event) => void toggleOfflineMode(event.target.checked)}
            />
            {offlineMode ? <WifiOff size={16} /> : <ShieldCheck size={16} />}
            <span>{offlineMode ? '离线模式已开启' : '离线模式已关闭'}</span>
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h3>账号管理</h3>
            <p>统一维护 GitHub 和 Gitee 的访问令牌；令牌只保存在本机，前端不回显明文。</p>
          </div>
        </div>
        <div className="account-settings-grid">
          <div className="account-card">
            <div className="account-card-header">
              <Github size={18} />
              <strong>GitHub</strong>
              <span>{githubSettings?.tokenConfigured ? '已配置' : '未配置'}</span>
            </div>
            <label className="field">
              <span>用户名 / 邮箱</span>
              <input value={githubUsername} onChange={(event) => setGithubUsername(event.target.value)} placeholder="例如 octocat 或邮箱" />
            </label>
            <label className="field">
              <span>Personal Access Token</span>
              <input
                value={githubToken}
                onChange={(event) => setGithubToken(event.target.value)}
                placeholder={githubSettings?.tokenConfigured ? '已配置，输入新 Token 可覆盖' : '需要 Starring 相关权限'}
                type="password"
              />
            </label>
            <button className="button secondary" disabled={busy || !githubToken.trim()} onClick={() => void saveGithubCredentials()}>
              <KeyRound size={16} />
              保存 GitHub
            </button>
          </div>

          <div className="account-card">
            <div className="account-card-header">
              <Github size={18} />
              <strong>Gitee</strong>
              <span>{giteeSettings?.tokenConfigured ? '已配置' : '未配置'}</span>
            </div>
            <label className="field">
              <span>用户名 / 邮箱</span>
              <input value={giteeUsername} onChange={(event) => setGiteeUsername(event.target.value)} placeholder="可留空" />
            </label>
            <label className="field">
              <span>私人令牌</span>
              <input
                value={giteeToken}
                onChange={(event) => setGiteeToken(event.target.value)}
                placeholder={giteeSettings?.tokenConfigured ? '已配置，输入新 Token 可覆盖' : '需要收藏仓库相关权限'}
                type="password"
              />
            </label>
            <button className="button secondary" disabled={busy || !giteeToken.trim()} onClick={() => void saveGiteeCredentials()}>
              <KeyRound size={16} />
              保存 Gitee
            </button>
          </div>
        </div>
        {status && <p className="settings-status">{status}</p>}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h3>默认模块路径</h3>
            <p>扫描常见产品默认目录，也可以按本机安装习惯手动改路径。</p>
          </div>
          <div className="toolbar-actions">
            <button className="button secondary" disabled={busy} onClick={() => void scanDefaultPaths()}>
              <ScanSearch size={16} />
              扫描默认路径
            </button>
            <button className="button primary" disabled={busy} onClick={() => void saveDefaultDirectories()}>
              <Save size={16} />
              保存默认路径
            </button>
          </div>
        </div>
        <div className="directory-list">
          {defaultDirectories.length === 0 ? (
            <div className="empty-inline">暂无已启动默认模块。点击“扫描默认路径”，只会加入本机实际存在的工具目录。</div>
          ) : defaultDirectories.map((directory) => (
            <div key={directory.id} className="directory-item editable default-editable">
              <input
                value={directory.label}
                onChange={(event) =>
                  setDefaultDirectories((items) =>
                    items.map((item) => (item.id === directory.id ? { ...item, label: event.target.value } : item))
                  )
                }
              />
              <input
                value={directory.path}
                onChange={(event) =>
                  setDefaultDirectories((items) =>
                    items.map((item) => (item.id === directory.id ? { ...item, path: event.target.value } : item))
                  )
                }
              />
              <input
                value={(directory.tags ?? []).join('，')}
                onChange={(event) =>
                  setDefaultDirectories((items) =>
                    items.map((item) => (item.id === directory.id ? { ...item, tags: [event.target.value] } : item))
                  )
                }
                placeholder="模块标签，如 常用，官方"
              />
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={directory.enabled}
                  onChange={(event) =>
                    setDefaultDirectories((items) =>
                      items.map((item) => (item.id === directory.id ? { ...item, enabled: event.target.checked } : item))
                    )
                  }
                />
                启用
              </label>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h3>自定义模块路径</h3>
            <p>适合项目内 Skills 或其他产品目录，后续可扩展 Cursor、Gemini、Copilot、Trae。</p>
          </div>
          <button className="button primary" disabled={busy} onClick={() => void saveCustomDirectories()}>
            <Save size={16} />
            保存
          </button>
        </div>
        <div className="directory-list">
          {customDirectories.map((directory) => (
            <div key={directory.id} className="directory-item editable">
              <input
                value={directory.label}
                onChange={(event) =>
                  setCustomDirectories((items) =>
                    items.map((item) => (item.id === directory.id ? { ...item, label: event.target.value } : item))
                  )
                }
              />
              <input
                value={directory.path}
                onChange={(event) =>
                  setCustomDirectories((items) =>
                    items.map((item) => (item.id === directory.id ? { ...item, path: event.target.value } : item))
                  )
                }
              />
              <input
                value={(directory.tags ?? []).join('，')}
                onChange={(event) =>
                  setCustomDirectories((items) =>
                    items.map((item) => (item.id === directory.id ? { ...item, tags: [event.target.value] } : item))
                  )
                }
                placeholder="模块标签，如 团队，研发"
              />
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={directory.enabled}
                  onChange={(event) =>
                    setCustomDirectories((items) =>
                      items.map((item) => (item.id === directory.id ? { ...item, enabled: event.target.checked } : item))
                    )
                  }
                />
                启用
              </label>
              <button
                className="icon-button danger"
                onClick={() => setCustomDirectories((items) => items.filter((item) => item.id !== directory.id))}
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
        <div className="add-directory">
          <input value={newLabel} onChange={(event) => setNewLabel(event.target.value)} placeholder="目录名称，例如 项目 Skills" />
          <input value={newPath} onChange={(event) => setNewPath(event.target.value)} placeholder="例如 C:\\Projects\\demo\\.claude\\skills" />
          <input value={newTags} onChange={(event) => setNewTags(event.target.value)} placeholder="模块标签，例如 团队，常用" />
          <button className="button secondary" onClick={addCustomDirectory}>
            <Plus size={16} />
            添加
          </button>
        </div>
      </section>
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

function candidateToDirectory(candidate: DefaultModuleCandidate): SkillDirectory {
  return {
    id: candidate.productId,
    label: candidate.label,
    product: productFromCandidate(candidate.productId),
    path: candidate.path,
    enabled: candidate.exists,
    builtIn: true,
    tags: []
  };
}

function productFromCandidate(productId: string): ProductKind {
  const knownProducts: ProductKind[] = [
    'claude',
    'codex',
    'cursor',
    'gemini',
    'windsurf',
    'trae',
    'cline',
    'roo',
    'augment',
    'goose',
    'continue',
    'openclaw',
    'qwen',
    'opencode',
    'aider',
    'openhands',
    'kiro',
    'zed',
    'copilot',
    'amazonq',
    'tabnine',
    'codeium',
    'jetbrains',
    'vscode',
    'devin',
    'sourcegraph',
    'replit',
    'codewhisperer',
    'supermaven',
    'custom'
  ];
  return knownProducts.includes(productId as ProductKind) ? (productId as ProductKind) : 'custom';
}

function getApi() {
  if (!window.skillsManager) {
    throw new Error('桌面能力不可用：请在 Electron 应用中使用完整功能');
  }
  return window.skillsManager;
}
