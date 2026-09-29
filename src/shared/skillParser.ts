import type { SkillParseResult } from './types.js';

interface ParseInput {
  content: string;
  directoryName: string;
}

export function parseSkillMarkdown(input: ParseInput): SkillParseResult {
  const frontmatter = parseFrontmatter(input.content);
  const fallbackDescription = extractFallbackDescription(input.content);

  return {
    name: frontmatter.name ?? input.directoryName,
    description: frontmatter.description ?? fallbackDescription,
    version: frontmatter.version,
    author: frontmatter.author
  };
}

function parseFrontmatter(content: string): Partial<SkillParseResult> {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return {};

  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (endIndex < 0) return {};

  const result: Partial<SkillParseResult> = {};
  for (const rawLine of lines.slice(1, endIndex)) {
    const match = rawLine.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!match) continue;

    const key = match[1].trim();
    const value = unquote(match[2].trim());
    if (!value) continue;

    if (key === 'name') result.name = value;
    if (key === 'description') result.description = value;
    if (key === 'version') result.version = value;
    if (key === 'author') result.author = value;
  }

  return result;
}

function unquote(value: string) {
  return value.replace(/^['"]|['"]$/g, '').trim();
}

function extractFallbackDescription(content: string) {
  const lines = content.split(/\r?\n/);
  const frontmatterEndIndex =
    lines[0]?.trim() === '---' ? lines.findIndex((line, index) => index > 0 && line.trim() === '---') : -1;
  const bodyLines = frontmatterEndIndex >= 0 ? lines.slice(frontmatterEndIndex + 1) : lines;
  const usefulLines: string[] = [];

  for (const rawLine of bodyLines) {
    const line = rawLine.trim();
    if (!line || line === '---' || line.startsWith('#')) {
      if (usefulLines.length > 0) break;
      continue;
    }

    usefulLines.push(line);
  }

  return usefulLines.join(' ').slice(0, 500);
}
