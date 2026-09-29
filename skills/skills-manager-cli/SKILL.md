---
name: skills-manager-cli
description: Use this skill to operate AI Money Master through its local skills-manager CLI: scan Skills, manage modules, run security scans, package Skills, and manage GitHub/Gitee repositories.
---

# AI省钱大师 CLI

使用已安装的本机 CLI，不依赖作者电脑的路径。先定位用户提供的 CLI 发布目录；如果位置未知，询问安装位置，不递归搜索整个磁盘。

## 安装与调用

CLI 需要 Node.js 22 或更高版本。完整发布目录应包含 `package.json`、`package-lock.json`、`dist-electron/` 和命令启动器。解压后在该目录安装运行依赖：

```bash
npm ci --omit=dev --ignore-scripts
```

Windows：

```powershell
.\skills-manager.cmd help
.\skills-manager.cmd settings get
.\skills-manager.cmd scan
```

macOS / Linux：

```bash
./skills-manager help
./skills-manager settings get
./skills-manager scan
```

从源码开发目录调用时：

```bash
npm run cli -- help
```

## 使用原则

- 先执行 `settings get` 查看离线模式。离线模式开启时，不执行远程搜索、同步、加星、收藏、远程 Git 或 NPX 导入。
- 操作参数以当前版本的 `help` 为准。Windows 使用 `skills-manager.cmd`，其他平台使用 `./skills-manager`。
- 不在回复、日志或共享文件中输出 Token、密码或其他密钥。
- 删除、同步、打包的目标必须来自已配置模块或用户明确指定的路径。
- 扫描和查询优先；写入操作应在用户已授权的目标范围内执行，并读回结果。
- CLI 默认输出 JSON；面向用户只总结关键字段和必要路径。
- 打包前检查 Skill 中是否包含私人记忆、账号、内部地址或凭据，不能把整个应用数据目录作为分享附件。

## 常用命令

以下示例在 Windows 的 CLI 目录中执行。示例路径需要替换为用户自己的路径。

```powershell
.\skills-manager.cmd settings get
.\skills-manager.cmd settings offline --enabled true
.\skills-manager.cmd directories
.\skills-manager.cmd scan
.\skills-manager.cmd module create --mode local --name 示例模块 --path C:\AI\skills
.\skills-manager.cmd skill read --path C:\AI\skills\demo
```

安全检查、打包、GitHub/Gitee 操作与模块同步的参数，请先读取 `help`，不要根据旧版本文档猜测。

桌面端与 CLI 共享当前用户的 `.skills-manager` 数据目录，或 `.skills-manager-storage.json` 指向的自定义目录。账号配置保存在用户自己的数据目录中；分享程序目录前仍需确认没有混入本地数据。
