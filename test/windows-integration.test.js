const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  ensureWindowsShortcuts,
  normalizeTarget,
} = require('../src/windows-integration');

test('normalizeTarget compares Windows paths without case sensitivity', () => {
  assert.equal(
    normalizeTarget('C:\\Apps\\DeepSeek Harness Desktop.exe'),
    normalizeTarget('c:/apps/DeepSeek Harness Desktop.exe'),
  );
});

test('ensureWindowsShortcuts creates Start Menu identity and repairs matching pin', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-shortcuts-'));
  try {
    const taskbarDirectory = path.join(
      root,
      'Microsoft',
      'Internet Explorer',
      'Quick Launch',
      'User Pinned',
      'TaskBar',
    );
    fs.mkdirSync(taskbarDirectory, { recursive: true });
    const matching = path.join(taskbarDirectory, 'matching.lnk');
    const unrelated = path.join(taskbarDirectory, 'unrelated.lnk');
    fs.writeFileSync(matching, '');
    fs.writeFileSync(unrelated, '');

    const executablePath = 'C:\\Apps\\DeepSeek Harness Desktop.exe';
    const writes = [];
    const fakeShell = {
      readShortcutLink(shortcutPath) {
        return {
          target: shortcutPath === matching ? executablePath : 'C:\\Other\\App.exe',
          args: '',
        };
      },
      writeShortcutLink(shortcutPath, operation, details) {
        writes.push({ shortcutPath, operation, details });
        return true;
      },
    };

    ensureWindowsShortcuts({
      shell: fakeShell,
      appDataPath: root,
      executablePath,
      appId: 'com.deepseek.harness.desktop.shell',
    });

    assert.equal(writes.length, 2);
    assert.equal(path.basename(writes[0].shortcutPath), 'DeepSeek Harness Desktop.lnk');
    assert.equal(writes[0].details.appUserModelId, 'com.deepseek.harness.desktop.shell');
    assert.equal(writes[1].shortcutPath, matching);
    assert.equal(writes[1].details.target, executablePath);
    assert.equal(writes[1].details.appUserModelId, 'com.deepseek.harness.desktop.shell');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
