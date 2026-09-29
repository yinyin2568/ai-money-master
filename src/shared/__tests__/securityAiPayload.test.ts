import { describe, expect, it } from 'vitest';
import { createSecurityAiPayload } from '../securityAiPayload.js';
import type { InstalledSkill, SecurityReport } from '../types.js';

describe('createSecurityAiPayload', () => {
  it('turns a security report into an AI-ready optimization payload', () => {
    const skill = {
      id: 'skill_demo',
      name: 'demo',
      description: '演示 Skill',
      product: 'codex',
      localPath: 'D:/skills/demo',
      skillFilePath: 'D:/skills/demo/SKILL.md'
    } as InstalledSkill;
    const report: SecurityReport = {
      skillId: 'skill_demo',
      score: 20,
      level: 'high',
      blocked: false,
      scannedFiles: ['D:/skills/demo/SKILL.md'],
      recommendations: ['避免 rm -rf 作用于变量或上级目录。'],
      issues: [
        {
          ruleId: 'RM_RF',
          ruleName: 'Unix 递归强制删除',
          file: 'D:/skills/demo/SKILL.md',
          line: 12,
          code: 'rm -rf "$TARGET"',
          severity: 'high',
          description: 'rm -rf 可能造成破坏性删除。',
          recommendation: '避免 rm -rf 作用于变量或上级目录；先解析绝对路径并限制在工作区内。'
        }
      ]
    };

    const payload = createSecurityAiPayload(skill, report);

    expect(payload.skill).toMatchObject({ name: 'demo', localPath: 'D:/skills/demo' });
    expect(payload.summary).toMatchObject({ level: 'high', score: 20, issueCount: 1, scannedFileCount: 1 });
    expect(payload.riskExplanations[0]).toMatchObject({
      ruleId: 'RM_RF',
      file: 'D:/skills/demo/SKILL.md',
      line: 12,
      evidence: 'rm -rf "$TARGET"',
      judgmentReason: 'rm -rf 可能造成破坏性删除。',
      modificationSuggestion: '避免 rm -rf 作用于变量或上级目录；先解析绝对路径并限制在工作区内。'
    });
    expect(payload.aiOptimization.prompt).toContain('demo');
    expect(payload.aiOptimization.prompt).toContain('RM_RF');
    expect(payload.aiOptimization.constraints).toContain('修复后重新运行 CLI 安全扫描确认风险下降。');
  });

  it('does not ask the AI to modify files when the security report has no issues', () => {
    const skill = {
      id: 'skill_safe',
      name: 'safe-skill',
      description: '安全 Skill',
      product: 'codex',
      localPath: 'D:/skills/safe-skill',
      skillFilePath: 'D:/skills/safe-skill/SKILL.md'
    } as InstalledSkill;
    const report: SecurityReport = {
      skillId: 'skill_safe',
      score: 100,
      level: 'safe',
      blocked: false,
      scannedFiles: ['D:/skills/safe-skill/SKILL.md'],
      recommendations: ['未发现明显风险，建议定期复查。'],
      issues: []
    };

    const payload = createSecurityAiPayload(skill, report);

    expect(payload.aiOptimization.prompt).not.toContain('再修改文件');
    expect(payload.aiOptimization.prompt).toContain('如发现确有必要修改');
    expect(payload.aiOptimization.constraints.join('\n')).not.toContain('风险下降');
    expect(payload.aiOptimization.constraints.join('\n')).toContain('保留当前安全结论');
  });
});
