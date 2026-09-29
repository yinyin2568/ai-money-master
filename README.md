# AI省钱大师 · AI Money Master

本地 AI 工具、Skills 与 Token 成本管理器。集中管理 AI 开发资产，查看本机 Codex 会话消耗，并通过提示词、可复用 Skills 和 RTK 减少重复工作。

基于 Electron、React 和 TypeScript。桌面版直接安装使用，无需先安装 Node.js。

## 下载安装

打开 [Releases 下载页](https://github.com/yinyin2568/ai-money-master/releases)，选择与你的系统和架构匹配的安装包。

| 平台 | 文件 | 状态 |
| --- | --- | --- |
| Windows x64 | `ai-money-master-<版本>-win-x64.exe` | 首版发布目标 |
| macOS Apple Silicon / Intel | `.dmg` / `.zip` | 提供构建工作流；以 Release 的附件和验证说明为准 |
| Linux | — | 暂未提供桌面安装包 |

Windows 安装程序支持选择安装目录。当前安装包未配置代码签名；系统可能提示未知发布者，请核对下载来源和 Release 提供的 SHA-256 校验值。更新与卸载不会主动删除应用自己的数据目录。

macOS 构建默认未签名、未公证，不能把构建成功视为已通过实际安装验证。

## 界面预览

下图来自隔离测试环境，使用演示 Skill 和测试会话，不包含作者的账号、记忆或真实消费记录。

![总览](docs/images/dashboard.png)

![Token 消耗统计](docs/images/token-usage.png)

## 能做什么

| 功能 | 用途 |
| --- | --- |
| Token 与费用统计 | 读取本机 Codex 近 30 天会话，展示每日趋势、模块聚合和费用估算 |
| 提示词管理 | 扫描全局提示词，按需扫描 Skills；追加节约 Token 指令，并保留备份与恢复入口 |
| Skills 管理 | 搜索、收藏、标签、启停、导入、同步、打包和规则安全扫描 |
| AI 资产管理 | 查看本地 CLI、插件、MCP、Agent 和记忆文件 |
| GitHub / Gitee | 收藏管理、仓库转 Skill，以及仓库来源 Skill 的更新检查 |
| 场景复用 | 保存任务场景，关联本地记忆并生成可复用提示词 |
| 本地数据存储 | 选择独立数据目录，迁移或恢复应用配置与收藏 |
| RTK 集成 | 检查安装与集成状态，查看 RTK 的输出缩减统计 |

安全扫描基于规则，可能漏报或误报。导入的 Skill、脚本和 NPX 包仍需自行审查。

## 五分钟上手

1. 安装并打开应用，在“设置”中查看默认模块，或添加自己的 Skills 目录。
2. 在“总览”扫描 Skills，在“我的 Skills”中搜索、收藏和查看内容。
3. 打开“统计”查看 Codex 会话。如果使用自定义 `CODEX_HOME`，请确保启动应用时能读取该环境变量。
4. 在“我的提示词”中选择目标文件，再追加节约 Token 指令；需要恢复时使用页面中的还原入口。
5. 使用 GitHub / Gitee 功能时，在应用内配置自己的账号信息；不需要联网时可开启离线模式。

应用会修改你明确选择的文件或配置。批量处理前建议先用少量测试文件确认效果。

## “省钱”和费用统计的含义

- Token 统计使用随应用安装的 `ccusage`，读取 `CODEX_HOME` 下的本地会话；不要求本应用在会话期间持续运行。
- USD 费用按 ccusage 提供的模型价格估算。自定义人民币费用按每 1K Token 的输入、输出、缓存读取和缓存写入单价分别计算。
- 估算费用不代表订阅账单、实际扣费或剩余额度；结果受会话记录和价格数据完整性影响。
- RTK 的收益针对进入模型上下文的命令输出，其估算值不代表整场会话或账单减少相同比例。
- 本项目不承诺固定节省比例；提示词调整可能改变助手行为，效果需要在实际任务中评估。

## 本地数据与联网范围

应用默认数据目录为用户主目录下的 `.skills-manager`，目录指针为 `.skills-manager-storage.json`。可在“设置 → 本地数据存储”中选择独立目录。

| 操作 | 数据与网络边界 |
| --- | --- |
| Skills、提示词、记忆、MCP 扫描 | 读取本机相关文件；操作日志保存在本地 |
| Codex 统计 | 调用本地 ccusage，使用 `--offline` 读取会话与价格数据 |
| GitHub / Gitee 收藏与仓库功能 | 访问相应平台 API 或 Git 远程；需要认证的操作使用你配置的 Token |
| Git / NPX 导入与更新 | 执行相应本地工具，可能下载仓库或依赖、运行导入包的安装逻辑 |
| RTK 安装与启用 | 由用户触发安装或配置命令，可能访问官方分发渠道和修改 AI 客户端配置 |
| 外部链接 | 交给系统浏览器打开 |

应用账号 Token 当前保存在本地配置文件中，并未进行应用层加密。不要分享整个数据目录；请保护文件访问权限，使用仅满足所需功能的凭据。GitHub/Gitee Token 不会随桌面安装包或源码发布。

离线模式会阻止应用内的远程 Git、GitHub、Gitee 和 NPX 操作；它不能代替操作系统级网络隔离，也不能控制系统浏览器或独立触发的工具安装。

迁移要求目标为空目录；复制与校验成功后切换，原目录保留。恢复会切换到已有数据目录，不合并或覆盖。外部仓库和 AI 客户端自己的文件仍保留在原路径。

## 常见问题

**统计没有数据？** 确认本机存在 Codex 会话日志，并检查 `CODEX_HOME`。无会话和读取失败是不同情况；读取失败时先查看页面错误信息。

**只用浏览器打开页面可以吗？** 浏览器预览仅提供部分页面能力。文件扫描、系统工具和本地配置管理需要 Electron 桌面版。

**为什么新电脑没有之前的收藏？** 收藏、标签、场景和账号配置属于本机数据。重装后可通过“恢复已有数据”重新接入原目录；跨电脑复制前请自行清理账号凭据和私人资料。

**是否需要另外安装 Git、Node.js 或 RTK？** 桌面版基础管理与 Token 统计不要求外部 Node.js。远程 Git 功能需要 Git；NPX 功能需要 Node.js/npm；RTK 功能需要 RTK。独立 CLI 需要 Node.js 22 或更高版本。

## 本地开发

建议使用 Node.js 22 或更高版本，在目标平台重新安装依赖。

```bash
npm ci
npm run dev
```

检查与构建：

```bash
npm run typecheck
npm test
npm run build
```

Windows 安装包：

```bash
npm run dist:win
```

macOS 安装包需要在 Mac 上构建：

```bash
npm ci
npm run dist:mac
```

不要把 Windows 的 `node_modules` 复制到 Mac。安装包默认输出到 `release/electron-builder/`。

## 独立 CLI

```bash
npm ci
npm run cli -- help
npm run cli:release
```

`release/cli/` 是完整 CLI 发布目录。解压 CLI 附件后，在该目录执行 `npm ci --omit=dev --ignore-scripts` 安装运行依赖，再使用 `skills-manager.cmd`（Windows）或 `./skills-manager`（macOS/Linux）。CLI 与桌面端共用本机数据目录。供 AI 使用的说明位于 [skills-manager-cli](skills/skills-manager-cli/SKILL.md)。

## 项目结构

- `electron/`：主进程、IPC、CLI 与本地服务。
- `src/components/`：React 页面与组件。
- `src/shared/`：共享类型和业务函数。
- `public/`：图标与 Token 节约指南。
- `scripts/`：打包与 CLI 分发脚本。
- `.github/workflows/`：检查与平台构建工作流。

## 反馈问题

通过 [Issues](https://github.com/yinyin2568/ai-money-master/issues) 反馈。请提供应用版本、操作系统、复现步骤、预期结果和实际结果；日志、截图和示例文件请先移除 Token、私人路径、提示词正文和会话内容。

版本变更见 [CHANGELOG](CHANGELOG.md)，已执行的发布验证及其范围见 [首版验证记录](docs/release-validation.md)。
