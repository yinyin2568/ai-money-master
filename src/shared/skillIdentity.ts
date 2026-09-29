interface SkillIdentityInput {
  localPath: string;
  sourceUrl?: string;
  content: string;
}

export function createSkillId(input: SkillIdentityInput) {
  const stableMaterial = [
    normalizePath(input.localPath),
    normalizeSourceUrl(input.sourceUrl),
    normalizeSkillContent(input.content)
  ].join('|');

  return `skill_${fnv1a(stableMaterial)}`;
}

function normalizeSkillContent(content: string) {
  return content
    .replace(/\r\n?/g, '\n')
    .replace(/<!--\s*skills-manager:([a-z-]+):start\s*-->[\s\S]*?<!--\s*skills-manager:\1:end\s*-->/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizePath(value: string) {
  return value.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/+$/g, '').toLowerCase();
}

function normalizeSourceUrl(value?: string) {
  return (value ?? '').trim().replace(/\/+$/g, '').replace(/\.git$/i, '').toLowerCase();
}

function fnv1a(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
