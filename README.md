# dsh_desktop

面向 Windows 的 DeepSeek Harness 社区桌面壳。下载一个 EXE 后双击运行；如果电脑上没有 Harness，首次启动会自动准备所需环境。

> 非官方社区项目，与 DeepSeek 无隶属、赞助或背书关系。DeepSeek Harness 当前仍处于 developer preview，后续版本可能产生不兼容变化。

## 使用方法

1. 从 GitHub Releases 下载 `DeepSeek Harness Desktop.exe`。
2. 双击运行。首次启动需要联网，并可能耗时数分钟。
3. 关闭窗口后程序会留在系统托盘；单击托盘图标重新打开，右键选择“退出”可同时关闭桌面壳及其启动的 Harness。

无需预先安装 Node.js。首次运行会：

- 从 Node.js 官方站下载固定的 Windows x64 LTS ZIP；
- 根据官方 `SHASUMS256.txt` 校验下载文件；
- 使用锁文件安装固定版本的官方 `@deepseek-ai/dsh`；
- 把运行环境和个人数据保存在当前用户的本地应用数据目录。

当前固定版本：

- Node.js `v24.19.0`
- `@deepseek-ai/dsh` `0.1.0-rc.6`

## 数据与隐私

自动管理的文件位于：

```text
%LOCALAPPDATA%\dsh_desktop\
├─ node\        Node.js 运行时
├─ runtime\     官方 Harness npm 包
├─ data\        用户设置、凭据和会话
└─ logs\        安装及运行日志
```

仓库和发行版不会包含开发者的 API 密钥、会话、附件或工作区数据。请勿把自己的 `data` 目录提交到公开仓库。

如果 EXE 附近或“文档\\DeepSeek Harness”中已经存在有效的官方 Harness 安装，本程序会优先使用该安装及其现有数据。

## 构建

需要 Windows x64、Node.js 和 npm：

```powershell
npm install
npm test
npm run dist
```

生成的便携版位于 `dist\DeepSeek Harness Desktop.exe`。源码仓库不提交 `node_modules`、日志、缓存、个人数据或 EXE；可执行文件应作为 GitHub Release 附件发布。

## 安全说明

- 下载仅通过 HTTPS 访问 Node.js 官方站点，并验证官方 SHA-256。
- Harness 版本和传递依赖由 `bootstrap/package-lock.json` 固定，不会在每次启动时自动升级。
- 桌面壳只会结束由自身启动的 Harness 进程，不会结束占用 `3080` 端口的外部服务。
- 当前社区构建没有商业代码签名证书，Windows SmartScreen 可能显示未知发布者提示。

## 图标来源

- Harness 官方页面：<https://www.deepseek.com/harness/>
- 官方 SVG：<https://www.deepseek.com/harness/favicon.svg>

`assets/harness-official-original.svg` 和 `assets/harness-official-original.ico` 是官网原件；应用图标使用官方 SVG 中定义的深色模式白色版本。品牌归其权利人所有。

## 许可证

桌面壳源码采用 [MIT License](LICENSE)。官方 DeepSeek Harness、Node.js、Electron 及其他依赖保留各自许可证，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
