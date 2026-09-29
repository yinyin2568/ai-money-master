import { describe, expect, it } from 'vitest';
import { createSkillId } from '../skillIdentity.js';

describe('createSkillId', () => {
  it('creates a stable id for the same path, source, and content', () => {
    const first = createSkillId({
      localPath: 'C:\\Users\\dell\\.claude\\skills\\code-review',
      sourceUrl: 'https://github.com/example/code-review',
      content: 'name: code-review'
    });
    const second = createSkillId({
      localPath: 'c:/Users/dell/.claude/skills/code-review',
      sourceUrl: 'https://github.com/example/code-review',
      content: 'name: code-review'
    });

    expect(first).toBe(second);
    expect(first.startsWith('skill_')).toBe(true);
  });

  it('normalizes trailing slashes in local paths', () => {
    const first = createSkillId({
      localPath: 'D:\\skills\\code-review',
      content: 'name: code-review'
    });
    const second = createSkillId({
      localPath: 'D:/skills/code-review/',
      content: 'name: code-review'
    });

    expect(second).toBe(first);
  });

  it('normalizes trailing slashes in source URLs', () => {
    const first = createSkillId({
      localPath: 'D:\\skills\\code-review',
      sourceUrl: 'https://github.com/example/code-review',
      content: 'name: code-review'
    });
    const second = createSkillId({
      localPath: 'D:\\skills\\code-review',
      sourceUrl: 'https://github.com/example/code-review/',
      content: 'name: code-review'
    });

    expect(second).toBe(first);
  });

  it('normalizes git suffixes in source URLs', () => {
    const first = createSkillId({
      localPath: 'D:\\skills\\code-review',
      sourceUrl: 'https://github.com/example/code-review',
      content: 'name: code-review'
    });
    const second = createSkillId({
      localPath: 'D:\\skills\\code-review',
      sourceUrl: 'https://github.com/example/code-review.git',
      content: 'name: code-review'
    });

    expect(second).toBe(first);
  });

  it('normalizes line endings in skill content', () => {
    const first = createSkillId({
      localPath: 'D:\\skills\\code-review',
      content: ['---', 'name: code-review', 'description: review', '---', '', '# Code Review'].join('\n')
    });
    const second = createSkillId({
      localPath: 'D:\\skills\\code-review',
      content: ['---', 'name: code-review', 'description: review', '---', '', '# Code Review'].join('\r\n')
    });

    expect(second).toBe(first);
  });

  it('changes when the source and content are different', () => {
    const first = createSkillId({
      localPath: 'C:\\Users\\dell\\.claude\\skills\\code-review',
      sourceUrl: 'https://github.com/example/code-review',
      content: 'name: code-review'
    });
    const second = createSkillId({
      localPath: 'C:\\Users\\dell\\.claude\\skills\\doc-helper',
      sourceUrl: 'https://github.com/example/doc-helper',
      content: 'name: doc-helper'
    });

    expect(first).not.toBe(second);
  });

  it('keeps the same id when only skills-manager managed blocks change', () => {
    const baseContent = ['---', 'name: code-review', 'description: review', '---', '', '# Code Review'].join('\n');
    const managedContent = [
      baseContent,
      '',
      '<!-- skills-manager:call-tracking:start -->',
      '## 调用统计',
      '- 统计文件：D:\\skills\\code-review\\.skills-memory\\usage.json',
      '<!-- skills-manager:call-tracking:end -->',
      '',
      '<!-- skills-manager:memory:start -->',
      '## 本地记忆',
      '- 记忆路径：D:\\skills\\code-review\\.skills-memory',
      '<!-- skills-manager:memory:end -->'
    ].join('\n');

    const first = createSkillId({
      localPath: 'D:\\skills\\code-review',
      content: baseContent
    });
    const second = createSkillId({
      localPath: 'D:\\skills\\code-review',
      content: managedContent
    });

    expect(second).toBe(first);
  });
});
