const fs = require('node:fs');
const path = require('node:path');

const SHORTCUT_NAME = 'DeepSeek Harness Desktop.lnk';

function normalizeTarget(value) {
  if (!value) return '';
  return path.resolve(value).replaceAll('/', '\\').toLowerCase();
}

function ensureWindowsShortcuts({ shell, appDataPath, executablePath, appId }) {
  const workingDirectory = path.dirname(executablePath);
  const details = {
    target: executablePath,
    cwd: workingDirectory,
    description: 'DeepSeek Harness Desktop',
    icon: executablePath,
    iconIndex: 0,
    appUserModelId: appId,
  };

  try {
    const programsDirectory = path.join(
      appDataPath,
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs',
    );
    fs.mkdirSync(programsDirectory, { recursive: true });
    shell.writeShortcutLink(
      path.join(programsDirectory, SHORTCUT_NAME),
      'replace',
      details,
    );
  } catch {
    // Shortcut integration is best-effort and must never block Harness startup.
  }

  const taskbarDirectory = path.join(
    appDataPath,
    'Microsoft',
    'Internet Explorer',
    'Quick Launch',
    'User Pinned',
    'TaskBar',
  );

  try {
    if (!fs.existsSync(taskbarDirectory)) return;
    for (const entry of fs.readdirSync(taskbarDirectory, { withFileTypes: true })) {
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.lnk') continue;
      const shortcutPath = path.join(taskbarDirectory, entry.name);
      try {
        const existing = shell.readShortcutLink(shortcutPath);
        if (normalizeTarget(existing.target) !== normalizeTarget(executablePath)) continue;
        shell.writeShortcutLink(shortcutPath, 'replace', {
          ...existing,
          ...details,
          args: existing.args || '',
        });
      } catch {
        // Ignore unrelated, malformed, or protected shortcuts.
      }
    }
  } catch {
    // A locked taskbar directory should not prevent the app from starting.
  }
}

module.exports = {
  ensureWindowsShortcuts,
  normalizeTarget,
};
