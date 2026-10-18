// Checks the built CommonJS bundle. No network.
const assert = require('node:assert/strict');
const { PopNow, APIError, isTerminalState, VERSION } = require('../dist/index.cjs');

assert.equal(typeof PopNow, 'function');
assert.equal(isTerminalState('expired'), true);
const fetch = async () =>
  new Response(JSON.stringify({ code: 200, msg: 'success', data: { total: 0, items: [] }, request_id: 'req_cjs' }), {
    headers: { 'content-type': 'application/json' },
  });
new PopNow({ apiKey: 'sk-popnow-smoke', fetch })
  .models.list()
  .then((list) => {
    assert.equal(list.total, 0);
    assert.equal(typeof APIError, 'function');
    console.log(`CJS smoke test passed (popnow ${VERSION}, node ${process.version})`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
