import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ exists: vi.fn(), exec: vi.fn() }));
vi.mock('node:fs', () => ({ existsSync: mocks.exists }));
vi.mock('node:child_process', () => ({ execFile: mocks.exec }));
import { getTokenUsageReport } from '../tokenUsageService.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); mocks.exists.mockReset(); mocks.exec.mockReset(); });

it.each([['darwin', 'arm64', 'ccusage'], ['darwin', 'x64', 'ccusage'], ['win32', 'x64', 'ccusage.exe']])(
  'uses the bundled native ccusage for %s %s outside the install working directory',
  async (platform, arch, executable) => {
    vi.stubEnv('AI_MONEY_MASTER_CCUSAGE', '');
    vi.stubGlobal('process', Object.defineProperties(Object.create(process), {
      resourcesPath: { value: '/release/resources' },
      platform: { value: platform },
      arch: { value: arch }
    }));
    const suffix = `app.asar.unpacked/node_modules/@ccusage/ccusage-${platform}-${arch}/bin/${executable}`;
    mocks.exists.mockImplementation((file: string) => file.replace(/\\/g, '/').endsWith(suffix));
    mocks.exec.mockImplementation((_command, _args, _options, callback) => callback(null, { stdout: '[]', stderr: '' }));
    try {
      const report = await getTokenUsageReport(30, { codexHomes: ['/test/codex'] });
      expect(report.error).toBeUndefined();
      expect(mocks.exec.mock.calls[0][0].replace(/\\/g, '/')).toContain(suffix);
    } finally {
      vi.unstubAllGlobals();
    }
  }
);
