/// <reference types="vite/client" />

import type { SkillsManagerApi } from './shared/types';

export {};

declare global {
  interface Window {
    skillsManager?: SkillsManagerApi;
  }
}
