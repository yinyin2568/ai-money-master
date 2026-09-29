import type { SecurityIssue, SecurityReport } from './types.js';

interface TextFile {
  filePath: string;
  content: string;
}

interface Rule {
  id: string;
  name: string;
  pattern: RegExp;
  severity: SecurityIssue['severity'];
  weight: number;
  description: string;
  recommendation: string;
  hardTrigger: boolean;
}

const RULES: Rule[] = [
  {
    id: 'POWERSHELL_ENCODED',
    name: 'PowerShell 编码执行',
    pattern: /powershell.*-(e|enc|encodedcommand)\b/i,
    severity: 'critical',
    weight: 100,
    description: 'PowerShell 使用编码命令执行，常见于隐藏真实指令。',
    recommendation: '移除 -EncodedCommand，改为明文脚本文件或显式参数；如果必须执行 PowerShell，先展示命令内容并限定可写路径。',
    hardTrigger: true
  },
  {
    id: 'WINDOWS_RD_RECURSIVE',
    name: 'Windows 递归删除目录',
    pattern: /\b(rd|rmdir)\b.*\/s/i,
    severity: 'high',
    weight: 80,
    description: 'Windows rd/rmdir /s 会递归删除目录。',
    recommendation: '避免对用户目录或宽泛路径执行 rd/rmdir /s；改为白名单路径、先预览待删除文件，并要求用户二次确认。',
    hardTrigger: false
  },
  {
    id: 'WINDOWS_DEL_RECURSIVE',
    name: 'Windows 递归删除文件',
    pattern: /\b(del|erase)\b.*\/s/i,
    severity: 'high',
    weight: 80,
    description: 'Windows del /s 会递归删除文件。',
    recommendation: '避免 del /s 直接递归删除；改为精确文件列表、白名单目录和可撤销备份，再执行删除。',
    hardTrigger: false
  },
  {
    id: 'RM_RF',
    name: 'Unix 递归强制删除',
    pattern: /\brm\s+(-[a-zA-Z]*\s*)*-[a-zA-Z]*r[a-zA-Z]*f|rm\s+(-[a-zA-Z]*\s*)*-[a-zA-Z]*f[a-zA-Z]*r/i,
    severity: 'high',
    weight: 80,
    description: 'rm -rf 可能造成破坏性删除。',
    recommendation: '避免 rm -rf 作用于变量或上级目录；先解析绝对路径并限制在工作区内，必要时改为移动到回收区。',
    hardTrigger: false
  },
  {
    id: 'WGET_CURL_EXEC',
    name: '下载后直接执行',
    pattern: /\b(curl|wget)\b.*\|\s*(bash|sh|powershell|pwsh)/i,
    severity: 'critical',
    weight: 95,
    description: '从网络下载内容后直接执行存在远程代码执行风险。',
    recommendation: '不要把 curl/wget 结果直接管道到 shell；先下载到临时文件，校验来源和摘要，再让用户确认后执行。',
    hardTrigger: true
  },
  {
    id: 'SECRET_LITERAL',
    name: '疑似硬编码密钥',
    pattern: /\b(api[_-]?key|secret[_-]?key|access[_-]?token|password)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{8,}/i,
    severity: 'medium',
    weight: 45,
    description: '文件中可能包含硬编码密钥或口令。',
    recommendation: '移除硬编码密钥，改用环境变量或本机凭据管理；如果密钥已经提交过，应立即轮换。',
    hardTrigger: false
  }
];

export function scanSecurityFiles(skillId: string, files: TextFile[]): SecurityReport {
  const issues: SecurityIssue[] = [];
  const scannedFiles = files.map((file) => file.filePath);

  for (const file of files) {
    const lines = file.content.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (isCommentLine(line)) return;

      for (const rule of RULES) {
        if (!rule.pattern.test(line)) continue;
        issues.push({
          ruleId: rule.id,
          ruleName: rule.name,
          file: file.filePath,
          line: index + 1,
          code: line.trim().slice(0, 200),
          severity: rule.severity,
          description: rule.description,
          recommendation: rule.recommendation
        });
      }
    });
  }

  const deducted = issues.reduce((sum, issue) => {
    const rule = RULES.find((candidate) => candidate.id === issue.ruleId);
    return sum + (rule?.weight ?? 0);
  }, 0);
  const blocked = issues.some((issue) => RULES.find((rule) => rule.id === issue.ruleId)?.hardTrigger);
  const score = Math.max(0, 100 - Math.min(deducted, 100));

  return {
    skillId,
    score,
    level: getLevel(score, blocked),
    issues,
    recommendations: getRecommendations(issues),
    scannedFiles,
    blocked
  };
}

function getLevel(score: number, blocked: boolean): SecurityReport['level'] {
  if (blocked || score < 20) return 'critical';
  if (score < 50) return 'high';
  if (score < 75) return 'medium';
  if (score < 90) return 'low';
  return 'safe';
}

function getRecommendations(issues: SecurityIssue[]) {
  if (issues.length === 0) return ['未发现明显风险，建议定期复查。'];
  return Array.from(new Set(issues.map((issue) => issue.recommendation)));
}

function isCommentLine(line: string) {
  const trimmed = line.trim();
  return trimmed.startsWith('#') || trimmed.startsWith('//') || trimmed.startsWith('<!--');
}
