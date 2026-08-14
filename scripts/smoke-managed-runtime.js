const path = require('node:path');
const { RuntimeManager } = require('../src/runtime-manager');

const rootArgument = process.argv[2];
if (!rootArgument) {
  console.error('Usage: node scripts/smoke-managed-runtime.js <temporary-root>');
  process.exit(2);
}

const root = path.resolve(rootArgument);
const manager = new RuntimeManager({
  root,
  bootstrapRoot: path.resolve(__dirname, '..', 'bootstrap'),
  onProgress: (message) => console.log(message),
});

manager
  .ensure()
  .then((runtime) => {
    console.log(JSON.stringify(runtime, null, 2));
  })
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
