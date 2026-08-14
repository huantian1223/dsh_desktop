const fs = require('node:fs');
const path = require('node:path');
const {
  app,
  BrowserWindow,
  dialog,
  Menu,
  nativeImage,
  shell,
  Tray,
} = require('electron');
const { HarnessService } = require('./service-manager');
const { RuntimeManager } = require('./runtime-manager');
const { ensureWindowsShortcuts } = require('./windows-integration');

const PORT = 3080;
const UI_URL = `http://127.0.0.1:${PORT}`;
const APP_ID = 'com.deepseek.harness.desktop.shell';

let mainWindow;
let tray;
let service;
let quitting = false;
let quitPromise;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (argv.includes('--quit')) gracefulQuit();
    else showWindow();
  });

  app.whenReady().then(boot).catch(async (error) => {
    await dialog.showMessageBox({
      type: 'error',
      title: 'DeepSeek Harness Desktop',
      message: '桌面壳启动失败',
      detail: error && error.stack ? error.stack : String(error),
    });
    app.exit(1);
  });
}

app.on('window-all-closed', () => {
  // Keep the tray and Harness service alive.
});

app.on('before-quit', (event) => {
  if (quitting || !service || !service.owned) return;
  event.preventDefault();
  gracefulQuit();
});

async function boot() {
  app.setAppUserModelId(APP_ID);
  const desktopRoot = app.getAppPath();
  const iconPath = path.join(desktopRoot, 'assets', 'app.ico');
  const managedRoot = path.join(process.env.LOCALAPPDATA || app.getPath('appData'), 'dsh_desktop');
  const logRoot = path.join(managedRoot, 'logs');

  if (app.isPackaged && process.platform === 'win32') {
    ensureWindowsShortcuts({
      shell,
      appDataPath: app.getPath('appData'),
      executablePath: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath,
      appId: APP_ID,
    });
  }

  createWindow(iconPath);
  createTray(iconPath);

  const existingHarnessRoot = process.env.DSH_DESKTOP_FORCE_MANAGED === '1'
    ? null
    : findHarnessRoot(desktopRoot);
  let runtime;
  if (existingHarnessRoot) {
    runtime = {
      harnessRoot: existingHarnessRoot,
      dataRoot: path.join(existingHarnessRoot, 'data'),
      nodeRoot: null,
    };
  } else {
    const manager = new RuntimeManager({
      root: managedRoot,
      bootstrapRoot: app.isPackaged
        ? path.join(process.resourcesPath, 'bootstrap')
        : path.join(desktopRoot, 'bootstrap'),
      onProgress: (message) => showLoading(message),
    });
    runtime = await manager.ensure();
  }

  service = new HarnessService({
    harnessRoot: runtime.harnessRoot,
    dataRoot: runtime.dataRoot,
    nodeRoot: runtime.nodeRoot,
    port: PORT,
    logRoot,
  });
  service.on('exit', ({ expected }) => {
    if (!expected && !quitting) showServiceStoppedPage();
  });
  await service.start();
  await loadHarness();
}

function createWindow(iconPath) {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    title: 'DeepSeek Harness Desktop',
    icon: iconPath,
    backgroundColor: '#0f1117',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.loadURL(loadingPage('正在启动 DeepSeek Harness…'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    mainWindow.minimize();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(UI_URL)) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });
}

function createTray(iconPath) {
  const image = nativeImage.createFromPath(iconPath);
  tray = new Tray(image);
  tray.setToolTip('DeepSeek Harness Desktop');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '退出', click: gracefulQuit },
  ]));
  tray.on('double-click', showWindow);
  tray.on('click', showWindow);
}

async function loadHarness() {
  await mainWindow.loadURL(UI_URL);
  showWindow();
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function showServiceStoppedPage() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.loadURL(loadingPage('Harness 后台服务已停止。请从托盘菜单选择“重启 Harness”。', true));
  showWindow();
}

function showLoading(message) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.loadURL(loadingPage(message)).catch(() => {});
}

function gracefulQuit() {
  if (quitPromise) return quitPromise;
  quitting = true;

  // Give immediate visual feedback while the owned Harness process shuts down.
  if (tray && !tray.isDestroyed()) tray.destroy();
  tray = null;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
  mainWindow = null;

  quitPromise = (async () => {
    try {
      if (service) await service.stop({ forceAfterMs: 3000 });
    } finally {
      app.quit();
    }
  })();
  return quitPromise;
}

function findHarnessRoot(desktopRoot) {
  const executableDir = path.dirname(process.execPath);
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  const candidates = [
    process.env.DEEPSEEK_HARNESS_ROOT,
    path.join(app.getPath('documents'), 'DeepSeek Harness'),
    path.resolve(desktopRoot, '..'),
    portableDir,
    portableDir && path.resolve(portableDir, '..'),
    portableDir && path.resolve(portableDir, '..', '..'),
    path.resolve(executableDir, '..'),
    path.resolve(executableDir, '..', '..'),
    path.resolve(executableDir, '..', '..', '..'),
  ].filter(Boolean);

  for (const candidate of [...new Set(candidates)]) {
    const dsh = path.join(candidate, 'node_modules', '.bin', 'dsh.cmd');
    const data = path.join(candidate, 'data');
    if (fs.existsSync(dsh) && fs.existsSync(data)) return candidate;
  }

  return null;
}

function loadingPage(message, isError = false) {
  const color = isError ? '#ff6b6b' : '#8da2fb';
  const safeMessage = escapeHtml(message);
  return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
    <html><head><meta charset="utf-8"><style>
      body{margin:0;background:#0f1117;color:#e8eaf0;font-family:Segoe UI,Arial,sans-serif;display:grid;place-items:center;height:100vh}
      main{text-align:center;max-width:720px;padding:40px}
      .mark{width:54px;height:54px;border:5px solid #2a3042;border-top-color:${color};border-radius:50%;margin:0 auto 24px;animation:spin 1s linear infinite}
      p{font-size:18px;line-height:1.6;color:${color}}
      @keyframes spin{to{transform:rotate(360deg)}}
    </style></head><body><main><div class="mark"></div><p>${safeMessage}</p></main></body></html>`)} `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
