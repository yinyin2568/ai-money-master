import { Ban, X, ShieldCheck, Sparkles, Star, Tags, Zap } from 'lucide-react';
import type { InstalledSkill, SecurityReport } from '../shared/types';
import { parseTags } from '../shared/uiUtils';
import { productLabel, securityLabel, storageLabel } from './SkillTable';

interface SkillDetailsProps {
  skill: InstalledSkill;
  content: string;
  report?: SecurityReport;
  onClose: () => void;
  onSetCallTracking: (skill: InstalledSkill, enabled: boolean) => void | Promise<void>;
  onToggleFavorite: (skill: InstalledSkill) => void | Promise<void>;
  onEditTags: (skill: InstalledSkill, tags: string[]) => void | Promise<void>;
  onScan: (skill: InstalledSkill) => void | Promise<void>;
  onSetOptimization: (skill: InstalledSkill, enabled: boolean) => void | Promise<void>;
  onRecordEvolution: (skill: InstalledSkill) => void | Promise<void>;
}

export default function SkillDetails(props: SkillDetailsProps) {
  function editTags() {
    const raw = window.prompt('请输入标签，多个标签用逗号分隔：', props.skill.tags.join('，'));
    if (raw === null) return;
    void props.onEditTags(props.skill, parseTags(raw));
  }

  return (
    <div className="drawer-backdrop">
      <aside className="details-drawer">
        <header className="details-header">
          <div>
            <p>{productLabel(props.skill.product)}</p>
            <h3>{props.skill.name}</h3>
          </div>
          <button className="icon-button" onClick={props.onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="details-actions">
          <button className="button secondary" onClick={() => void props.onToggleFavorite(props.skill)}>
            <Star size={15} fill={props.skill.favorite ? 'currentColor' : 'none'} />
            {props.skill.favorite ? '取消星标' : '加星标'}
          </button>
          <button className="button secondary" onClick={editTags}>
            <Tags size={15} />
            标签
          </button>
          <button
            className="button secondary"
            onClick={() => void props.onSetCallTracking(props.skill, !props.skill.callTrackingEnabled)}
          >
            {props.skill.callTrackingEnabled ? <Ban size={15} /> : <Zap size={15} />}
            {props.skill.callTrackingEnabled ? '停用调用' : '启用调用'}
          </button>
          <button className="button secondary" onClick={() => void props.onScan(props.skill)}>
            <ShieldCheck size={15} />
            扫描
          </button>
          <button
            className="button secondary"
            onClick={() => void props.onSetOptimization(props.skill, !props.skill.memoryOptimizationEnabled)}
          >
            {props.skill.memoryOptimizationEnabled ? <Ban size={15} /> : <Sparkles size={15} />}
            {props.skill.memoryOptimizationEnabled ? '停用优化' : '启用优化'}
          </button>
          <button className="button secondary" onClick={() => void props.onRecordEvolution(props.skill)}>
            <Sparkles size={15} />
            沉淀经验
          </button>
        </div>
        <dl className="details-meta">
          <dt>路径</dt>
          <dd title={props.skill.localPath}>{props.skill.localPath}</dd>
          <dt>形态</dt>
          <dd title={props.skill.linkTarget ?? props.skill.localPath}>
            {storageLabel(props.skill.storageKind)}
            {props.skill.linkTarget ? ` -> ${props.skill.linkTarget}` : ''}
          </dd>
          <dt>调用次数</dt>
          <dd>{props.skill.callCount} 次</dd>
          <dt>最近调用</dt>
          <dd>{props.skill.lastCalledAt ? new Date(props.skill.lastCalledAt).toLocaleString('zh-CN') : '无记录'}</dd>
          <dt>安全状态</dt>
          <dd>{securityLabel(props.skill.securityLevel)}</dd>
        </dl>
        <div className="tag-list large">
          {props.skill.tags.length === 0 && props.skill.moduleTags.length === 0 ? (
            <span className="muted-text">暂无标签</span>
          ) : (
            <>
              {props.skill.tags.map((tag) => (
                <em key={`skill-${tag}`}>{tag}</em>
              ))}
              {props.skill.moduleTags
                .filter((tag) => !props.skill.tags.includes(tag))
                .map((tag) => (
                  <em className="module-tag" key={`module-${tag}`}>
                    {tag}
                  </em>
                ))}
            </>
          )}
        </div>
        {props.report && (
          <section className="mini-report">
            <strong>安全评分：{props.report.score}</strong>
            <span>{props.report.issues.length} 个问题</span>
          </section>
        )}
        <pre className="skill-content">{props.content}</pre>
      </aside>
    </div>
  );
}
