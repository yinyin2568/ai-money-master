import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPromptsService } from '../promptsService.js';
import { TOKEN_SAVING_FEATURES, featureBlock } from '../../../src/shared/tokenSavingFeatures.js';
import { TOKEN_SAVING_BLOCK } from '../../../src/shared/tokenSavingPrompt.js';

let root: string;
let file: string;
let service: ReturnType<typeof createPromptsService>;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'token-features-其他用户-'));
  const codexHome = path.join(root, 'custom codex');
  await mkdir(path.join(codexHome, 'prompts'), { recursive: true });
  file = path.join(codexHome, 'prompts', 'global.md');
  await writeFile(file, '# 用户全局指令\n保留我的规则。\n');
  service = createPromptsService({ homeDir: root, codexHome });
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
const read = () => readFile(file, 'utf8');
const status = async () => (await service.getTokenSavingFeatureStatus([file]))[0];

describe('independent token saving features', () => {
  it('writes the complete chapter once and detects enabled state across service instances', async () => {
    expect((await status()).features.agents.state).toBe('off');
    expect((await service.setTokenSavingFeature([file], 'agents', true, 'inline')).updated).toEqual([file]);
    const feature = TOKEN_SAVING_FEATURES.find((item) => item.id === 'agents')!;
    expect(await read()).toContain(feature.content);
    expect(await read()).toContain('可复用的派发模板');
    expect((await service.setTokenSavingFeature([file], 'agents', true, 'inline')).skipped).toEqual([file]);
    const reopened = createPromptsService({ homeDir: root, codexHome: path.join(root, 'custom codex') });
    expect((await reopened.getTokenSavingFeatureStatus([file]))[0].features.agents.state).toBe('current');
    expect((await status()).features.rtk.state).toBe('off');
  });

  it('replaces old versions and removes duplicates without touching user content', async () => {
    const feature = TOKEN_SAVING_FEATURES[1];
    const old = featureBlock({ ...feature, version: '0', content: 'old content' }, 'inline');
    await writeFile(file, `before\n${old}\nkeep between\n${old}\nafter`);
    expect((await status()).features.topics.state).toBe('outdated');
    await service.setTokenSavingFeature([file], 'topics', true, 'inline');
    const text = await read();
    expect(text.split(featureBlock(feature, 'inline'))).toHaveLength(2);
    expect(text).not.toContain('old content');
    expect(text).toContain('keep between');
    expect(text).toContain('after');
  });

  it('disables only one feature while preserving later edits and other enabled features', async () => {
    await service.setTokenSavingFeature([file], 'basic', true, 'inline');
    await service.setTokenSavingFeature([file], 'scripts', true, 'inline');
    await writeFile(file, (await read()).replace('保留我的规则', '修改后的规则') + '\n后续新增');
    await service.setTokenSavingFeature([file], 'basic', false, 'inline');
    expect(await read()).toContain('修改后的规则');
    expect(await read()).toContain('后续新增');
    expect((await status()).features.basic.state).toBe('off');
    expect((await status()).features.scripts.state).toBe('current');
    expect((await service.setTokenSavingFeature([file], 'basic', false, 'inline')).skipped).toEqual([file]);
  });

  it('creates local full documents, repairs missing or modified documents and removes only references', async () => {
    const feature = TOKEN_SAVING_FEATURES.find((item) => item.id === 'agents')!;
    const doc = path.join(root, '.skills-manager', 'prompts', 'token-saving', `agents-v${feature.version}.md`);
    await service.setTokenSavingFeature([file], 'agents', true, 'document');
    expect(await read()).toContain(doc.replace(/\\/g, '/'));
    expect(await readFile(doc, 'utf8')).toBe(feature.content);
    await rm(doc);
    expect((await status()).features.agents.state).toBe('outdated');
    expect((await service.setTokenSavingFeature([file], 'agents', true, 'document')).updated).toEqual([file]);
    await writeFile(doc, 'changed');
    await service.setTokenSavingFeature([file], 'agents', true, 'document');
    expect(await readFile(doc, 'utf8')).toBe(feature.content);
    await service.setTokenSavingFeature([file], 'agents', false, 'document');
    expect(await read()).not.toContain('feature:agents');
    expect(await readFile(doc, 'utf8')).toBe(feature.content);
  });

  it('changes delivery mode without duplicating rules', async () => {
    await service.setTokenSavingFeature([file], 'topics', true, 'inline');
    await service.setTokenSavingFeature([file], 'topics', true, 'document');
    expect((await status()).features.topics).toMatchObject({ state: 'current', mode: 'document' });
    await service.setTokenSavingFeature([file], 'topics', true, 'inline');
    expect((await status()).features.topics).toMatchObject({ state: 'current', mode: 'inline' });
  });

  it('migrates legacy rules and actually disables the requested functionality', async () => {
    await writeFile(file, `original\n${TOKEN_SAVING_BLOCK}\nuser tail`);
    expect((await status()).legacy).toBe(true);
    await service.setTokenSavingFeature([file], 'rtk', false, 'inline');
    expect(await read()).not.toContain('token-saving:v2');
    expect(await read()).toContain('user tail');
    const next = await status();
    expect(next.features.rtk.state).toBe('off');
    expect(next.features.agents.state).toBe('current');
    expect(next.features.basic.state).toBe('current');
    expect(next.features.cache.state).toBe('off');
  });

  it('does not damage a file containing unclosed managed markers', async () => {
    const text = 'user\n<!-- ai省钱大师:token-saving:feature:basic:v0:inline -->\nunfinished\n';
    await writeFile(file, text);
    expect((await service.setTokenSavingFeature([file], 'basic', false, 'inline')).failed).toHaveLength(1);
    expect(await read()).toBe(text);
    expect((await status()).error).toContain('不完整');
  });

  it('reports partial batch failure and rejects arbitrary feature IDs', async () => {
    const outside = path.join(root, 'outside.md');
    await writeFile(outside, 'outside');
    const result = await service.setTokenSavingFeature([file, outside], 'cache', true, 'inline');
    expect(result.updated).toEqual([file]);
    expect(result.failed).toHaveLength(1);
    expect(await readFile(outside, 'utf8')).toBe('outside');
    await expect(service.setTokenSavingFeature([file], 'invalid' as 'basic', true, 'inline')).rejects.toThrow('无效');
  });

  it('serializes simultaneous feature changes so neither update is lost', async () => {
    await Promise.all([
      service.setTokenSavingFeature([file], 'basic', true, 'inline'),
      service.setTokenSavingFeature([file], 'topics', true, 'inline')
    ]);
    const next = await status();
    expect(next.features.basic.state).toBe('current');
    expect(next.features.topics.state).toBe('current');
  });
});
