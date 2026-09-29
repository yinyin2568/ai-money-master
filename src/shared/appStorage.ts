import type { SkillsManagerApi } from './types.js';

declare global {
  interface Window { skillsManager?: SkillsManagerApi; }
}

// The file in the selected data directory is authoritative; localStorage is only
// imported on first use so a reinstall cannot overwrite recovered preferences.
let values: Record<string, string> = {};
let queue = Promise.resolve();
let saveError: unknown;
let switching = false;

export async function initializeAppStorage() {
  if (!window.skillsManager) return;
  const legacy = Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)!]));
  values = await window.skillsManager.loadPreferences(legacy);
}

function persist(key: string, value: string | null) {
  queue = queue.then(async () => {
    try { await window.skillsManager!.savePreference(key, value); }
    catch (error) {
      saveError = error;
      window.dispatchEvent(new CustomEvent('app-storage-error', { detail: `本地数据保存失败：${String(error)}` }));
    }
  });
}

export const appStorage = {
  getItem(key: string): string | null {
    return window.skillsManager ? values[key] ?? null : localStorage.getItem(key);
  },
  setItem(key: string, value: string) {
    if (switching) return;
    if (!window.skillsManager) { localStorage.setItem(key, value); return; }
    if (values[key] === value) return;
    values[key] = value;
    persist(key, value);
  },
  removeItem(key: string) {
    if (switching) return;
    if (!window.skillsManager) { localStorage.removeItem(key); return; }
    delete values[key];
    persist(key, null);
  }
};

export async function prepareStorageSwitch() {
  switching = true;
  await queue;
  if (saveError) { switching = false; throw saveError; }
}

export function cancelStorageSwitch() { switching = false; }
