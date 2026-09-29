import { describe, expect, it } from 'vitest';
import { parseSkillMarkdown } from '../skillParser.js';

describe('parseSkillMarkdown', () => {
  it('parses yaml frontmatter fields from SKILL.md', () => {
    const result = parseSkillMarkdown({
      content: [
        '---',
        'name: code-review',
        'description: 帮助检查代码质量和风险',
        'version: 1.2.3',
        'author: Team A',
        '---',
        '',
        '# Code Review'
      ].join('\n'),
      directoryName: 'fallback-name'
    });

    expect(result.name).toBe('code-review');
    expect(result.description).toBe('帮助检查代码质量和风险');
    expect(result.version).toBe('1.2.3');
    expect(result.author).toBe('Team A');
  });

  it('falls back to directory name and first meaningful body paragraph', () => {
    const result = parseSkillMarkdown({
      content: [
        '# 写文档助手',
        '',
        '用于把零散想法整理成结构化文档。',
        '第二行说明会被合并。',
        '',
        '## 使用方式'
      ].join('\n'),
      directoryName: 'doc-helper'
    });

    expect(result.name).toBe('doc-helper');
    expect(result.description).toBe('用于把零散想法整理成结构化文档。 第二行说明会被合并。');
    expect(result.version).toBeUndefined();
    expect(result.author).toBeUndefined();
  });

  it('uses body content as fallback description when frontmatter omits description', () => {
    const result = parseSkillMarkdown({
      content: [
        '---',
        'name: code-review',
        'version: 1.2.3',
        '---',
        '',
        '# Code Review',
        '',
        '检查代码质量、风险和遗漏测试。'
      ].join('\n'),
      directoryName: 'fallback-name'
    });

    expect(result.name).toBe('code-review');
    expect(result.description).toBe('检查代码质量、风险和遗漏测试。');
  });
});
