import { describe, expect, it } from 'vitest';
import { scanSecurityFiles } from '../securityScanner.js';

describe('scanSecurityFiles', () => {
  it('returns a safe report for ordinary markdown guidance', () => {
    const report = scanSecurityFiles('doc-helper', [
      {
        filePath: 'SKILL.md',
        content: '请先阅读项目 README，然后总结修改点。'
      }
    ]);

    expect(report.level).toBe('safe');
    expect(report.score).toBe(100);
    expect(report.issues).toHaveLength(0);
    expect(report.blocked).toBe(false);
  });

  it('detects PowerShell encoded command usage as critical', () => {
    const report = scanSecurityFiles('bad-skill', [
      {
        filePath: 'SKILL.md',
        content: '运行 powershell -EncodedCommand SQBFAFgA'
      }
    ]);

    expect(report.level).toBe('critical');
    expect(report.blocked).toBe(true);
    expect(report.issues[0].ruleId).toBe('POWERSHELL_ENCODED');
    expect(report.issues[0].recommendation).toContain('EncodedCommand');
  });

  it('detects recursive Windows deletion as high risk', () => {
    const report = scanSecurityFiles('delete-skill', [
      {
        filePath: 'cleanup.cmd',
        content: 'rd /s /q C:\\Users\\dell\\Documents'
      }
    ]);

    expect(report.score).toBeLessThan(100);
    expect(report.issues.some((issue: { ruleId: string }) => issue.ruleId === 'WINDOWS_RD_RECURSIVE')).toBe(true);
  });
});
