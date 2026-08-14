const crypto = require('node:crypto');
const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');
const { spawn } = require('node:child_process');

const NODE_VERSION = 'v24.19.0';
const DSH_VERSION = '0.1.0-rc.6';
const NODE_ARCHIVE = `node-${NODE_VERSION}-win-x64.zip`;
const NODE_DIST_URL = `https://nodejs.org/dist/${NODE_VERSION}`;

class RuntimeManager {
  constructor({ root, bootstrapRoot, onProgress = () => {} }) {
    this.root = path.resolve(root);
    this.bootstrapRoot = bootstrapRoot && path.resolve(bootstrapRoot);
    this.onProgress = onProgress;
  }

  get nodeRoot() {
    return path.join(this.root, 'node');
  }

  get nodeCommand() {
    return path.join(this.nodeRoot, 'node.exe');
  }

  get npmCommand() {
    return path.join(this.nodeRoot, 'npm.cmd');
  }

  get harnessRoot() {
    return path.join(this.root, 'runtime');
  }

  get dataRoot() {
    return path.join(this.root, 'data');
  }

  get dshCommand() {
    return path.join(this.harnessRoot, 'node_modules', '.bin', 'dsh.cmd');
  }

  async ensure() {
    fs.mkdirSync(this.root, { recursive: true });
    fs.mkdirSync(this.dataRoot, { recursive: true });

    if (!this.isNodeReady()) await this.installNode();
    if (!this.isHarnessReady()) await this.installHarness();

    return {
      harnessRoot: this.harnessRoot,
      dataRoot: this.dataRoot,
      nodeRoot: this.nodeRoot,
      managed: true,
    };
  }

  isNodeReady() {
    return fs.existsSync(this.nodeCommand) && fs.existsSync(this.npmCommand);
  }

  isHarnessReady() {
    if (!fs.existsSync(this.dshCommand)) return false;
    const packageJson = path.join(this.harnessRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json');
    try {
      return JSON.parse(fs.readFileSync(packageJson, 'utf8')).version === DSH_VERSION;
    } catch {
      return false;
    }
  }

  async installNode() {
    this.onProgress('首次运行：正在下载 Node.js LTS 运行环境…');
    const stagingRoot = path.join(this.root, `.node-install-${process.pid}`);
    const archivePath = path.join(stagingRoot, NODE_ARCHIVE);
    const extractedRoot = path.join(stagingRoot, 'extracted');
    resetDirectory(stagingRoot, this.root);
    fs.mkdirSync(extractedRoot, { recursive: true });

    try {
      const checksums = await downloadText(`${NODE_DIST_URL}/SHASUMS256.txt`);
      const expectedHash = parseChecksum(checksums, NODE_ARCHIVE);
      let lastPercent = -1;
      await downloadFile(`${NODE_DIST_URL}/${NODE_ARCHIVE}`, archivePath, (received, total) => {
        if (!total) return;
        const percent = Math.min(100, Math.floor((received / total) * 100));
        if (percent === lastPercent) return;
        lastPercent = percent;
        this.onProgress(`首次运行：正在下载 Node.js LTS（${percent}%）…`);
      });

      const actualHash = await sha256File(archivePath);
      if (actualHash.toLowerCase() !== expectedHash.toLowerCase()) {
        throw new Error('Node.js 下载文件校验失败，已拒绝安装。');
      }

      this.onProgress('首次运行：正在解压 Node.js LTS…');
      const tarCommand = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
      if (!fs.existsSync(tarCommand)) throw new Error(`Windows 解压工具不存在：${tarCommand}`);
      await runCommand(tarCommand, ['-xf', archivePath, '-C', extractedRoot], {
        windowsHide: true,
        stdio: 'ignore',
      });
      const extractedNodeRoot = path.join(extractedRoot, `node-${NODE_VERSION}-win-x64`);
      if (!fs.existsSync(path.join(extractedNodeRoot, 'node.exe'))) {
        throw new Error('Node.js 压缩包结构异常。');
      }

      removeWithinRoot(this.nodeRoot, this.root);
      fs.renameSync(extractedNodeRoot, this.nodeRoot);
    } finally {
      removeWithinRoot(stagingRoot, this.root);
    }
  }

  async installHarness() {
    this.onProgress('首次运行：正在安装官方 DeepSeek Harness…');
    const stagingRoot = path.join(this.root, `.runtime-install-${process.pid}`);
    resetDirectory(stagingRoot, this.root);
    if (!this.bootstrapRoot) throw new Error('缺少内置的 Harness 依赖锁文件目录。');
    for (const filename of ['package.json', 'package-lock.json']) {
      const source = path.join(this.bootstrapRoot, filename);
      if (!fs.existsSync(source)) throw new Error(`缺少内置文件：bootstrap/${filename}`);
      fs.copyFileSync(source, path.join(stagingRoot, filename));
    }
    const logRoot = path.join(this.root, 'logs');
    fs.mkdirSync(logRoot, { recursive: true });
    const installLog = fs.openSync(path.join(logRoot, 'install.log'), 'a');

    try {
      await runCommand(
        process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe',
        [
          '/d',
          '/c',
          'call',
          this.npmCommand,
          'ci',
          '--prefix',
          stagingRoot,
          '--omit=dev',
          '--no-audit',
          '--no-fund',
          '--loglevel=error',
        ],
        {
          cwd: this.root,
          env: {
            ...process.env,
            Path: `${this.nodeRoot};${process.env.Path || process.env.PATH || ''}`,
            npm_config_cache: path.join(this.root, 'npm-cache'),
          },
          windowsHide: true,
          stdio: ['ignore', installLog, installLog],
        },
      );

      const installedCommand = path.join(stagingRoot, 'node_modules', '.bin', 'dsh.cmd');
      if (!fs.existsSync(installedCommand)) {
        throw new Error('npm 已结束，但没有找到官方 dsh 启动命令。');
      }

      removeWithinRoot(this.harnessRoot, this.root);
      fs.renameSync(stagingRoot, this.harnessRoot);
    } catch (error) {
      removeWithinRoot(stagingRoot, this.root);
      throw new Error(`安装官方 DeepSeek Harness 失败：${error.message}`);
    } finally {
      fs.closeSync(installLog);
    }
  }
}

function parseChecksum(contents, filename) {
  for (const line of String(contents).split(/\r?\n/)) {
    const match = line.trim().match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
    if (match && match[2] === filename) return match[1];
  }
  throw new Error(`Node.js 校验清单中没有 ${filename}。`);
}

function sha256File(filename) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const input = fs.createReadStream(filename);
    input.on('error', reject);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('end', () => resolve(hash.digest('hex')));
  });
}

function downloadText(url) {
  return new Promise((resolve, reject) => {
    request(url, 0, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
        if (body.length > 2 * 1024 * 1024) response.destroy(new Error('响应内容过大。'));
      });
      response.on('end', () => resolve(body));
      response.on('error', reject);
    }, reject);
  });
}

function downloadFile(url, destination, onProgress) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(destination, { flags: 'wx' });
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      output.destroy();
      fs.rmSync(destination, { force: true });
      reject(error);
    };

    output.on('error', fail);
    request(url, 0, (response) => {
      const total = Number(response.headers['content-length']) || 0;
      let received = 0;
      response.on('data', (chunk) => {
        received += chunk.length;
        onProgress(received, total);
      });
      response.on('error', fail);
      response.pipe(output);
      output.on('finish', () => {
        if (settled) return;
        settled = true;
        output.close(resolve);
      });
    }, fail);
  });
}

function request(url, redirectCount, onResponse, onError) {
  https
    .get(url, { headers: { 'User-Agent': 'dsh_desktop-bootstrap/1.0' }, timeout: 30000 }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        if (redirectCount >= 5) return onError(new Error('下载重定向次数过多。'));
        const nextUrl = new URL(response.headers.location, url).toString();
        return request(nextUrl, redirectCount + 1, onResponse, onError);
      }
      if (response.statusCode !== 200) {
        response.resume();
        return onError(new Error(`下载失败，HTTP ${response.statusCode}。`));
      }
      onResponse(response);
    })
    .on('timeout', function onTimeout() {
      this.destroy(new Error('下载连接超时。'));
    })
    .on('error', onError);
}

function runCommand(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`安装进程退出，代码 ${code}。请查看 install.log。`));
    });
  });
}

function resetDirectory(target, root) {
  removeWithinRoot(target, root);
  fs.mkdirSync(target, { recursive: true });
}

function removeWithinRoot(target, root) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (resolvedTarget === resolvedRoot || !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`拒绝清理托管目录之外的路径：${resolvedTarget}`);
  }
  fs.rmSync(resolvedTarget, { recursive: true, force: true });
}

module.exports = {
  DSH_VERSION,
  NODE_ARCHIVE,
  NODE_VERSION,
  RuntimeManager,
  parseChecksum,
};
