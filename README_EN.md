# dsh_desktop

[中文](README.md) | [English](README_EN.md)

A community-built DeepSeek Harness desktop wrapper for Windows. Download a single EXE and run it directly. If Harness is not already available on the computer, the app prepares the required environment automatically on first launch.

> This is an unofficial community project. It is not affiliated with, sponsored by, or endorsed by DeepSeek. DeepSeek Harness is currently a developer preview and future releases may introduce breaking changes.

## Usage

1. Download `DeepSeek Harness Desktop.exe` from GitHub Releases.
2. Double-click the EXE. The first launch requires an internet connection and may take several minutes.
3. Clicking the window's close button hides the window to the system tray and removes it from the taskbar. Click the tray icon to reopen it, or right-click the tray icon and select **Exit** to close both the desktop wrapper and the Harness process it started.

You do not need to install Node.js beforehand. On first launch, the app will:

- download the pinned Windows x64 LTS ZIP from the official Node.js website;
- verify the downloaded file against the official `SHASUMS256.txt`;
- install the pinned official `@deepseek-ai/dsh` package using the included lockfile;
- store the runtime and personal data in the current user's local application data directory.

Pinned versions:

- Node.js `v24.19.0`
- `@deepseek-ai/dsh` `0.1.0-rc.6`

## Data and privacy

Automatically managed files are stored under:

```text
%LOCALAPPDATA%\dsh_desktop\
├─ node\        Node.js runtime
├─ runtime\     Official Harness npm package
├─ data\        User settings, credentials, and sessions
└─ logs\        Installation and runtime logs
```

The repository and release assets do not contain the developer's API keys, sessions, attachments, or workspace data. Never commit your own `data` directory to a public repository.

If a valid official Harness installation exists next to the EXE or under `Documents\DeepSeek Harness`, the app will prefer that installation and its existing data.

## Build

Building requires Windows x64, Node.js, and npm:

```powershell
npm install
npm test
npm run dist
```

The portable executable is generated at `dist\DeepSeek Harness Desktop.exe`. The source repository does not commit `node_modules`, logs, caches, personal data, or EXE files. Executables should be published as GitHub Release assets.

## Security notes

- Downloads use HTTPS and come only from the official Node.js website. The official SHA-256 checksum is verified before extraction.
- The Harness version and transitive dependencies are pinned by `bootstrap/package-lock.json`; they are not automatically upgraded on every launch.
- The desktop wrapper stops only the Harness process it started. It does not terminate an external service already using port `3080`.
- This community build is not signed with a commercial code-signing certificate, so Windows SmartScreen may display an unknown publisher warning.

## License

The desktop wrapper source code is licensed under the [MIT License](LICENSE). Official DeepSeek Harness, Node.js, Electron, and other dependencies retain their respective licenses. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for details.
