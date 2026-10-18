import { createHash, createHmac, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { WebhookVerificationError, verifyStandardWebhook, verifyWebhook } from '../src/index.js';

const SECRET = 'test-webhook-secret';
const NOW = 1787045531;

// Reference signer written independently with node:crypto, following the docs formula.
function signTaskCallback(raw: string, taskId: string, timestamp: number, secret = SECRET) {
  const digest = createHash('sha256').update(raw).digest('hex');
  return createHmac('sha256', secret).update(`${taskId}.${timestamp}.${digest}`).digest('base64');
}

const body = JSON.stringify({
  code: 200,
  msg: 'success',
  data: { taskId: 'job_01JH8Z', model: 'alibaba/wan-3.0/image-to-video', state: 'succeeded', credits: 34, cost: '0.34', settled: true },
  request_id: 'whd_01JH8Z',
});

describe('verifyWebhook (task callbacks)', () => {
  const headers = {
    'x-webhook-timestamp': String(NOW),
    'x-webhook-signature': signTaskCallback(body, 'job_01JH8Z', NOW),
    'x-webhook-payload-version': '2',
  };

  it('accepts a valid signature from a plain header object', async () => {
    const event = await verifyWebhook({ payload: body, headers, secret: SECRET, now: NOW + 10 });
    expect(event.data.taskId).toBe('job_01JH8Z');
    expect(event.request_id).toBe('whd_01JH8Z');
  });

  it('accepts bytes and a Headers instance with any casing', async () => {
    const h = new Headers({
      'X-Webhook-Timestamp': String(NOW),
      'X-Webhook-Signature': headers['x-webhook-signature'],
    });
    const event = await verifyWebhook({ payload: new TextEncoder().encode(body), headers: h, secret: SECRET, now: NOW });
    expect(event.data.state).toBe('succeeded');
  });

  it('rejects a tampered body, a wrong secret and a stale timestamp', async () => {
    const tampered = body.replace('"credits":34', '"credits":0');
    await expect(verifyWebhook({ payload: tampered, headers, secret: SECRET, now: NOW })).rejects.toBeInstanceOf(WebhookVerificationError);
    await expect(verifyWebhook({ payload: body, headers, secret: 'other', now: NOW })).rejects.toThrow(/Signature/);
    await expect(verifyWebhook({ payload: body, headers, secret: SECRET, now: NOW + 301 })).rejects.toThrow(/tolerance/);
    await expect(verifyWebhook({ payload: body, headers: { ...headers, 'x-webhook-timestamp': 'abc' }, secret: SECRET, now: NOW })).rejects.toThrow(/timestamp/);
  });

  it('rejects a re-serialised body (key order changes the hash)', async () => {
    const reordered = JSON.stringify({ request_id: 'whd_01JH8Z', ...JSON.parse(body) });
    await expect(verifyWebhook({ payload: reordered, headers, secret: SECRET, now: NOW })).rejects.toBeInstanceOf(WebhookVerificationError);
  });

  it('reads the top-level task_id for payload version 1', async () => {
    const v1 = JSON.stringify({ task_id: 'job_legacy', status: 'succeeded' });
    const event = await verifyWebhook({
      payload: v1,
      headers: { 'x-webhook-timestamp': String(NOW), 'x-webhook-signature': signTaskCallback(v1, 'job_legacy', NOW), 'x-webhook-payload-version': '1' },
      secret: SECRET,
      now: NOW,
    });
    expect((event as unknown as { task_id: string }).task_id).toBe('job_legacy');
  });
});

describe('verifyStandardWebhook (account endpoints)', () => {
  const key = randomBytes(24);
  const secret = `whsec_${key.toString('base64')}`;
  const id = 'msg_01k3m8x9q2z4v7n5p6r8s0t1w3';
  const event = JSON.stringify({ type: 'task.succeeded', timestamp: '2026-10-16T09:00:00Z', data: { object: { taskId: 'job_1', state: 'succeeded' } } });
  const sign = (k: Buffer) => createHmac('sha256', k).update(`${id}.${NOW}.${event}`).digest('base64');

  it('accepts a valid v1 signature', async () => {
    const result = await verifyStandardWebhook({
      payload: event,
      headers: { 'webhook-id': id, 'webhook-timestamp': String(NOW), 'webhook-signature': `v1,${sign(key)}` },
      secret,
      now: NOW,
    });
    expect(result.type).toBe('task.succeeded');
    expect(result.data.object.taskId).toBe('job_1');
  });

  it('accepts either signature during a rotation', async () => {
    const oldKey = randomBytes(24);
    const result = await verifyStandardWebhook({
      payload: event,
      headers: { 'webhook-id': id, 'webhook-timestamp': String(NOW), 'webhook-signature': `v1,${sign(oldKey)} v1,${sign(key)}` },
      secret,
      now: NOW,
    });
    expect(result.data.object.state).toBe('succeeded');
  });

  it('rejects a wrong signature or missing headers', async () => {
    await expect(
      verifyStandardWebhook({
        payload: event,
        headers: { 'webhook-id': id, 'webhook-timestamp': String(NOW), 'webhook-signature': `v1,${sign(randomBytes(24))}` },
        secret,
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(WebhookVerificationError);
    await expect(verifyStandardWebhook({ payload: event, headers: {}, secret, now: NOW })).rejects.toBeInstanceOf(WebhookVerificationError);
  });
});
