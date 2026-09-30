import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ exists: vi.fn(), exec: vi.fn(), stat: vi.fn(), chmod: vi.fn() }));
vi.mock('node:fs', () => ({ existsSync: mocks.exists, statSync: mocks.stat, chmodSync: mocks.chmod }));
vi.mock('node:child_process', () => ({ execFile: mocks.exec }));
import { getTokenUsageReport } from '../tokenUsageService.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); mocks.exists.mockReset(); mocks.exec.mockReset(); mocks.stat.mockReset(); mocks.chmod.mockReset(); });

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
    mocks.stat.mockReturnValue({ mode: 0o755 });
    mocks.exec.mockImplementation((_command, _args, _options, callback) => callback(null, { stdout: '[]', stderr: '' }));
    try {
      const report = await getTokenUsageReport(30, { codexHomes: ['/test/codex'] });
      expect(report.error).toBeUndefined();
      expect(mocks.exec.mock.calls[0][0].replace(/\\/g, '/')).toContain(suffix);
      expect(mocks.chmod).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  }
);

it.each(['darwin', 'linux'])(
  'repairs a bundled %s binary missing owner execute permission while preserving other mode bits',
  async (platform) => {
    vi.stubEnv('AI_MONEY_MASTER_CCUSAGE', '');
    vi.stubGlobal('process', Object.defineProperties(Object.create(process), {
      resourcesPath: { value: '/release/resources' },
      platform: { value: platform },
      arch: { value: 'arm64' }
    }));
    const suffix = `app.asar.unpacked/node_modules/@ccusage/ccusage-${platform}-arm64/bin/ccusage`;
    mocks.exists.mockImplementation((file: string) => file.replace(/\\/g, '/').endsWith(suffix));
    let mode = 0o644;
    mocks.stat.mockImplementation(() => ({ mode }));
    mocks.chmod.mockImplementation((_file, nextMode) => { mode = nextMode; });
    mocks.exec.mockImplementation((_command, _args, _options, callback) => callback(null, { stdout: '[]', stderr: '' }));

    const report = await getTokenUsageReport(30, { codexHomes: ['/test/codex'] });
    expect(report.error).toBeUndefined();
    expect(mocks.chmod).toHaveBeenCalledOnce();
    expect(mocks.chmod.mock.calls[0][0].replace(/\\/g, '/')).toContain(suffix);
    expect(mocks.chmod.mock.calls[0][1]).toBe(0o744);
    expect(mocks.exec).toHaveBeenCalledTimes(2);
  }
);
