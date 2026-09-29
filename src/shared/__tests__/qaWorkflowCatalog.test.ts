import { describe, expect, it } from 'vitest';
import {
  detectScopesByKeywords,
  matchRunModeByKeywords,
  matchWorkflowPresetByKeywords,
  qaRunModeCatalog,
  qaWorkflowCatalog,
  resolveQaWorkflowIntent
} from '../qaWorkflowCatalog.js';
import { workflowPresets } from '../qaPromptWorkflow.js';

describe('QA workflow keyword catalog', () => {
  it('covers every built-in workflow from the demo exactly once', () => {
    expect(qaWorkflowCatalog.map((item) => item.id)).toEqual(workflowPresets.map((item) => item.id));
    expect(new Set(qaWorkflowCatalog.map((item) => item.id)).size).toBe(14);
    expect(qaWorkflowCatalog.every((item) => item.trigger.primary.length > 0)).toBe(true);
    expect(qaWorkflowCatalog.every((item) => item.trigger.examples.length > 0)).toBe(true);
    expect(qaWorkflowCatalog.every((item) => item.skillRoute[0]?.startsWith('qa-test-orchestrator'))).toBe(
      true
    );
  });

  it.each([
    ['执行普通功能测试并输出报告', 'default'],
    ['做需求分析、用例设计和验收口径，不执行测试', 'requirements'],
    ['快速冒烟核心流程并给出简洁报告', 'smoke'],
    ['执行 Web 页面回归并保留浏览器证据', 'web-regression'],
    ['回归 Android 和 iOS App 核心流程', 'app-regression'],
    ['用 Apifox CLI 执行简单 API 测试', 'simple-api'],
    ['复杂支付 API 使用 pytest 验证幂等、并发和事务', 'complex-api'],
    ['只做上一轮失败项和 Bug 回归', 'bug-regression'],
    ['读取 AI 未覆盖日志进行第二轮补测并复跑', 'coverage-round-two'],
    ['复杂重要版本需要代码影响分析和完整报告', 'important-release'],
    ['发布前全量回归并配置上线门禁', 'full-release'],
    ['执行 SEO 专项，检查 canonical、robots 和索引', 'seo'],
    ['执行性能压测并验证 P95 和 QPS', 'performance'],
    ['根据日志做问题诊断和根因分析，不执行测试', 'diagnosis']
  ] as const)('matches “%s” to %s', (text, expectedPreset) => {
    expect(matchWorkflowPresetByKeywords(text).id).toBe(expectedPreset);
  });

  it('keeps the five run modes separate from concrete workflow presets', () => {
    expect(qaRunModeCatalog.map((item) => item.id)).toEqual([
      'interactive',
      'one-shot',
      'loop',
      'ci',
      'loop-ci'
    ]);
    expect(matchRunModeByKeywords('一次性执行，不需要逐步确认')?.id).toBe('one-shot');
    expect(matchRunModeByKeywords('启用 Loop 自动外环，同时配置 CI 质量门禁')?.id).toBe('loop-ci');
  });

  it('detects additive test scopes without changing the matched workflow', () => {
    expect(detectScopesByKeywords('发布前检查 Web、App、API、性能和安全测试')).toEqual([
      'web',
      'app',
      'api',
      'performance',
      'security'
    ]);
  });

  it('returns a deterministic fallback and an explainable resolution', () => {
    const fallback = resolveQaWorkflowIntent('帮我测一下这个需求');
    expect(fallback.presetId).toBe('default');
    expect(fallback.presetMatch.confidence).toBe('fallback');

    const resolved = resolveQaWorkflowIntent('复杂接口用 pytest 验证幂等，并使用 Loop 自动外环');
    expect(resolved.presetId).toBe('complex-api');
    expect(resolved.runMode).toBe('loop');
    expect(resolved.presetMatch.matchedKeywords).toContain('pytest');
    expect(resolved.explicitScopes).toContain('api');
  });
});
