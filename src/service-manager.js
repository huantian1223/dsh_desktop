const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');

class HarnessService extends EventEmitter {
  constructor({ harnessRoot, dataRoot = path.join(harnessRoot, 'data'), nodeRoot, port = 3080, logRoot }) {
    super();
    this.harnessRoot = harnessRoot;
    this.port = port;
    this.logRoot = logRoot;
    this.dataRoot = dataRoot;
    this.nodeRoot = nodeRoot;
    this.child = null;
    this.owned = false;
    this.stopping = false;
  }

  get dshCommand() {
    return path.join(this.harnessRoot, 'node_modules', '.bin', 'dsh.cmd');
  }

  get dshScript() {
    return path.join(this.harnessRoot, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  }

  get nodeCommand() {
    return this.nodeRoot && path.join(this.nodeRoot, 'node.exe');
  }

  validate() {
    if (this.nodeRoot && !fs.existsSync(this.nodeCommand)) {
      throw new Error(`未找到托管 Node.js：${this.nodeCommand}`);
    }
    const entrypoint = this.nodeRoot ? this.dshScript : this.dshCommand;
    if (!fs.existsSync(entrypoint)) {
      throw new Error(`未找到官方 Harness 启动入口：${entrypoint}`);
    }
    if (!fs.existsSync(this.dataRoot)) {
      throw new Error(`未找到 Harness 数据目录：${this.dataRoot}`);
    }
  }

  async isReady(timeoutMs = 1500) {
    return new Promise((resolve) => {
      const request = http.get(
        {
          hostname: '127.0.0.1',
          port: this.port,
          path: '/',
          timeout: timeoutMs,
        },
        (response) => {
          response.resume();
          resolve(response.statusCode >= 200 && response.statusCode < 500);
        },
      );
      request.on('timeout', () => {
        request.destroy();
        resolve(false);
      });
      request.on('error', () => resolve(false));
    });
  }

  async start() {
    this.validate();

    if (await this.isReady()) {
      this.owned = false;
      return { owned: false, existing: true };
    }

    if (this.child && this.child.exitCode === null) {
      await this.waitUntilReady();
      return { owned: true, existing: false };
    }

    fs.mkdirSync(this.logRoot, { recursive: true });
    const stdout = fs.openSync(path.join(this.logRoot, 'harness.stdout.log'), 'a');
    const stderr = fs.openSync(path.join(this.logRoot, 'harness.stderr.log'), 'a');

    this.stopping = false;
    const command = this.nodeRoot
      ? this.nodeCommand
      : process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';
    const args = this.nodeRoot
      ? [this.dshScript, 'web', '--port', String(this.port)]
      : ['/d', '/c', 'call', this.dshCommand, 'web', '--port', String(this.port)];
    this.child = spawn(
      command,
      args,
      {
      cwd: this.harnessRoot,
      env: {
        ...process.env,
        DSH_HOME: this.dataRoot,
        Path: this.nodeRoot
          ? `${this.nodeRoot};${process.env.Path || process.env.PATH || ''}`
          : process.env.Path || process.env.PATH,
      },
      windowsHide: true,
      stdio: ['ignore', stdout, stderr],
      },
    );
    fs.closeSync(stdout);
    fs.closeSync(stderr);
    this.owned = true;

    this.child.once('exit', (code, signal) => {
      const expected = this.stopping;
      this.child = null;
      this.owned = false;
      this.emit('exit', { code, signal, expected });
    });

    await this.waitUntilReady();
    return { owned: true, existing: false };
  }

  async waitUntilReady(timeoutMs = 120000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.isReady()) return;
      if (!this.child || this.child.exitCode !== null) {
        throw new Error('Harness 在 Web UI 就绪前退出，请查看桌面壳 logs 目录。');
      }
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
    throw new Error('等待 Harness Web UI 超时，请查看桌面壳 logs 目录。');
  }

  async stop({ forceAfterMs = 7000 } = {}) {
    if (!this.owned || !this.child) return false;

    this.stopping = true;
    const pid = this.child.pid;
    await runTaskkill(pid, false);

    const deadline = Date.now() + forceAfterMs;
    while (Date.now() < deadline) {
      if (!(await this.isReady(500))) return true;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    await runTaskkill(pid, true);
    return true;
  }

  async restart() {
    if (!this.owned && (await this.isReady())) {
      throw new Error('当前 3080 服务不是由桌面壳启动，无法安全重启。');
    }
    await this.stop();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return this.start();
  }
}

function runTaskkill(pid, force) {
  return new Promise((resolve) => {
    const args = ['/PID', String(pid), '/T'];
    if (force) args.push('/F');
    execFile('taskkill.exe', args, { windowsHide: true }, () => resolve());
  });
}

module.exports = { HarnessService };
