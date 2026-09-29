import { Clock3, FileText, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { OperationLogEntry } from '../shared/types';

interface OperationLogsPanelProps {
  logs: OperationLogEntry[];
  loading: boolean;
}

export default function OperationLogsPanel({ logs, loading }: OperationLogsPanelProps) {
  const [keyword, setKeyword] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const actions = useMemo(() => Array.from(new Set(logs.map((log) => log.action))).sort((a, b) => a.localeCompare(b, 'zh-CN')), [logs]);
  const filteredLogs = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return logs.filter((log) => {
      const matchesAction = actionFilter === 'all' || log.action === actionFilter;
      if (!matchesAction) return false;
      if (!normalizedKeyword) return true;
      return [log.skillName, log.skillPath, log.action, log.detail, log.source]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedKeyword));
    });
  }, [actionFilter, keyword, logs]);
  const optimizeCount = logs.filter((log) => ['优化记忆', '沉淀经验'].includes(log.action)).length;

  return (
    <div className="stack">
      <div className="stat-grid log-stat-grid">
        <LogStat label="全部操作" value={logs.length} />
        <LogStat label="记忆相关" value={optimizeCount} />
        <LogStat label="今日操作" value={logs.filter((log) => isToday(log.timestamp)).length} />
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h3>系统操作日志</h3>
            <p>记录管理器内的查看、扫描、优化记忆、沉淀经验和同步等操作。</p>
          </div>
          <FileText size={19} />
        </div>

        <div className="log-filters">
          <label className="search-box">
            <Search size={16} />
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索 Skill、动作、路径或详情" />
          </label>
          <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
            <option value="all">全部动作</option>
            {actions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="empty-inline">正在加载日志...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="empty-inline">暂无匹配日志。执行“优化记忆”或“沉淀经验”后会在这里出现记录。</div>
        ) : (
          <div className="operation-log-list">
            {filteredLogs.map((log) => (
              <article className="operation-log-item" key={log.id}>
                <div className="log-time">
                  <Clock3 size={15} />
                  <span>{formatDateTime(log.timestamp)}</span>
                </div>
                <div className="log-main">
                  <div className="log-title">
                    <strong>{log.action}</strong>
                    <span>{sourceLabel(log.source)}</span>
                  </div>
                  <p>{log.skillName}</p>
                  {log.detail && <em>{log.detail}</em>}
                  {log.skillPath && <code title={log.skillPath}>{log.skillPath}</code>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function LogStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-card">
      <FileText size={20} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatDateTime(timestamp: number) {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function sourceLabel(source: OperationLogEntry['source']) {
  if (source === 'manager') return '管理器';
  if (source === 'manual') return '手动';
  if (source === 'claude') return 'Claude';
  if (source === 'codex') return 'Codex';
  return '自定义';
}

function isToday(timestamp: number) {
  const value = new Date(timestamp);
  const now = new Date();
  return value.getFullYear() === now.getFullYear() && value.getMonth() === now.getMonth() && value.getDate() === now.getDate();
}
