# AI Money Master (AI省钱大师)

[English](README.en.md) · [简体中文](README.md)

A local manager for AI development tools, Skills, prompts, and Codex token costs. It brings local AI assets into one place and offers practical ways to reduce repeated input and command output with reusable Skills, prompt rules, and RTK.

The desktop app uses Electron, React, and TypeScript. You can install the Windows desktop build without first installing Node.js. This project is currently **v0.1.2, a public preview**. Cost statistics currently read **local Codex sessions**; discovering assets from other clients does not mean their usage or bills are tracked. Savings depend on your tasks, models, and workflow. No fixed saving rate is promised.

## Contents

- [Download and install](#download-and-install)
- [Quick start](#quick-start)
- [Features and navigation](#features-and-navigation)
- [Modules and Skills](#modules-and-skills)
- [Prompt rules and recovery](#prompt-rules-and-recovery)
- [Token and cost statistics](#token-and-cost-statistics)
- [RTK](#rtk)
- [GitHub, Gitee, and the community catalog](#github-gitee-and-the-community-catalog)
- [Other local assets and reusable scenarios](#other-local-assets-and-reusable-scenarios)
- [Local data, credentials, and network access](#local-data-credentials-and-network-access)
- [Troubleshooting](#troubleshooting)
- [Development and builds](#development-and-builds)
- [Standalone CLI](#standalone-cli)
- [Validation and feedback](#validation-and-feedback)

## Terminology

| Term | Meaning in this project |
| --- | --- |
| Module | A managed directory or imported source with a name, tags, and an enabled state |
| Skill | A skill directory whose entry point is `SKILL.md`; it may also contain scripts, templates, or reference files |
| CLI | A command-line tool such as Codex or Claude Code; this project also ships its own CLI |
| MCP | A protocol used by AI clients to connect tools or data sources; this app primarily discovers and displays local MCP configuration |
| Agent | A local AI client's agent definition or configuration file |
| Token | A unit of model input/output; it is not identical to a character |
| RTK | A tool that reduces common command output; installation, client integration, and measured results are separate states |

## Download and install

Open the [Releases page](https://github.com/yinyin2568/ai-money-master/releases) and choose an asset for your platform and architecture. **An asset is available only when it actually appears on that page.** If a platform has no release asset, build from source.

| Platform | Asset | Current status |
| --- | --- | --- |
| Windows x64 | `ai-money-master-<version>-win-x64.exe` | Generated and validated within the Windows scope described below |
| macOS Apple Silicon / Intel | `.dmg` / `.zip` | A build workflow is provided; check the actual Release assets and validation record |
| Linux | — | No desktop installer is provided yet |

### Windows installation and updates

1. Download the installer and `SHA256SUMS.txt` from the same release.
2. In the download directory, calculate the installer hash and compare it with the matching filename in `SHA256SUMS.txt`.
3. Run the installer, choose an installation directory, and launch **AI省钱大师**.
4. For an update, close the app first, then run the newer installer. Back up important settings beforehand if needed.

```powershell
Get-FileHash -Algorithm SHA256 .\ai-money-master-0.1.2-win-x64.exe
```

The Windows installer lets you choose its installation directory. The current installer is **unsigned**, so Windows may show an unknown-publisher warning; verify the download source and SHA-256. Updating or uninstalling does not intentionally delete the app's separate data directory. Moving the installation directory does not move your Skills, client configuration, or account settings.

### Additional tools

| Task | Additional requirement |
| --- | --- |
| Local management, prompt rules, and token statistics in the desktop app | No separate Node.js install; statistics require local Codex session logs |
| Importing or updating Git repositories | Git available to the app process |
| Importing NPX modules | Node.js, npm, and the package's own requirements |
| RTK features | RTK, which can be installed from the app's RTK controls |
| Standalone CLI or source development | Node.js 22 or newer and npm |

macOS builds are unsigned and not notarized. A successful build is not evidence of an actual macOS installation test; consult the validation record for the tested scope.

## Screenshots

These screenshots use an isolated test profile, a demo Skill, and a synthetic session. They contain no author's accounts, memories, or real spending records.

![Overview](docs/images/dashboard.png)

![Token usage](docs/images/token-usage.png)

## Features and navigation

The interface uses Chinese page labels. The table maps each page to its purpose.

| Page | What it does |
| --- | --- |
| 总览 (Overview) | Skill scan results and module overview |
| 统计 (Statistics) | Last 30 days of local Codex tokens, daily chart, module grouping, cost estimates, and cumulative RTK results |
| 我的 Skills (My Skills) | Search, favorites, tags, enable/disable, copy, package, call records, and memory optimization |
| 我的提示词 (My Prompts) | Discover and view prompt files; manage individual token-saving rules and RTK controls |
| 我的 CLI / 我的 MCP | Find commands, versions, and configurations; inspect, copy redacted configuration, and locate files |
| 我的插件 / 我的 Agent / 我的记忆 | Discover and inspect local assets and open their locations |
| GitHub转Skill | Turn a repository into a locally managed Skill |
| 仓库技能管理 | Track repository sources, check updates, and update local Skills |
| GitHub收藏管理 / Gitee管理 | Sync and search repositories, manage tags and local favorites; Gitee can also track branches |
| 社区市场首页 | Browse built-in entries, save repository links, install into a target module, and share links |
| 场景复用 | Save task context, associate local memories, copy assembled context, or pass it to prompt generation |
| 设置 (Settings) | Modules and paths, account credentials, offline mode, and local data storage |
| 安全扫描 / 日志 | Rule-based scan results and local operation logs |

Security scanning uses rules and can miss problems or raise false alarms. Review imported Skills, scripts, and NPX packages yourself before executing them.

## Quick start

1. Install and open the app. In **设置**, scan and save an existing client directory or add one of your own Skills directories.
2. Scan Skills from **总览**, then use **我的 Skills** to search, inspect, and favorite entries.
3. Open **统计** for Codex sessions. If you use a custom `CODEX_HOME`, make that environment variable available when launching the app.
4. In **我的提示词**, scan and select one prompt file, read a rule's full text, then enable only the rule you want. Switching it on edits the selected file immediately; switch it off to remove the managed rule. See [recovery](#backups-and-recovery) before restoring an entire file.
5. Configure account credentials in the app only if you want GitHub or Gitee features. Enable offline mode when remote features are not needed.

Actions that edit a selected file or configuration take effect on your machine. Try bulk actions on a small, familiar set of files first.

## Modules and Skills

### Add a module

Use **设置** to add one of the following sources:

| Source | Input | Result |
| --- | --- | --- |
| Default path | Scan existing AI client paths, select, and save | Add an existing directory to the scan |
| Local directory | Path, name, and optional tags | Manage Skills under that directory |
| GitHub repository | Repository URL and import settings | Clone locally and optionally sync later |
| NPX package | Package name, version, and optional registry | Process the package through local npm/NPX tools |

Module paths must be unique. An enabled and saved path is included in subsequent scans. Rescan after changing a path or source. Candidate paths include Codex, Claude, Cursor, Gemini, and other clients, but finding a directory **does not imply complete integration with that client**.

Adding a local directory usually records a scan location. Git and NPX imports create local files and may download or run third-party installation logic. Behavior depends on the source project.

### Manage Skills

In **我的 Skills**, filter by module, name, tags, or state; read `SKILL.md`; change favorites and tags; enable or disable Skills; and perform supported bulk actions.

- **Copy to another module:** Choose a target and either a full copy or a symbolic link. Copies are independent; a link shares its source and can break if the source moves. Creating links on Windows may require suitable permissions.
- **Enable/disable:** Rename between `SKILL.md` and `SKILL.md.disabled`. Whether a client notices the change immediately depends on that client.
- **Package/share:** Export selected Skills for import elsewhere. Check the included directory for credentials, personal configuration, or task data first.
- **Delete:** This changes local Skill files; it is more than hiding an item from the list.
- **Call tracking:** Inject this tool's recorder convention into a Skill and record calls through supported entry points. It is not an automatic audit of every AI client's actual invocations. Disabling tracking removes the injected content and resets its counters.
- **Memory optimization:** Insert a managed memory reference and append experience notes when requested. Existing call history cannot be reconstructed automatically.

The **安全扫描** page uses local rules to flag some risky commands, sensitive text, or suspicious patterns. Its optional AI-assisted action is not a sandbox or a security guarantee.

## Prompt rules and recovery

### Select a prompt file

**我的提示词** discovers global prompt sources such as Codex `prompts`, Claude `commands`, Cursor `rules`, and several other client directories. It can also scan enabled custom modules. Opt into the corresponding scan scope when you need prompt files inside Skills.

Inspect a file before selecting it. The rule panel then displays selected-file counts, enabled-state proportions, versions, and write mode. **Toggling a rule writes immediately; there is no additional Save button.**

### Six independent rules

| Rule shown in the UI | Purpose and boundary |
| --- | --- |
| 需求整理与减少重复 | Organize requests and avoid repetition while keeping necessary information |
| 会话与主题判断 | Continue related topics; suggest a new conversation for a clearly unrelated, longer topic |
| 重复业务脚本复用 | Suggest a reusable script when repeated work meets the rule's conditions and obtain confirmation |
| RTK 使用规范 | Write RTK usage guidance; this switch does not install or initialize RTK |
| 低推理强度子代理 | Describe task delegation and model/reasoning choices; actual execution still depends on client capabilities and authorization |
| 模型与缓存 | Describe model, speed, reasoning, and caching considerations |

Each rule exposes its full text. Enabling adds or updates the block marked by this tool; disabling removes that block while retaining other content. For a mixed selection, use **补齐 / 更新** to update all selected files, or **全部关闭此项** to turn off that rule in all of them.

### Two write modes

- **完整正文 (Full text):** Put the complete rule in each selected prompt file.
- **引用分项文档 (Document reference):** Store the full rule in a separate document under the current user's data area and write a reference into the selected prompt. The AI client must be able to read that path. Reconfigure the reference after moving a prompt to another computer. Disabling the rule removes its reference from the target prompt; a shared rule document remains available.

The tool manages only its own marked blocks. A full guide pasted manually, or the same rule in another prompt, may still apply. On first modification, legacy combined rules are split when safe; damaged markers cause an error without changing that file.

### Backups and recovery

Before changing a prompt, the tool saves a backup. Independent rules use `.ai省钱大师-token-features.bak`; the legacy combined append operation uses `.ai省钱大师-token-saving.bak`. An existing independent-rule backup is not replaced on every toggle, so it reflects the first saved version.

Turning off one rule removes only that rule and can leave trailing blank lines. **The current interface has no whole-file backup Restore button.** For complete recovery, use **打开位置** to locate the prompt and adjacent backup, compare them, save a copy of any later edits, then restore the backup you verified. A whole-file restoration can overwrite changes made after the backup.

The legacy combined operation retains a backend compatibility restore method, which is not the current per-rule UI flow. Read the complete [token-saving guide](public/token-saving-guide.md) for the rule text (the bundled guide is in Chinese).

## Token and cost statistics

**统计** reads the last 30 days of local Codex sessions and shows input, output, cache-read, cache-write, and total tokens, plus daily trends and module grouping. The app need not remain open while those sessions run.

The default source is the user's `.codex` directory. If you set `CODEX_HOME`, that variable must be visible to the app at launch. Multiple sources follow the configured environment and the data returned by `ccusage`. Bills, subscription balances, quotas, and usage from every other AI platform are not integrated.

- The bundled `ccusage` reads local Codex sessions with `--offline`.
- USD cost is an estimate based on prices supplied by `ccusage`. Custom CNY estimates take separate prices per 1,000 input, output, cache-read, and cache-write tokens.
- Estimates are not subscription invoices, actual charges, or remaining allowance. Missing sessions or pricing data affect the result.
- RTK measures command-output reduction entering model context; it does not establish an equal percentage reduction in an entire session or bill.
- Prompt rules can change assistant behavior. Judge any savings against comparable real tasks; no fixed reduction is promised.

The custom CNY calculation is:

```text
estimated cost = (input tokens × input price
                + output tokens × output price
                + cache-read tokens × cache-read price
                + cache-write tokens × cache-write price) / 1,000
```

Each price is in **CNY per 1,000 tokens**. An empty or zero price contributes nothing, so a partial price list does not produce a complete cost estimate. Token categories follow the `ccusage` record format; compare models, dates, cache pricing, and provider rules before comparing with a bill.

## RTK

The RTK controls are at the top of **我的提示词**; **统计** also shows cumulative results.

1. Choose **检测 RTK** to inspect the installed version and client integration state.
2. If needed, choose **安装 RTK（需联网）**. This needs network access to the official distribution source.
3. Select Codex or Claude Code and choose **开启 RTK**. Initialization changes the relevant client configuration after backing up its main configuration.
4. Restart that AI client as indicated by the app.
5. After supported real command calls occur, inspect **查看 RTK 收益**.

Installed, integrated, and producing statistics are different conditions. The prompt rule **RTK 使用规范** only writes guidance; it does not install or initialize RTK. The statistics estimate reduced command output, not a guaranteed decrease in total tokens or money. Cumulative RTK data and the 30-day Codex chart cover different time ranges, so dividing one by the other does not yield a valid current-period saving rate.

## GitHub, Gitee, and the community catalog

### Accounts

In **设置 → 账号管理**, provide your own access token. Username or email is optional auxiliary information; the token determines the actual identity and permissions. Obtain and manage credentials on the corresponding platform. The app cannot generate tokens for you.

Sync, search, favorites, stars, and repository access may require different permissions. Grant only what the features you use need. App-level starred-repository management is a different use case from publishing this project's source. Private repositories also depend on account, token, and local Git authentication.

### Repositories and favorites

- **GitHub收藏管理:** Sync starred repositories, search, filter, tag, and mark local favorites. A platform star action changes your remote GitHub account state.
- **Gitee管理:** Sync and search repositories, manage tags and local favorites, and watch branches where the API and your permissions allow it.
- **GitHub转Skill:** Provide a repository URL, local root, and module name; choose whether to preserve the Git remote. Inspect the generated `SKILL.md` and scripts before use.
- **仓库技能管理:** Check upstream status and update a repository-backed local Skill. Checking requires network access; updating changes local files.

Local tags and favorites are app data. Stars and other platform actions affect the corresponding remote account.

### Community catalog

The current catalog has built-in entries and lets you save GitHub or Gitee repository URLs in a local list. Choose an enabled target module to install an entry. You can also open its repository or share its link.

Saving a custom entry does **not** publish it to a hosted community marketplace. Installation needs the relevant network and tools; running a third-party project depends on its own dependencies and instructions.

## Other local assets and reusable scenarios

**我的 CLI** discovers local commands, versions, and configuration locations. **我的 MCP** shows source client, transport, command or URL, and configured enabled state. Viewing and copying configuration applies redaction, but you should still inspect custom fields before sharing.

**我的插件**, **我的 Agent**, and **我的记忆** discover, filter, inspect, and reveal local files. They do not provide universal installation, sign-in, service startup, or health checks for all clients. A displayed enabled MCP entry does not prove its server is reachable.

In **场景复用**, save task context with selected local memories. Later, reuse the scenario, copy assembled context, or send it to the app's prompt-generation page for editing. “Send” here means navigation within this app. Referenced memories are read when you copy or send; reselect files if their paths change. Prompt generation produces text for your own AI client; it does not make that client execute a task automatically.

## Local data, credentials, and network access

The default app data directory is `~/.skills-manager`; `~/.skills-manager-storage.json` points to the active directory. Use **设置 → 本地数据存储** to choose another location.

| Data | Location and behavior |
| --- | --- |
| Modules, favorites, tags, accounts, and other app state | State files under the active data directory; `state/skills.json` includes account settings |
| Scenarios, operation logs, and related files | Active data directory, shared by desktop app and CLI |
| Data-directory pointer | `~/.skills-manager-storage.json` in the user's home directory |
| Skills, prompts, memories, repositories, and AI-client configuration | Their original external paths; migrating app data does not automatically move them |
| Electron UI preferences and custom token prices | UI storage; copying only the app state directory may not include every preference |

| Action | Data and network boundary |
| --- | --- |
| Scan Skills, prompts, memories, or MCP settings | Read local files; operation logs are stored locally |
| Codex statistics | Run bundled `ccusage` with `--offline` for sessions and pricing data |
| GitHub/Gitee favorites and repositories | Call those platforms' APIs or a Git remote; authenticated actions use the configured token |
| Git/NPX import or update | Run local tools; they may download repositories/dependencies or run a package's install logic |
| RTK installation or activation | User-triggered tool setup; it may contact the official distribution source and edit AI-client configuration |
| External links | Open in the system browser |

Account tokens are currently stored in local configuration **without app-level encryption**. Protect file permissions and do not share the entire data directory. GitHub/Gitee tokens are not included in the released installer or source snapshot.

Offline mode blocks remote Git, GitHub, Gitee, and NPX actions **within this app**. It is not operating-system network isolation and does not control an external browser or independently started tool installers.

Migration requires an empty target directory. After copying and verification, the app switches its active pointer and retains the original directory. Restore switches to an existing data directory; it does not merge or overwrite it. External repositories and client files remain at their original paths. After migration or restore, check the active directory, modules, and favorites. Across computers, adjust external paths and document references. Backing up app state does not replace backing up your own Skills and client configuration.

The **日志** page helps locate actions and failures. Paths and task details in logs may be private; redact them before public reports.

## Troubleshooting

**No usage data?** Check for local Codex session logs and your `CODEX_HOME`. An empty session set and a read error are different; inspect the displayed error first.

**Can I use only the browser preview?** Only some pages work in a browser. File scanning, system tools, and local configuration require Electron.

**My favorites disappeared on a new computer.** Favorites, tags, scenarios, and account settings are local data. On the same computer, reconnect an existing directory through storage restore. Before transferring data to another computer, remove credentials and private material.

**A Skill is missing.** Confirm that its module path exists, is enabled and saved, and contains `SKILL.md`. Rescan and check active filters. Default-path discovery only lists candidates that exist locally.

**Why is a rule still followed after its switch is off?** Check other prompts, a manually pasted guide, and context already loaded by the AI client. The switch removes only the marked block managed by this tool.

**Document references fail after moving computers.** References contain local paths. Create references for the new machine or use Full text mode.

**RTK is installed but shows zero savings.** Check client initialization and restart, then whether supported real command calls occurred. No data alone does not prove a read failure.

**GitHub or Gitee returns 401/403.** Check token validity, account and repository permissions, and offline mode. A correct username does not add token permissions.

**Buttons do not work in browser preview.** Local capabilities depend on Electron's main process. Launch `npm run dev` or install the desktop build.

**Will this lower every model's cost automatically?** No. The app supplies statistics, asset organization, and configurable rules; your AI client still executes tasks and chooses models. Compare real, similar tasks to assess a saving.

## Development and builds

Use Node.js 22 or newer. Install dependencies on the machine where you build. Extract the source archive and enter the directory containing `package.json`, or clone the repository:

```bash
git clone https://github.com/yinyin2568/ai-money-master.git
cd ai-money-master
npm ci
npm run dev
```

`npm run dev` compiles the Electron main process and starts Vite plus the desktop app. For a UI-only browser preview, run `npm run dev:server` and open `http://127.0.0.1:5173`; most local system features are unavailable there. Recompile and restart Electron after changing main-process or service code.

```bash
npm run typecheck
npm test
npm run build
npm run dist:win
```

Build macOS artifacts **on a Mac**. You can select an architecture explicitly:

```bash
npm ci
npm run dist:mac -- --arm64
# Or on an Intel Mac:
npm run dist:mac -- --x64
```

Do not copy Windows `node_modules` to a Mac. Default packaged output is `release/electron-builder/`.

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | Check frontend and Electron TypeScript types |
| `npm test` | Run the current test suite |
| `npm run build` | Typecheck, build the production frontend, and compile Electron |
| `npm run pack:win` / `npm run pack:mac` | Create unpacked app directories |
| `npm run dist:win` / `npm run dist:mac` | Build installers/distribution artifacts without automatically publishing them |
| `npm run cli:release` | Prepare the standalone CLI directory |

GitHub Actions runs installation, typechecking, tests, and build on Windows. The macOS workflow builds separately on Apple Silicon and Intel hosts. A workflow artifact is not automatically a published Release asset or an actual installation test.

`private: true` in `package.json` prevents accidental npm publication; it does not prevent sharing the source on GitHub. Internal IDs and storage paths retain the historical `skills-manager` name for compatibility with existing data.

## Standalone CLI

From a source checkout:

```bash
npm ci
npm run cli -- help
npm run cli:release
```

`release/cli/` is the standalone distribution directory. After extracting the CLI archive, install its runtime dependencies **in that directory**:

```bash
npm ci --omit=dev --ignore-scripts
```

Use `skills-manager.cmd` on Windows, or `./skills-manager` on macOS/Linux. The CLI and desktop app share local app data and its storage lock. AI-facing instructions are in [skills-manager-cli](skills/skills-manager-cli/SKILL.md).

```powershell
# Windows PowerShell
.\skills-manager.cmd help
.\skills-manager.cmd settings get
.\skills-manager.cmd directories
.\skills-manager.cmd scan
```

```bash
# macOS / Linux
./skills-manager help
./skills-manager scan
```

If the Unix shim loses its executable bit, run `node dist-electron/electron/cli.js help` directly.

| Command family | Capabilities |
| --- | --- |
| `scan` / `directories` | Scan Skills and list module directories |
| `settings` | Read settings and set offline mode |
| `module` | Default paths; create local/GitHub/NPX modules; sync or remove modules |
| `skill` | Read, enable/disable, copy/link to a module, package, tag, track calls, optimize, and record experience |
| `security` | Scan one Skill or all Skills, optionally with the AI-assisted flag |
| `github-skill` | Create a Skill from a repository, check updates, and update it |
| `github-star` | Configure an account, sync, search, star, tag, and manage local favorites |
| `gitee` | Configure an account, sync, search, tag, favorite, and watch branches |
| `market` | List, add, or remove local catalog entries; install and share |

Use the version's `help` output for exact arguments. The CLI currently has no command for the desktop Token statistics page. Configure credentials in the desktop app when possible, to avoid putting tokens into shell history.

`scan`, `directories`, and `settings get` are read operations. Creation, sync, toggles, deletion, packaging, and platform actions can change local or remote state. If the shared storage lock reports that the data is in use, finish the other operation first.

## Project structure

- `electron/`: main process, IPC, CLI, and local services.
- `src/components/`: React pages and components.
- `src/shared/`: shared types and business functions.
- `public/`: icon and token-saving guide.
- `scripts/`: packaging and CLI distribution scripts.
- `.github/workflows/`: checks and platform builds.

## Validation and feedback

The v0.1.2 Windows x64 preview was validated with typechecking, 142 tests across 15 files, production build, NSIS packaging, and an extracted app launched with an isolated user-data directory. The checks also covered a demo Skill, synthetic Codex usage, prompt edits and restoration, rule toggles, storage migration/recovery, and basic CLI commands. See the [release validation record](docs/release-validation.md) (Chinese) for the exact scope and subsequent CI work.

The later main branch passed 144 tests in the Windows GitHub Actions workflow, and both Apple Silicon and Intel macOS build jobs passed. Those macOS jobs do not constitute an installation-and-launch test on a Mac.

This is not a full install/uninstall test in a new Windows account or VM. Actual macOS installation, live account writes, execution of third-party NPX packages, performance tests, and a complete security assessment are outside that validation scope. A rule or secret scan with no findings does not guarantee the absence of all problems.

Report issues in [GitHub Issues](https://github.com/yinyin2568/ai-money-master/issues). Include app version, OS, reproduction steps, expected behavior, and actual behavior. Remove tokens, private paths, prompt bodies, and session content from logs, screenshots, and samples before posting. Changes are listed in the [changelog](CHANGELOG.md).
