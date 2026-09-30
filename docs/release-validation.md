# 0.1.2 发布验证记录

本地验证日期：2026-09-29。平台：Windows x64；Node.js 24.19.0。2026-09-30 补充 GitHub Actions 检查。结果只适用于以下已执行范围。

## 检查范围

- 公开源码与既有 Git 历史的密钥扫描。
- 全量单元测试、类型检查与生产构建。
- Windows NSIS 安装包生成、安装包内容检查。
- 隔离用户目录下的已打包 Electron 应用启动与 IPC。
- 演示 Skill 扫描、提示词追加/还原、Token 样例读取。
- 本地存储迁移/恢复与非空目录拒绝。
- CLI 解压目录的依赖安装与基本命令。
- README 截图、公开源码包与本地产物校验；远程上传后另行核对。

## 结果

| 检查 | 结果 | 证据范围 |
| --- | --- | --- |
| 类型检查 | PASS | `npm run typecheck` |
| 全量测试 | PASS | 15 个测试文件、142 个测试通过 |
| Windows 生产构建与打包 | PASS | `npm run dist:win`；生成 0.1.2 NSIS x64 安装包 |
| Git 历史密钥扫描 | PASS | gitleaks 8.30.1 检查原仓库全部 18 个提交，未检出匹配规则的密钥 |
| 桌面启动 | PASS | 从 NSIS 安装包解出的应用启动，工作目录独立于安装目录 |
| Skills 扫描 | PASS | 真实 preload / IPC 读取隔离目录中的演示 Skill |
| Token 统计 | PASS | 安装包内 ccusage 读取测试会话；总 Token 为 120，缓存读取为 60 |
| 提示词追加与恢复 | PASS | 通过 IPC 追加与恢复，原文件逐字节相同 |
| 界面分项开关 | PASS | 实际选择演示文件，开启后写入规则，关闭后规则移除、原正文保留；尾部空行不作逐字节断言 |
| 数据存储 | PASS | 迁移后读回、恢复后读回；非空迁移目标被拒绝且原文件保留 |
| 页面与截图 | PASS | 实际点击总览/统计/提示词导航；总览和统计截图已人工检查，无 renderer error |
| 独立 CLI | PASS | 空依赖目录执行 `npm ci --omit=dev --ignore-scripts`，隔离用户目录执行 help / settings get / scan |
| 公开源码独立安装 | PASS | 单独快照目录从零执行 `npm ci`，142 个测试和生产构建再次通过 |
| 公开源码密钥扫描 | PASS | gitleaks 8.30.1 扫描公开快照，未检出匹配规则的密钥；专属路径检查无匹配 |
| 远程 Windows 检查 | PASS | 修复测试临时路径别名后，[Check source](https://github.com/yinyin2568/ai-money-master/actions/runs/36678602775) 完成安装、类型检查、144 个测试和构建 |
| 远程 macOS 构建 | PASS | 修复 ccusage 原生二进制执行权限后，[Build macOS Client](https://github.com/yinyin2568/ai-money-master/actions/runs/36678602862) 的 Apple Silicon 与 Intel 任务通过；未进行 Mac 桌面安装与启动验收 |
| 远程源码 | PASS | 通过 GitHub CLI 推送 main；公开文件的远程 Git blob 与本地提交逐项一致，包含完整中英文 README |
| macOS 实际运行 | 未执行 | 提供匹配架构的构建工作流；没有 Mac 实机证据 |

公开快照已完成密钥扫描；本地安装包、CLI 包和源码包已逐项核对 SHA-256，源码包内容与公开清单一致。远程源码已逐项核对；Release 附件的远程大小与 GitHub 提供的 SHA-256 digest 已核对，实际结果记录在该版本的 Release 说明中。历史开发笔记、用户数据、原始截图和旧构建产物不包含在公开快照中。

## 实际限制

- 本机没有 macOS，不把 Windows 的检查视为 Mac 的实际安装验证。
- 隔离用户目录不是新的 Windows 用户或虚拟机；主机仍装有开发工具。
- 安装包解包与应用启动不能证明系统级安装、卸载、签名或兼容性已全部验证。
- 不进行真实账号的收藏写入、第三方 Skill 执行或 NPX 包安装。
- 规则扫描与 gitleaks 不能保证不存在所有安全问题。
