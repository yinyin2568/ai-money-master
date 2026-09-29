import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('vite Electron packaging config', () => {
  it('emits relative asset paths for file protocol builds', () => {
    const config = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');
    expect(config).toMatch(/base:\s*['"]\.\/['"]/);
  });

  it('keeps the dev index pointed at the source entry', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    expect(html).toContain('/src/main.tsx');
    expect(html).not.toMatch(/assets\/index-/);
  });

  it('uses a CommonJS preload script for packaged Electron windows', () => {
    const main = readFileSync(resolve(process.cwd(), 'electron/main.ts'), 'utf8');
    expect(main).toContain('preload.cjs');
  });

  it('disables Electron hardware acceleration before creating windows for reliable screenshots', () => {
    const main = readFileSync(resolve(process.cwd(), 'electron/main.ts'), 'utf8');
    expect(main).toMatch(/app\.disableHardwareAcceleration\(\)/);
  });

  it('defines cross-platform release scripts including mac packaging', () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
      build: { mac?: { target?: unknown } };
    };

    expect(packageJson.scripts['cli:release:copy']).toContain('scripts/copy-cli-release.mjs');
    expect(packageJson.scripts['pack:mac']).toContain('--mac');
    expect(packageJson.scripts['dist:mac']).toContain('--mac');
    expect(packageJson.build.mac?.target).toBeDefined();
  });

  it('has a macOS CI workflow for building the mac client', () => {
    const workflowPath = resolve(process.cwd(), '.github/workflows/build-mac.yml');
    expect(existsSync(workflowPath)).toBe(true);
    const workflow = readFileSync(workflowPath, 'utf8');
    expect(workflow).toContain('macos-15-intel');
    expect(workflow).toContain('runner: macos-15');
    expect(workflow).toContain('npm run dist:mac');
  });
});
