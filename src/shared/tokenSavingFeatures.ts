import { TOKEN_SAVING_BLOCK, TOKEN_SAVING_GUIDE, TOKEN_SAVING_PROMPT } from './tokenSavingPrompt.js';

export type TokenSavingFeatureId = 'basic' | 'topics' | 'scripts' | 'rtk' | 'agents' | 'cache';
export type TokenSavingMode = 'inline' | 'document';
export interface TokenSavingFeature {
  id: TokenSavingFeatureId;
  title: string;
  description: string;
  version: string;
  content: string;
}
export interface TokenSavingFileStatus {
  path: string;
  error?: string;
  legacy: boolean;
  features: Record<TokenSavingFeatureId, { state: 'off' | 'current' | 'outdated'; mode?: TokenSavingMode; version?: string }>;
}

function section(title: string) {
  const heading = `## ${title}\n`;
  const start = TOKEN_SAVING_GUIDE.indexOf(heading);
  if (start < 0) throw new Error(`缺少指南章节：${title}`);
  const end = TOKEN_SAVING_GUIDE.indexOf('\n## ', start + heading.length);
  return TOKEN_SAVING_GUIDE.slice(start, end < 0 ? undefined : end).trim();
}
const principle = TOKEN_SAVING_GUIDE.slice(TOKEN_SAVING_GUIDE.indexOf('**只减少冗余'), TOKEN_SAVING_GUIDE.indexOf('\n## ')).trim();
export const TOKEN_SAVING_FEATURES: TokenSavingFeature[] = [
  { id: 'basic', title: '需求整理与减少重复', description: '保留完整的输入处理、工作连续性和工具使用边界。', version: '2026-09-23.1', content: `${principle}\n\n${section('收到输入后的处理')}\n\n${section('工具使用边界')}` },
  { id: 'topics', title: '会话与主题判断', description: '相关主题继续，无关的多轮主题仅提示另开会话。', version: '2026-09-23.1', content: section('会话与主题判断') },
  { id: 'scripts', title: '重复业务脚本复用', description: '第 4 次起提示固化脚本，保留确认和计数条件。', version: '2026-09-23.1', content: section('重复业务脚本') },
  { id: 'rtk', title: 'RTK 使用规范', description: '完整使用边界与命令示例；这个开关不安装或初始化 RTK。', version: '2026-09-23.1', content: section('RTK：减少命令输出进入上下文') },
  { id: 'agents', title: '低推理强度子代理', description: '包含授权、模型选择、上下文、派发约定和完整模板。', version: '2026-09-23.1', content: section('低推理强度子代理：按任务分工') },
  { id: 'cache', title: '模型与缓存', description: '保留切换模型、速度、推理强度与缓存的注意事项。', version: '2026-09-23.1', content: section('模型与缓存') }
];
export const LEGACY_FEATURE_IDS: TokenSavingFeatureId[] = ['basic', 'topics', 'scripts', 'rtk', 'agents'];

export function featureBlock(feature: TokenSavingFeature, mode: TokenSavingMode, documentPath?: string) {
  const body = mode === 'inline' ? feature.content : `请读取并遵守“${feature.title}”的完整规则文档：${JSON.stringify(documentPath?.replace(/\\/g, '/'))}。不要仅依据标题或摘要执行；无法读取时告知用户。`;
  return `<!-- ai省钱大师:token-saving:feature:${feature.id}:v${feature.version}:${mode} -->\n${body}\n<!-- /ai省钱大师:token-saving:feature:${feature.id} -->`;
}

export function findFeatureBlocks(content: string, id: TokenSavingFeatureId) {
  const pattern = new RegExp(`<!-- ai省钱大师:token-saving:feature:${id}:v([^\\s:]+):(inline|document) -->[\\s\\S]*?<!-- /ai省钱大师:token-saving:feature:${id} -->`, 'g');
  const matches = [...content.matchAll(pattern)];
  const starts = content.split(`<!-- ai省钱大师:token-saving:feature:${id}:`).length - 1;
  const ends = content.split(`<!-- /ai省钱大师:token-saving:feature:${id} -->`).length - 1;
  if (matches.length !== starts || starts !== ends) throw new Error(`“${id}”规则标记不完整，请先修复标记，文件未修改`);
  return matches;
}

export function replaceFeature(content: string, feature: TokenSavingFeature, replacement: string) {
  const matches = findFeatureBlocks(content, feature.id);
  if (!matches.length) return replacement ? `${content}${content.endsWith('\n') ? '\n' : '\n\n'}${replacement}\n` : content;
  let next = content;
  for (let index = matches.length - 1; index >= 0; index--) {
    const match = matches[index];
    next = next.slice(0, match.index!) + (index === 0 ? replacement : '') + next.slice(match.index! + match[0].length);
  }
  return next;
}

export function migrateLegacyFeatures(content: string) {
  const legacyV1 = `<!-- ai省钱大师:token-saving:v1 -->\n${TOKEN_SAVING_PROMPT.split('\n').slice(0, 5).join('\n')}`;
  let next = content;
  let migrated = false;
  for (const block of [TOKEN_SAVING_BLOCK, legacyV1]) {
    // Match either line ending without changing unrelated user text.
    for (const text of [block, block.replace(/\n/g, '\r\n')]) {
      if (next.includes(text)) { next = next.split(text).join(''); migrated = true; }
    }
  }
  if (/<!-- ai省钱大师:token-saving:v\d+ -->/.test(next)) throw new Error('旧版整体规则已被修改，无法安全拆分；请先核对旧规则');
  if (migrated) {
    for (const feature of TOKEN_SAVING_FEATURES.filter((item) => LEGACY_FEATURE_IDS.includes(item.id))) {
      if (!findFeatureBlocks(next, feature.id).length) next = replaceFeature(next, feature, featureBlock(feature, 'inline'));
    }
  }
  return { content: next, migrated };
}
