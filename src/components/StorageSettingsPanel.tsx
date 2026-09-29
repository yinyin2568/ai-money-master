import { useEffect, useState } from 'react';
import { FolderOpen, HardDrive } from 'lucide-react';
import type { StorageSettings } from '../shared/types';
import { getErrorMessage } from '../shared/uiUtils';
import { cancelStorageSwitch, prepareStorageSwitch } from '../shared/appStorage';

export default function StorageSettingsPanel() {
  const [settings, setSettings] = useState<StorageSettings | null>(null);
  const [directory, setDirectory] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    void window.skillsManager?.getStorageSettings().then(setSettings).catch(error => setMessage(getErrorMessage(error)));
  }, []);

  async function choose() {
    try {
      const chosen = await window.skillsManager!.chooseStorageDirectory();
      if (chosen) setDirectory(chosen);
    } catch (error) { setMessage(getErrorMessage(error)); }
  }
  async function change(mode: 'migrate' | 'restore') {
    setBusy(true);
    setMessage(mode === 'migrate' ? '正在复制并校验数据，请勿关闭应用…' : '正在验证并恢复数据…');
    try {
      await prepareStorageSwitch();
      await window.skillsManager!.switchStorageDirectory({ directory, mode });
      window.location.reload();
    } catch (error) {
      cancelStorageSwitch();
      setMessage(getErrorMessage(error));
      setBusy(false);
    }
  }
  return <section className="panel">
    <div className="panel-header">
      <div>
        <h3><HardDrive size={18} /> 本地数据存储</h3>
        <p>收藏、标签、场景、预设及工具配置统一存放在此目录。更新或卸载程序不会删除数据，重装后可选择原目录恢复。</p>
      </div>
      <button className="button secondary" disabled={busy || !settings?.directory} onClick={() => void window.skillsManager!.openStorageDirectory().catch(error => setMessage(getErrorMessage(error)))}><FolderOpen size={16} />打开文件夹</button>
    </div>
    <p className="muted-text" style={{ overflowWrap: 'anywhere' }}>当前目录：{settings?.directory || '未能读取'}</p>
    {settings?.error && <p role="alert">{settings.error}</p>}
    <label className="field">
      <span>新目录 / 已有数据目录</span>
      <input value={directory} disabled={busy} onChange={event => setDirectory(event.target.value)} placeholder="选择独立于安装目录的文件夹，例如 D:\我的工具数据" />
    </label>
    <div className="toolbar-actions" style={{ marginTop: 12, flexWrap: 'wrap' }}>
      <button className="button secondary" disabled={busy} onClick={() => void choose()}>选择文件夹</button>
      <button className="button primary" disabled={busy || !directory.trim() || !!settings?.error} onClick={() => void change('migrate')}>迁移到此目录</button>
      <button className="button secondary" disabled={busy || !directory.trim()} onClick={() => void change('restore')}>恢复已有数据</button>
    </div>
    <p className="muted-text">迁移需要空目录，原数据会保留。恢复会切换到已有数据，不合并或覆盖。完成后自动重新加载应用。外部 Git 仓库和 AI 客户端文件仍保留在原位置。</p>
    {message && <p role="status" className="settings-status">{message}</p>}
    {busy && <div className="dialog-backdrop" role="alert" aria-live="assertive"><section className="panel"><h3>正在切换数据目录</h3><p>{message}</p></section></div>}
  </section>;
}
