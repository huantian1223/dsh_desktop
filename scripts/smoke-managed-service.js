const path = require('node:path');
const { HarnessService } = require('../src/service-manager');

const rootArgument = process.argv[2];
const port = Number(process.argv[3] || 3098);
if (!rootArgument || !Number.isInteger(port)) {
  console.error('Usage: node scripts/smoke-managed-service.js <managed-root> [port]');
  process.exit(2);
}

const root = path.resolve(rootArgument);
const service = new HarnessService({
  harnessRoot: path.join(root, 'runtime'),
  dataRoot: path.join(root, 'data'),
  nodeRoot: path.join(root, 'node'),
  logRoot: path.join(root, 'logs'),
  port,
});

(async () => {
  try {
    const started = await service.start();
    console.log(`STARTED owned=${started.owned} ready=${await service.isReady()}`);
  } finally {
    const stopped = await service.stop({ forceAfterMs: 3000 });
    console.log(`STOPPED=${stopped} ready=${await service.isReady(300)}`);
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
