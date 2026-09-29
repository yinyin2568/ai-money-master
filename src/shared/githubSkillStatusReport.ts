import type { GithubSkillUpdateStatus } from './types.js';

export interface GithubSkillStatusReport {
  title: string;
  summary: {
    installedSkillCount: number;
    githubSourceSkillCount: number;
    outdatedCount: number;
    currentCount: number;
    errorCount: number;
  };
  githubSourceUpdates: Array<{
    skillId: string;
    skillName: string;
    localPath: string;
    githubUrl: string;
    branch: string;
    status: GithubSkillUpdateStatus['status'];
    localHash: string;
    remoteHash?: string;
    version?: string;
    message?: string;
  }>;
}

export function createGithubSkillStatusReport(
  installedSkillCount: number,
  statuses: GithubSkillUpdateStatus[]
): GithubSkillStatusReport {
  const orderedStatuses = [...statuses].sort(compareUpdateStatus);

  return {
    title: 'Skills 状态报告',
    summary: {
      installedSkillCount,
      githubSourceSkillCount: statuses.length,
      outdatedCount: statuses.filter((status) => status.status === 'outdated').length,
      currentCount: statuses.filter((status) => status.status === 'current').length,
      errorCount: statuses.filter((status) => status.status === 'error').length
    },
    githubSourceUpdates: orderedStatuses.map((status) => ({
      skillId: status.skillId,
      skillName: status.name,
      localPath: status.localPath,
      githubUrl: status.githubUrl,
      branch: status.branch,
      status: status.status,
      localHash: shortHash(status.currentHash),
      remoteHash: status.latestHash ? shortHash(status.latestHash) : undefined,
      version: status.version,
      message: status.message
    }))
  };
}

function compareUpdateStatus(first: GithubSkillUpdateStatus, second: GithubSkillUpdateStatus) {
  const priority = { error: 0, outdated: 1, current: 2 };
  const priorityDelta = priority[first.status] - priority[second.status];
  if (priorityDelta !== 0) return priorityDelta;
  return first.name.localeCompare(second.name, 'zh-CN');
}

function shortHash(value: string) {
  return value.slice(0, 8);
}
