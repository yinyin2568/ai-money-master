import { useEffect, useMemo, useState } from 'react';
import { TOKEN_SAVING_FEATURES } from '../shared/tokenSavingFeatures';
import type { TokenSavingFeatureId, TokenSavingFileStatus, TokenSavingMode } from '../shared/tokenSavingFeatures';
import { getErrorMessage } from '../shared/uiUtils';

interface Props {
  paths: string[];
  revision: number;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onChanged: () => Promise<void>;
  setNotice: (text: string) => void;
}

export default function TokenSavingFeaturePanel(props: Props) {
  const [statuses, setStatuses] = useState<TokenSavingFileStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<TokenSavingMode>('inline');
  const [refresh, setRefresh] = useState(0);
  const key = JSON.stringify(props.paths);
  const paths = useMemo(() => JSON.parse(key) as string[], [key]);
  const [loadedKey, setLoadedKey] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const api = window.skillsManager;
    if (!api) { setLoading(false); setError('请在桌面应用中配置'); return; }
    void api.getTokenSavingFeatureStatus(paths).then((next) => {
      if (!cancelled) { setStatuses(next); setLoadedKey(key); }
    }).catch((reason) => { if (!cancelled) { setError(getErrorMessage(reason)); setStatuses([]); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [paths, key, props.revision, refresh]);

  async function toggle(id: TokenSavingFeatureId, enabled: boolean) {
    if (!window.skillsManager || !paths.length) return;
    props.onBusy(true);
    try {
      const result = await window.skillsManager.setTokenSavingFeature(paths, id, enabled, mode);
      props.setNotice(`${enabled ? '开启 / 更新' : '关闭'}完成：已修改 ${result.updated.length} 个，无需修改 ${result.skipped.length} 个，失败 ${result.failed.length} 个${result.failed.length ? '；' + result.failed.map((item) => `${item.path}：${item.error}`).join('；') : ''}`);
      await props.onChanged();
    } catch (reason) { props.setNotice(getErrorMessage(reason)); }
    finally { setRefresh((value) => value + 1); props.onBusy(false); }
  }

  const unavailable = props.busy || loading || loadedKey !== key || Boolean(error) || !paths.length;
  const valid = statuses.filter((item) => !item.error);
  return <div className="token-feature-config" id="token-saving-features">
    <div className="panel-header compact">
      <div><h3>优化提示词 · 分项开关</h3><p>先选择下方目标文件。开启即检查并新增或更新，关闭即删除该项规则，其他内容保留。</p></div>
      <button className="button small secondary" disabled={props.busy || loading || !paths.length} onClick={() => setRefresh((value) => value + 1)}>重新检测配置</button>
    </div>
    <div className="prompt-batch-toolbar">
      <label>开启 / 更新时写入方式 <select aria-label="规则写入方式" value={mode} disabled={props.busy} onChange={(event) => setMode(event.target.value as TokenSavingMode)}><option value="inline">完整正文</option><option value="document">引用分项文档</option></select></label>
      <span className="prompt-batch-hint">已选 {paths.length} 个文件{loading ? ' · 检测中…' : ''}</span>
    </div>
    <p className="token-feature-note">每项使用指南对应章节全文。引用模式会在当前用户目录保存完整分项文档；关闭只移除目标提示词中的引用，共享文档保留供其他文件使用。修改前保存备份。</p>
    <p className="token-feature-note">分项开关仅管理本工具标记的规则。若之前手动粘贴了整篇指南或整篇引用，请先移除，否则关闭某一项后其他位置的相同规则仍会生效。</p>
    {statuses.some((item) => item.legacy) && <p className="token-feature-note">检测到旧版整体规则：首次操作会拆分原有功能，再应用本次开关；其他已开启功能保留。</p>}
    {error && <p role="alert">{error}</p>}
    {statuses.filter((item) => item.error).map((item) => <p role="alert" key={item.path}>{item.path}：{item.error}</p>)}
    <div className="token-feature-grid">
      {TOKEN_SAVING_FEATURES.map((feature) => {
        const active = valid.filter((item) => item.features[feature.id].state !== 'off').length;
        const current = valid.filter((item) => item.features[feature.id].state === 'current' && item.features[feature.id].mode === mode).length;
        const allEnabled = active > 0 && active === valid.length;
        const mixed = active > 0 && !allEnabled;
        const state = !paths.length ? '未选择文件' : loading || loadedKey !== key ? '检测中' : `${active}/${valid.length} 已开启 · ${current}/${valid.length} 符合当前版本与方式`;
        return <article className="token-feature-card" key={feature.id}>
          <label className="token-feature-switch">
            <input type="checkbox" role="switch" aria-label={feature.title} aria-checked={mixed ? 'mixed' : allEnabled} checked={allEnabled} ref={(element) => { if (element) element.indeterminate = mixed; }} disabled={unavailable || !valid.length} onChange={() => void toggle(feature.id, !allEnabled)} />
            <strong>{feature.title}</strong><span>v{feature.version}</span>
          </label>
          <p>{feature.description}</p><small>{state}</small>
          <div className="token-feature-actions">
            <details><summary>查看完整内容（{feature.content.length} 字符）</summary><pre>{feature.content}</pre></details>
            <button className="button small secondary" disabled={unavailable || !valid.length || current === valid.length} onClick={() => void toggle(feature.id, true)}>补齐 / 更新</button>
            {mixed && <button className="button small secondary" disabled={unavailable} onClick={() => void toggle(feature.id, false)}>全部关闭此项</button>}
          </div>
        </article>;
      })}
    </div>
  </div>;
}
