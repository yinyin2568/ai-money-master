import { resolveDataDirectory } from './storageService.js';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AiClientId, ReusableScene, ReusableSceneStore, SaveReusableSceneInput, SceneMemoryReference } from '../../src/shared/types.js';

const CLIENT_IDS = new Set<AiClientId>(['codex', 'claude', 'gemini', 'openclaw', 'other']);
const MAX_SCENES = 500;

interface SceneMemoryServiceOptions {
  homeDir?: string;
}

interface StoredScenes {
  version: 1;
  scenes: ReusableScene[];
}

export function createSceneMemoryService(options: SceneMemoryServiceOptions = {}) {
  const stateDir = path.join(resolveDataDirectory(options.homeDir ?? os.homedir()), 'state');
  const storePath = path.join(stateDir, 'reusable-scenes.json');
  let mutationQueue: Promise<void> = Promise.resolve();

  async function listReusableScenes(): Promise<ReusableSceneStore> {
    const store = await readStore();
    return {
      path: storePath,
      scenes: [...store.scenes].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    };
  }

  async function saveReusableScene(input: SaveReusableSceneInput): Promise<ReusableScene> {
    const normalized = normalizeInput(input);
    let savedScene!: ReusableScene;
    await enqueue(async () => {
      const store = await readStore();
      const existing = input.id ? store.scenes.find((scene) => scene.id === input.id) : undefined;
      const timestamp = new Date().toISOString();
      savedScene = {
        id: existing?.id ?? randomUUID(),
        ...normalized,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp
      };
      const nextScenes = existing
        ? store.scenes.map((scene) => scene.id === existing.id ? savedScene : scene)
        : [savedScene, ...store.scenes];
      if (nextScenes.length > MAX_SCENES) throw new Error(`场景数量不能超过 ${MAX_SCENES} 个`);
      await writeStore({ version: 1, scenes: nextScenes });
    });
    return savedScene;
  }

  async function deleteReusableScene(sceneId: string) {
    const normalizedId = normalizeText(sceneId, '场景 ID', 80);
    await enqueue(async () => {
      const store = await readStore();
      await writeStore({ version: 1, scenes: store.scenes.filter((scene) => scene.id !== normalizedId) });
    });
  }

  async function getStorePath() {
    await readStore();
    return storePath;
  }

  async function enqueue(operation: () => Promise<void>) {
    const next = mutationQueue.then(operation, operation);
    mutationQueue = next.catch(() => undefined);
    return next;
  }

  async function readStore(): Promise<StoredScenes> {
    await mkdir(stateDir, { recursive: true });
    if (!existsSync(storePath)) {
      const emptyStore: StoredScenes = { version: 1, scenes: [] };
      await writeStore(emptyStore);
      return emptyStore;
    }
    try {
      const parsed = JSON.parse(await readFile(storePath, 'utf8')) as Partial<StoredScenes>;
      if (parsed.version !== 1 || !Array.isArray(parsed.scenes) || parsed.scenes.length > MAX_SCENES || !parsed.scenes.every(isReusableScene)) {
        throw new Error('场景存储内容无效');
      }
      return {
        version: 1,
        scenes: parsed.scenes
      };
    } catch {
      throw new Error('场景存储文件格式无效，请先检查 reusable-scenes.json');
    }
  }

  async function writeStore(store: StoredScenes) {
    await mkdir(stateDir, { recursive: true });
    const temporaryPath = `${storePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, storePath);
  }

  return { listReusableScenes, saveReusableScene, deleteReusableScene, getStorePath };
}

function normalizeInput(input: SaveReusableSceneInput) {
  if (!input || typeof input !== 'object') throw new Error('场景内容不能为空');
  const clientId = CLIENT_IDS.has(input.clientId) ? input.clientId : 'other';
  return {
    title: normalizeText(input.title, '场景名称', 100),
    clientId,
    task: normalizeText(input.task, '本次任务', 8000),
    context: normalizeOptionalText(input.context, 12000),
    constraints: normalizeOptionalText(input.constraints, 8000),
    expectedOutput: normalizeOptionalText(input.expectedOutput, 8000),
    tags: normalizeTags(input.tags),
    memories: normalizeMemories(input.memories)
  };
}

function normalizeText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}不能为空`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new Error(`${label}不能超过 ${maxLength} 个字符`);
  return normalized;
}

function normalizeOptionalText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function normalizeTags(tags: unknown) {
  if (!Array.isArray(tags)) return [];
  return Array.from(new Set(tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean)))
    .slice(0, 20)
    .map((tag) => tag.slice(0, 40));
}

function normalizeMemories(memories: unknown): SceneMemoryReference[] {
  if (!Array.isArray(memories)) return [];
  return memories.slice(0, 50).flatMap((memory) => {
    if (!memory || typeof memory !== 'object') return [];
    const candidate = memory as Partial<SceneMemoryReference>;
    if (typeof candidate.path !== 'string' || !candidate.path.trim()) return [];
    return [{
      name: normalizeOptionalText(candidate.name, 120) || path.basename(candidate.path),
      path: path.resolve(candidate.path.trim()),
      sourceLabel: normalizeOptionalText(candidate.sourceLabel, 120) || '本地记忆'
    }];
  });
}

function isReusableScene(value: unknown): value is ReusableScene {
  if (!value || typeof value !== 'object') return false;
  const scene = value as Partial<ReusableScene>;
  return typeof scene.id === 'string'
    && typeof scene.title === 'string'
    && typeof scene.task === 'string'
    && typeof scene.createdAt === 'string'
    && typeof scene.updatedAt === 'string'
    && CLIENT_IDS.has(scene.clientId as AiClientId)
    && Array.isArray(scene.tags)
    && Array.isArray(scene.memories);
}
