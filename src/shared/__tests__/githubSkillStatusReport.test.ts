import { describe, expect, it } from 'vitest';
import { createGithubSkillStatusReport } from '../githubSkillStatusReport.js';
import type { GithubSkillUpdateStatus } from '../types.js';

describe('createGithubSkillStatusReport', () => {
  it('summarizes installed skills and GitHub source update status for AI consumption', () => {
    const statuses: GithubSkillUpdateStatus[] = [
      {
        skillId: 'skill_a',
        name: 'company-claude-skills',
        localPath: 'D:/skills/company-claude-skills',
        githubUrl: 'https://github.com/acme/company-claude-skills',
        branch: 'main',
        currentHash: '61f2edf8abcdef',
        latestHash: '1474ab88abcdef',
        status: 'outdated',
        message: 'New commits available'
      },
      {
        skillId: 'skill_b',
        name: 'yt-dlp',
        localPath: 'D:/skills/yt-dlp',
        githubUrl: 'https://github.com/yt-dlp/yt-dlp',
        branch: 'master',
        currentHash: 'c8680b6abcdef',
        latestHash: 'c8680b6abcdef',
        status: 'current',
        message: 'Up to date'
      }
    ];

    const report = createGithubSkillStatusReport(10, statuses);

    expect(report.title).toBe('Skills 状态报告');
    expect(report.summary).toEqual({
      installedSkillCount: 10,
      githubSourceSkillCount: 2,
      outdatedCount: 1,
      currentCount: 1,
      errorCount: 0
    });
    expect(report.githubSourceUpdates[0]).toMatchObject({
      skillName: 'company-claude-skills',
      status: 'outdated',
      localHash: '61f2edf8',
      remoteHash: '1474ab88',
      message: 'New commits available'
    });
  });

  it('orders actionable GitHub source updates before current skills', () => {
    const statuses: GithubSkillUpdateStatus[] = [
      {
        skillId: 'skill_current',
        name: 'aaa-current',
        localPath: 'D:/skills/aaa-current',
        githubUrl: 'https://github.com/acme/current',
        branch: 'main',
        currentHash: '111111111111',
        latestHash: '111111111111',
        status: 'current'
      },
      {
        skillId: 'skill_outdated',
        name: 'bbb-outdated',
        localPath: 'D:/skills/bbb-outdated',
        githubUrl: 'https://github.com/acme/outdated',
        branch: 'main',
        currentHash: '222222222222',
        latestHash: '333333333333',
        status: 'outdated'
      },
      {
        skillId: 'skill_error',
        name: 'ccc-error',
        localPath: 'D:/skills/ccc-error',
        githubUrl: 'https://github.com/acme/error',
        branch: 'main',
        currentHash: '444444444444',
        status: 'error',
        message: 'Network unavailable'
      }
    ];

    const report = createGithubSkillStatusReport(3, statuses);

    expect(report.githubSourceUpdates.map((status) => status.status)).toEqual(['error', 'outdated', 'current']);
    expect(statuses.map((status) => status.status)).toEqual(['current', 'outdated', 'error']);
  });
});
