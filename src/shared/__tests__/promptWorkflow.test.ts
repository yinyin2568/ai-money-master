import { describe, expect, it } from 'vitest';
import {
  buildWorkflowPrompt,
  cloneWorkflowConfig,
  defaultWorkflowConfig,
  getWorkflowPreset
} from '../qaPromptWorkflow.js';

describe('prompt workflow generator', () => {
  it('builds the default QA workflow prompt with the expected fixed gates', () => {
    const result = buildWorkflowPrompt(defaultWorkflowConfig);

    expect(result.prompt).toContain('QA Automation 的 DEFAULT-WORKFLOW.md');
    expect(result.prompt).toContain('- 工作流模式：默认功能自动化');
    expect(result.prompt).toContain('- 功能/E2E');
    expect(result.skillRoute.join('\n')).toContain('e2e-test-master');
    expect(result.prompt).toContain('测试执行后必须主动提交');
    expect(result.badges).toContain('执行后固定提交覆盖率');
  });

  it('routes a complex API preset to pytest and impact analysis', () => {
    const preset = getWorkflowPreset('complex-api');
    expect(preset).toBeDefined();

    const result = buildWorkflowPrompt(preset!.config);
    expect(result.prompt).toContain('API 主执行器：pytest CLI');
    expect(result.skillRoute.join('\n')).toContain('api-test-master');
    expect(result.skillRoute.join('\n')).toContain('api-pytest-template');
    expect(result.prompt).toContain('获取版本代码影响分析');
  });

  it('does not mutate the source config when cloning', () => {
    const cloned = cloneWorkflowConfig(defaultWorkflowConfig);
    cloned.scopes.push('api');
    cloned.permissions.productionWrite = true;

    expect(defaultWorkflowConfig.scopes).toEqual(['e2e']);
    expect(defaultWorkflowConfig.permissions.productionWrite).toBe(false);
  });
});
