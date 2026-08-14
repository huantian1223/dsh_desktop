const assert = require('node:assert/strict');
const test = require('node:test');
const { NODE_ARCHIVE, parseChecksum } = require('../src/runtime-manager');

test('parseChecksum finds the exact Node.js archive', () => {
  const expected = 'a'.repeat(64);
  const contents = `${'b'.repeat(64)}  other.zip\n${expected}  ${NODE_ARCHIVE}\n`;
  assert.equal(parseChecksum(contents, NODE_ARCHIVE), expected);
});

test('parseChecksum rejects a missing archive', () => {
  assert.throws(() => parseChecksum(`${'a'.repeat(64)}  other.zip`, NODE_ARCHIVE));
});
