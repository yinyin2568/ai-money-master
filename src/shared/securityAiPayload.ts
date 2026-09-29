import type { InstalledSkill, SecurityIssue, SecurityReport } from './types.js';

export interface SecurityAiPayload {
  skill: {
    id: string;
    name: string;
    description: string;
    product: InstalledSkill['product'];
    localPath: string;
    skillFilePath: string;
  };
  summary: {
    level: SecurityReport['level'];
    score: number;
    blocked: boolean;
    issueCount: number;
    scannedFileCount: number;
  };
  riskExplanations: Array<{
    ruleId: string;
    ruleName: string;
    severity: SecurityIssue['severity'];
    file: string;
    line: number;
    evidence: string;
    judgmentReason: string;
    modificationSuggestion: string;
  }>;
  recommendations: string[];
  aiOptimization: {
    objective: string;
    constraints: string[];
    prompt: string;
  };
}

export function createSecurityAiPayload(skill: InstalledSkill, report: SecurityReport): SecurityAiPayload {
  const riskExplanations = report.issues.map((issue) => ({
    ruleId: issue.ruleId,
    ruleName: issue.ruleName,
    severity: issue.severity,
    file: issue.file,
    line: issue.line,
    evidence: issue.code,
    judgmentReason: issue.description,
    modificationSuggestion: issue.recommendation
  }));
  const constraints =
    report.issues.length === 0
      ? [
          '优先复查扫描结论，不要为了修改而修改。',
          '保留 Skill 原有功能意图和调用方式。',
          '不要扩大联网、命令执行、文件删除或凭据读取权限。',
          '如未发现新问题，保留当前安全结论并说明复查依据。'
        ]
      : [
          '只围绕命中的风险项做最小必要修改。',
          '保留 Skill 原有功能意图和调用方式。',
          '不要扩大联网、命令执行、文件删除或凭据读取权限。',
          '修复后重新运行 CLI 安全扫描确认风险下降。'
        ];

  return {
    skill: {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      product: skill.product,
      localPath: skill.localPath,
      skillFilePath: skill.skillFilePath
    },
    summary: {
      level: report.level,
      score: report.score,
      blocked: report.blocked,
      issueCount: report.issues.length,
      scannedFileCount: report.scannedFiles.length
    },
    riskExplanations,
    recommendations: report.recommendations,
    aiOptimization: {
      objective:
        report.issues.length === 0
          ? `复查 Skill "${skill.name}"，当前未发现明显风险。`
          : `优化 Skill "${skill.name}" 的安全风险，优先处理 ${report.level} 级问题。`,
      constraints,
      prompt: buildOptimizationPrompt(skill, report, riskExplanations, constraints)
    }
  };
}

function buildOptimizationPrompt(
  skill: InstalledSkill,
  report: SecurityReport,
  riskExplanations: SecurityAiPayload['riskExplanations'],
  constraints: string[]
) {
  const outputRequirement =
    riskExplanations.length === 0
      ? '输出要求：先说明复查结论；如发现确有必要修改，再给出最小修改方案和需要重新运行的 CLI 扫描命令。'
      : '输出要求：先说明修改方案，再修改文件，最后给出需要重新运行的 CLI 扫描命令。';
  const issueLines =
    riskExplanations.length === 0
      ? ['- 未命中具体风险项。']
      : riskExplanations.map(
          (issue, index) =>
            `${index + 1}. [${issue.severity}] ${issue.ruleName} (${issue.ruleId})\n` +
            `   文件：${issue.file}:${issue.line}\n` +
            `   证据：${issue.evidence}\n` +
            `   判断原因：${issue.judgmentReason}\n` +
            `   修改建议：${issue.modificationSuggestion}`
        );

  return [
    `请优化本地 Skill 的安全风险。`,
    `Skill：${skill.name}`,
    `路径：${skill.localPath}`,
    `安全等级：${report.level}`,
    `安全分：${report.score}`,
    `是否阻断：${report.blocked ? '是' : '否'}`,
    '',
    '风险项：',
    ...issueLines,
    '',
    '约束：',
    ...constraints.map((item) => `- ${item}`),
    '',
    outputRequirement
  ].join('\n');
}
