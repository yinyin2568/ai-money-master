import { AlertTriangle, Copy, ShieldCheck, X } from 'lucide-react';
import { useState } from 'react';
import type { InstalledSkill, SecurityReport } from '../shared/types';
import { securityLabel } from './SkillTable';

interface SecurityPanelProps {
  skills: InstalledSkill[];
  reports: SecurityReport[];
  onScanAll: () => void | Promise<void>;
  onScanOne: (skill: InstalledSkill) => void | Promise<void>;
}

export default function SecurityPanel({ skills, reports, onScanAll, onScanOne }: SecurityPanelProps) {
  const [selectedRisk, setSelectedRisk] = useState<{ skill: InstalledSkill; report?: SecurityReport } | null>(null);
  const [copyNotice, setCopyNotice] = useState('');
  const reportMap = new Map(reports.map((report) => [report.skillId, report]));

  async function copyFilePath(filePath: string) {
    try {
      if (window.skillsManager?.copyText) {
        await window.skillsManager.copyText(filePath);
      } else {
        await navigator.clipboard.writeText(filePath);
      }
      setCopyNotice(`已复制：${filePath}`);
    } catch {
      setCopyNotice('复制失败：当前系统剪贴板不可用');
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3>安全扫描</h3>
          <p>规则扫描会检查 PowerShell 编码执行、递归删除、下载后执行和疑似密钥。</p>
        </div>
        <button className="button primary" onClick={onScanAll}>
          <ShieldCheck size={16} />
          扫描全部
        </button>
      </div>
      <div className="security-list">
        {skills.length === 0 ? (
          <div className="empty-inline">暂无 Skills。</div>
        ) : (
          skills.map((skill) => {
            const report = reportMap.get(skill.id);
            return (
              <div key={skill.id} className="security-item">
                <div>
                  <strong>{skill.name}</strong>
                  <span>{skill.localPath}</span>
                </div>
                <button
                  className={`risk-badge risk-badge-button ${report?.level ?? skill.securityLevel}`}
                  title="查看风险原因和修改建议"
                  onClick={() => setSelectedRisk({ skill, report })}
                >
                  {report ? `${securityLabel(report.level)} · ${report.score} 分` : securityLabel(skill.securityLevel)}
                </button>
                <button className="button small secondary" onClick={() => void onScanOne(skill)}>
                  扫描
                </button>
                {report && report.issues.length > 0 && (
                  <div className="issue-list">
                    <AlertTriangle size={14} />
                    {report.issues.slice(0, 3).map((issue) => (
                      <button
                        className="issue-chip"
                        key={`${issue.file}-${issue.line}-${issue.ruleId}`}
                        onClick={() => setSelectedRisk({ skill, report })}
                      >
                        {issue.ruleName}：{issue.file}:{issue.line}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      {selectedRisk && (
        <div className="dialog-backdrop">
          <section className="module-dialog risk-dialog">
            <header className="dialog-header">
              <div>
                <h3>风险判断说明</h3>
                <p>{selectedRisk.skill.name}</p>
              </div>
              <button className="icon-button" onClick={() => setSelectedRisk(null)}>
                <X size={18} />
              </button>
            </header>

            {!selectedRisk.report ? (
              <div className="empty-inline">当前 Skill 还没有扫描结果，先点击“扫描”获取风险原因和建议。</div>
            ) : selectedRisk.report.issues.length === 0 ? (
              <div className="risk-summary safe">
                <strong>{securityLabel(selectedRisk.report.level)} · {selectedRisk.report.score} 分</strong>
                <span>{selectedRisk.report.recommendations.join('；')}</span>
              </div>
            ) : (
              <>
                <div className="risk-summary">
                  <strong>{securityLabel(selectedRisk.report.level)} · {selectedRisk.report.score} 分</strong>
                  <span>命中 {selectedRisk.report.issues.length} 个风险项，点击来源文件可按行定位排查。</span>
                </div>
                {copyNotice && <div className="copy-notice">{copyNotice}</div>}
                <div className="risk-detail-list">
                  {selectedRisk.report.issues.map((issue) => (
                    <article className="risk-detail-item" key={`${issue.file}-${issue.line}-${issue.ruleId}`}>
                      <div>
                        <strong>{issue.ruleName}</strong>
                        <span className={`risk-badge ${issue.severity}`}>{securityLabel(issue.severity)}</span>
                      </div>
                      <div className="risk-file-line">
                        <code>{issue.file}:{issue.line}</code>
                        <button className="button small secondary" onClick={() => void copyFilePath(issue.file)}>
                          <Copy size={14} />
                          复制路径
                        </button>
                      </div>
                      <p><b>判断原因：</b>{issue.description}</p>
                      <pre>{issue.code}</pre>
                      <p><b>修改建议：</b>{issue.recommendation}</p>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
