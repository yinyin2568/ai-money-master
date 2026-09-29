import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TOKEN_SAVING_MARKER, TOKEN_SAVING_BLOCK } from '../../../src/shared/tokenSavingPrompt.js';
import { createPromptsService } from '../promptsService.js';

let tempHome: string | undefined;

afterEach(async () => {
  if (tempHome) await rm(tempHome, { recursive: true, force: true });
  tempHome = undefined;
});

describe('createPromptsService token saving batch', () => {
  async function setup(name = 'review.md') {
    tempHome = await mkdtemp(path.join(os.tmpdir(), 'other-user-中文-'));
    const dir = path.join(tempHome, '.codex', 'prompts');
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, name);
    await writeFile(file, '# Original\n');
    return { file, service: createPromptsService({ homeDir: tempHome, codexHome: path.join(tempHome, '.codex') }) };
  }

  it('updates legacy rules once while preserving the original backup', async () => {
    const { file, service } = await setup();
    await writeFile(`${file}.ai省钱大师-token-saving.bak`, '# Original\n');
    await writeFile(file, '# Original\n\n<!-- ai省钱大师:token-saving:v1 -->\n旧指令\n同类业务脚本重复编写或使用超过 3 次时，提示是否生成固定脚本，确认后再固化。\n');
    expect((await service.applyTokenSavingPrompt([file])).updated).toEqual([file]);
    expect(await readFile(file, 'utf8')).toContain(TOKEN_SAVING_BLOCK);
    expect((await service.applyTokenSavingPrompt([file])).skipped).toEqual([file]);
    await service.restoreTokenSavingPrompt([file]);
    expect(await readFile(file, 'utf8')).toBe('# Original\n');
  });

  it('exports the bundled guide under another user home and preserves their edits', async () => {
    const { service } = await setup();
    const first = await service.exportTokenSavingGuide();
    expect(first.localPath.startsWith(tempHome!)).toBe(true);
    expect(first.reference).toContain(first.localPath.replace(/\\/g, '/'));
    expect(await readFile(first.localPath, 'utf8')).toContain('## 可复用的助手指令');
    expect((await service.exportTokenSavingGuide()).localPath).toBe(first.localPath);
    await writeFile(first.localPath, 'my edits');
    const next = await service.exportTokenSavingGuide();
    expect(next.localPath).not.toBe(first.localPath);
    expect(await readFile(first.localPath, 'utf8')).toBe('my edits');
  });

  it('preserves user edits made after optimization', async () => {
    const { file, service } = await setup();
    await service.applyTokenSavingPrompt([file]);
    await writeFile(file, (await readFile(file, 'utf8')).replace('# Original', '# Edited') + '\nNew instruction\n');
    expect((await service.restoreTokenSavingPrompt([file])).updated).toEqual([file]);
    const content = await readFile(file, 'utf8');
    expect(content).toContain('# Edited');
    expect(content).toContain('New instruction');
    expect(content).not.toContain(TOKEN_SAVING_MARKER);
  });

  it('rejects structured configuration and paths outside managed roots', async () => {
    const { file, service } = await setup('command.toml');
    expect((await service.applyTokenSavingPrompt([file])).failed).toHaveLength(1);
    expect(await readFile(file, 'utf8')).toBe('# Original\n');
    const outside = path.join(tempHome!, 'outside.md');
    await writeFile(outside, 'outside');
    expect((await service.applyTokenSavingPrompt([outside])).failed).toHaveLength(1);
  });

  it('does not overwrite an edited managed block on restore', async () => {
    const { file, service } = await setup();
    await service.applyTokenSavingPrompt([file]);
    const edited = (await readFile(file, 'utf8')).replace('只减少冗余', '自定义修改');
    await writeFile(file, edited);
    expect((await service.restoreTokenSavingPrompt([file])).failed).toHaveLength(1);
    expect(await readFile(file, 'utf8')).toBe(edited);
  });
  it('appends the token saving block and restores the exact original text', async () => {
    tempHome = await mkdtemp(path.join(os.tmpdir(), 'ai-money-master-prompts-'));
    const promptDir = path.join(tempHome, '.codex', 'prompts');
    await mkdir(promptDir, { recursive: true });
    const promptPath = path.join(promptDir, 'review.md');
    const original = '# Review\n\n请检查这段代码。\n';
    await writeFile(promptPath, original, 'utf8');
    const service = createPromptsService({ homeDir: tempHome });

    const applied = await service.applyTokenSavingPrompt([promptPath]);
    expect(applied.updated).toHaveLength(1);
    expect(await readFile(promptPath, 'utf8')).toContain(TOKEN_SAVING_MARKER);

    const restored = await service.restoreTokenSavingPrompt([promptPath]);
    expect(restored.updated).toHaveLength(1);
    expect(await readFile(promptPath, 'utf8')).toBe(original);
  });

  it('scans and updates enabled custom Skill modules such as linyingskills', async () => {
    tempHome = await mkdtemp(path.join(os.tmpdir(), 'ai-money-master-prompts-module-'));
    const moduleDir = path.join(tempHome, 'linyingskills');
    await mkdir(moduleDir, { recursive: true });
    await mkdir(path.join(moduleDir, 'skills', 'sample-skill'), { recursive: true });
    const promptPath = path.join(moduleDir, 'SKILL.md');
    const skillPromptPath = path.join(moduleDir, 'skills', 'sample-skill', 'SKILL.md');
    await writeFile(promptPath, '# linyingskill\n\n模块提示词。\n', 'utf8');
    await writeFile(skillPromptPath, '# sample skill\n\n技能提示词。\n', 'utf8');
    const service = createPromptsService({ homeDir: tempHome });
    const directory = {
      id: 'custom_linyingskills',
      label: 'linyingskills',
      product: 'custom' as const,
      path: moduleDir,
      enabled: true,
      builtIn: false,
      tags: ['常用']
    };

    const scan = await service.scanLocalPrompts([directory]);
    expect(scan.sources.some((source) => source.label === 'linyingskills')).toBe(true);
    expect(scan.prompts.some((prompt) => prompt.localPath === promptPath)).toBe(true);
    expect(scan.prompts.some((prompt) => prompt.localPath === skillPromptPath)).toBe(false);
    const skillsScan = await service.scanLocalPrompts([directory], { includeSkills: true });
    expect(skillsScan.prompts.some((prompt) => prompt.localPath === skillPromptPath)).toBe(true);
    const applied = await service.applyTokenSavingPrompt([promptPath], [directory]);
    expect(applied.updated).toEqual([promptPath]);
    expect(await service.readLocalPrompt(promptPath, [directory])).toContain(TOKEN_SAVING_MARKER);
  });
});
