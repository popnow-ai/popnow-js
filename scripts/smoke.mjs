// Checks the built ESM bundle: imports, a mocked request and webhook verification. No network.
import assert from 'node:assert/strict';
import { PopNow, NotFoundError, verifyWebhook, VERSION } from '../dist/index.js';

const fetch = async (url) =>
  new Response(JSON.stringify({ code: 404, msg: 'Not found', request_id: 'req_smoke' }), {
    status: 404,
    headers: { 'content-type': 'application/json' },
  });
const popnow = new PopNow({ apiKey: 'sk-popnow-smoke', fetch, maxRetries: 0 });
const err = await popnow.jobs.get('job_missing').catch((e) => e);
assert.ok(err instanceof NotFoundError);
assert.equal(err.requestId, 'req_smoke');

const failed = await verifyWebhook({
  payload: '{"data":{"taskId":"job_1"}}',
  headers: { 'x-webhook-timestamp': String(Math.floor(Date.now() / 1000)), 'x-webhook-signature': 'bad' },
  secret: 'secret',
}).catch((e) => e);
assert.equal(failed.name, 'WebhookVerificationError');
console.log(`ESM smoke test passed (popnow ${VERSION}, node ${process.version})`);
