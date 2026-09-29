import { appStorage } from '../shared/appStorage';
import { useEffect, useState } from 'react';
import type { TokenUsageReport } from '../shared/types';

export default function TokenUsagePanel({ onConfigureTokenSaving }: { onConfigureTokenSaving: () => void }) {
  const [report, setReport] = useState<TokenUsageReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [usageError, setUsageError] = useState('');
  const [rtkGain, setRtkGain] = useState('正在读取 RTK 统计…');
  const [rtkLoading, setRtkLoading] = useState(false);
  async function refreshRtkGain() {
    if (!window.skillsManager) { setRtkGain('请在桌面应用中查看 RTK 统计'); return; }
    setRtkLoading(true);
    try { setRtkGain(await window.skillsManager.executeRtk('gain', 'codex')); }
    catch (error) { setRtkGain(error instanceof Error ? error.message : String(error)); }
    finally { setRtkLoading(false); }
  }
  const [prices, setPrices] = useState(() => ({
    input: readPrice('input'),
    output: readPrice('output'),
    cacheRead: readPrice('cache-read'),
    cacheWrite: readPrice('cache-write')
  }));

  useEffect(() => { void refreshTokenUsage(); }, []);
  useEffect(() => { void refreshRtkGain(); }, []);
  useEffect(() => {
    Object.entries(prices).forEach(([key, value]) => appStorage.setItem(`ai-money-master:token-price-${key}`, String(value || 0)));
  }, [prices]);

  async function refreshTokenUsage() {
    if (!window.skillsManager) return;
    setLoading(true);
    setUsageError('');
    try { setReport(await window.skillsManager.getTokenUsage(30)); }
    catch (error) { setUsageError(String(error)); }
    finally { setLoading(false); }
  }

  const maxDailyTokens = Math.max(...(report?.days.map((day) => day.totalTokens) ?? [0]), 1);
  const usage = report?.totals;
  const customEstimatedCost = (
    (usage?.inputTokens ?? 0) * prices.input
    + (usage?.outputTokens ?? 0) * prices.output
    + (usage?.cacheReadTokens ?? 0) * prices.cacheRead
    + (usage?.cacheCreationTokens ?? 0) * prices.cacheWrite
  ) / 1000;
  const hasCustomPrice = Object.values(prices).some((value) => value > 0);
  return (
    <section className="panel token-usage-panel">
      <div className="panel-header">
        <div><h3>本机 Token 消耗</h3><p>数据源：ccusage 扫描本地会话；不需要开启或持续运行 ai省钱大师。</p></div>
        <button className="button small primary" onClick={onConfigureTokenSaving}>节约 Token 配置</button>
        <button className="button small secondary" disabled={loading} onClick={() => void refreshTokenUsage()}>{loading ? '读取中...' : '刷新统计'}</button>
      </div>
      {usageError || report?.error ? <div className="empty-inline">读取 ccusage 失败：{usageError || report?.error}</div> : (
        <>
          <div className="token-usage-summary">
            <div><span>近 30 天 Token</span><strong>{formatTokens(report?.totals.totalTokens ?? 0)}</strong></div>
            <div><span>本机会话</span><strong>{report?.sessions.length ?? 0}</strong></div>
            <div><span>ccusage 费用（USD）</span><strong>${(usage?.totalCost ?? 0).toFixed(4)}</strong></div>
            <div><span>自定义费用（人民币）</span><strong>{hasCustomPrice ? `¥${customEstimatedCost.toFixed(4)}` : '未设置'}</strong></div>
          </div>
          <div className="token-price-settings">
            <div><strong>自定义分项单价（每 1K Token）</strong><span>输入、输出、缓存读取、缓存写入分别计价；留空则不参与自定义估算。</span></div>
            <div className="token-price-grid">
              <PriceInput label="输入" value={prices.input} onChange={(value) => setPrices((current) => ({ ...current, input: value }))} />
              <PriceInput label="输出" value={prices.output} onChange={(value) => setPrices((current) => ({ ...current, output: value }))} />
              <PriceInput label="缓存读取" value={prices.cacheRead} onChange={(value) => setPrices((current) => ({ ...current, cacheRead: value }))} />
              <PriceInput label="缓存写入" value={prices.cacheWrite} onChange={(value) => setPrices((current) => ({ ...current, cacheWrite: value }))} />
            </div>
          </div>
          <div className="token-usage-chart" aria-label="近 30 天 Token 消耗走势图">
            {(report?.days ?? []).map((day) => <div className="token-usage-bar-wrap" key={day.date} title={`${day.date}: ${formatTokens(day.totalTokens)} tokens`}><div className="token-usage-bar" style={{ height: `${Math.max(4, (day.totalTokens / maxDailyTokens) * 100)}%` }} /><small>{day.date.slice(5)}</small></div>)}
            {report?.days.length === 0 && <span className="empty-inline">ccusage 暂无本地会话数据</span>}
          </div>
          <div className="token-usage-modules">{(report?.modules ?? []).slice(0, 6).map((module) => <div key={module.name}><span>{module.name}</span><strong>{formatTokens(module.totalTokens)}</strong></div>)}</div>
        </>
      )}
      <div className="panel-header" style={{ marginTop: 24 }}>
        <div><h3>RTK 节约 Token（估算）</h3><p>来自本机 rtk gain 的累计命令统计，范围与上方近 30 天会话用量不同。</p></div>
        <button className="button small secondary" disabled={rtkLoading} onClick={() => void refreshRtkGain()}>{rtkLoading ? '读取中…' : '刷新 RTK 收益'}</button>
      </div>
      <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{rtkGain}</pre>
      <p>只有实际经过 RTK 的命令才会累计。尚未安装时，请前往“本地提示词”安装并开启 RTK。提示词优化没有可靠的自动节省计数；这里的估算不加入或抵扣上方模型实际用量，也不作为账单节省。</p>
    </section>
  );
}

function formatTokens(value: number) { return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value); }

function readPrice(kind: string) {
  return Number(appStorage.getItem(`ai-money-master:token-price-${kind}`) ?? '0') || 0;
}

function PriceInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label><span>{label}</span><input type="number" min="0" step="0.0001" value={value || ''} onChange={(event) => onChange(Number(event.target.value) || 0)} placeholder="0" /></label>;
}
