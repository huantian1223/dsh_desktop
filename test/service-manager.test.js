const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const { HarnessService } = require('../src/service-manager');

test('isReady reports an HTTP listener as ready', async () => {
  const server = http.createServer((_request, response) => response.end('ok'));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const service = new HarnessService({ harnessRoot: '.', port, logRoot: '.' });
  assert.equal(await service.isReady(), true);
  await new Promise((resolve) => server.close(resolve));
});

test('isReady reports a closed port as unavailable', async () => {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  const service = new HarnessService({ harnessRoot: '.', port, logRoot: '.' });
  assert.equal(await service.isReady(300), false);
});
