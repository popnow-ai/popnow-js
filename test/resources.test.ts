import { describe, expect, it } from 'vitest';
import { APIError, PopNowError, TaskFailedError, WaitTimeoutError, isTaskDone, isTaskRecord } from '../src/index.js';
import { client, envelope, mockFetch, taskRecord } from './helpers.js';

const accepted = { taskId: 'job_1', state: 'queued', estimatedCost: '0.225', estimatedCostUsd: '0.225', deadlineAt: '2099-01-01T00:00:00Z' };

describe('models', () => {
  it('lists with filters and gets a model with slashes in its id', async () => {
    const usd = { unit: 'per_second', perUnit: '0.045', currency: 'USD', rules: [{ when: { resolution: '1080p' }, perUnit: '0.09' }] };
    const { fetch, calls } = mockFetch(
      envelope({ total: 1, items: [{ model: 'alibaba/wan-3.0/image-to-video', usd }] }),
      envelope({ model: 'alibaba/wan-3.0/image-to-video', usd }),
    );
    const popnow = client(fetch);
    const list = await popnow.models.list({ modality: 'video', includeSchema: true, search: undefined });
    expect(list.items[0]!.model).toBe('alibaba/wan-3.0/image-to-video');
    expect(list.items[0]!.usd.perUnit).toBe('0.045');
    expect(list.items[0]!.usd.rules?.[0]?.perUnit).toBe('0.09');
    expect(calls[0]!.url).toBe('https://api.popnow.ai/api/v1/models?modality=video&includeSchema=true');

    await popnow.models.get('alibaba/wan-3.0/image-to-video');
    expect(calls[1]!.url).toBe('https://api.popnow.ai/api/v1/models/alibaba/wan-3.0/image-to-video');
  });
});

describe('jobs', () => {
  const params = { model: 'alibaba/wan-3.0/image-to-video', input: { prompt: 'waves' } };

  const quoted = {
    quoteId: 'q_1',
    model: 'alibaba/wan-3.0/image-to-video',
    maxChargeUsd: '0.067500001',
    expectedChargeUsd: '0.045',
    maxCharge: '0.067500001',
    estimatedCost: '0.067500001',
    expectedCharge: '0.045',
    currency: 'USD',
    quantity: '5',
    unit: 'per_second',
    expiresAt: '2099-01-01T00:05:00Z',
  };

  it('quotes with the createTask body', async () => {
    const { fetch, calls } = mockFetch(envelope(quoted));
    const quote = await client(fetch).jobs.quote(params);
    expect(quote.maxChargeUsd).toBe('0.067500001');
    expect(quote.expectedChargeUsd).toBe('0.045');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe('https://api.popnow.ai/api/v1/jobs/quote');
    expect(calls[0]!.body).toEqual(params);
  });

  it('confirms a quote with quoteId and expectedCostUsd, keeping every digit', async () => {
    const { fetch, calls } = mockFetch(envelope(quoted), envelope(accepted, { status: 202 }));
    const popnow = client(fetch);
    const quote = await popnow.jobs.quote(params);
    const created = await popnow.jobs.create({ ...params, quoteId: quote.quoteId, expectedCostUsd: quote.maxChargeUsd });
    if (isTaskRecord(created)) throw new Error('expected the acceptance response');
    expect(created.estimatedCostUsd).toBe('0.225');
    expect(calls[1]!.body).toEqual({ ...params, quoteId: 'q_1', expectedCostUsd: '0.067500001' });
    // The raw JSON carries the amount as a string, never a float.
    expect(JSON.stringify(calls[1]!.body)).toContain('"expectedCostUsd":"0.067500001"');
  });

  it('creates a task with idempotency, retention and wait', async () => {
    const { fetch, calls } = mockFetch(envelope(accepted, { status: 202 }));
    const created = await client(fetch).jobs.create(
      { ...params, callBackUrl: 'https://example.com/hook' },
      { idempotencyKey: 'order-1', retention: 3600, wait: 90 },
    );
    expect(created.taskId).toBe('job_1');
    const call = calls[0]!;
    expect(call.url).toBe('https://api.popnow.ai/api/v1/jobs/createTask?wait=60');
    expect(call.headers['idempotency-key']).toBe('order-1');
    expect(call.headers['x-popnow-retention']).toBe('3600');
    expect(call.headers['content-type']).toBe('application/json');
    expect(call.body).toEqual({ ...params, callBackUrl: 'https://example.com/hook' });
  });

  it('generates an idempotency key when none is given', async () => {
    const { fetch, calls } = mockFetch(envelope(accepted, { status: 202 }), envelope(accepted, { status: 202 }));
    const popnow = client(fetch);
    await popnow.jobs.create(params);
    await popnow.jobs.create(params);
    const [a, b] = calls.map((c) => c.headers['idempotency-key']);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(a).not.toBe(b);
  });

  it('gets, lists, retries and purges', async () => {
    const { fetch, calls } = mockFetch(
      envelope(taskRecord()),
      envelope({ items: [], hasMore: false }),
      envelope({ ...accepted, taskId: 'job_2', sourceTaskId: 'job_1' }),
      envelope({ taskId: 'job_1', contentState: 'purged', billingRetained: true, mediaDeletionPending: true }),
    );
    const popnow = client(fetch);
    expect((await popnow.jobs.get('job_1')).state).toBe('succeeded');
    expect(calls[0]!.url).toBe('https://api.popnow.ai/api/v1/jobs/recordInfo?taskId=job_1');

    await popnow.jobs.list({ state: 'failed', from: '2026-10-01', limit: 50 });
    expect(calls[1]!.url).toBe('https://api.popnow.ai/api/v1/jobs?state=failed&from=2026-10-01&limit=50');

    const retried = await popnow.jobs.retry('job_1', { idempotencyKey: 'retry-1' });
    expect(retried.sourceTaskId).toBe('job_1');
    expect(calls[2]!.body).toEqual({ taskId: 'job_1' });
    expect(calls[2]!.headers['idempotency-key']).toBe('retry-1');

    const purged = await popnow.jobs.purge('job_1');
    expect(purged.billingRetained).toBe(true);
    expect(calls[3]!.headers['idempotency-key']).toBeUndefined();
  });

  it('iterates every page with listAll', async () => {
    const { fetch, calls } = mockFetch(
      envelope({ items: [{ taskId: 'a' }, { taskId: 'b' }], hasMore: true, nextCursor: 'c1' }),
      envelope({ items: [{ taskId: 'c' }], hasMore: false }),
    );
    const ids: string[] = [];
    for await (const item of client(fetch).jobs.listAll({ model: 'm' })) ids.push(item.taskId);
    expect(ids).toEqual(['a', 'b', 'c']);
    expect(calls[1]!.url).toContain('cursor=c1');
    expect(calls[1]!.url).toContain('model=m');
  });

  it('waits with backoff until the task is final and its files are ready', async () => {
    const { fetch, calls } = mockFetch(
      envelope(taskRecord({ state: 'queued', output: undefined })),
      envelope(taskRecord({ state: 'running', output: undefined })),
      envelope(taskRecord({ output: { assets: [{ pending: true }] } })),
      envelope(taskRecord()),
    );
    const seen: string[] = [];
    const task = await client(fetch).jobs.wait('job_1', { pollInterval: 1, onPoll: (t) => seen.push(t.state) });
    expect(task.output?.assets?.[0]?.url).toBe('https://example.com/a.png');
    expect(calls).toHaveLength(4);
    expect(seen).toEqual(['queued', 'running', 'succeeded', 'succeeded']);
  });

  it('returns failed tasks, or throws TaskFailedError when asked', async () => {
    const failed = taskRecord({ state: 'failed', errorCode: 'content_rejected', errorMessage: 'Declined', output: undefined });
    const a = mockFetch(envelope(failed));
    expect((await client(a.fetch).jobs.wait('job_1')).errorCode).toBe('content_rejected');

    const b = mockFetch(envelope(failed));
    const err = await client(b.fetch).jobs.wait('job_1', { throwOnFailure: true }).catch((e) => e);
    expect(err).toBeInstanceOf(TaskFailedError);
    expect(err.errorCode).toBe('content_rejected');
  });

  it('gives up with WaitTimeoutError after the budget', async () => {
    const running = envelope(taskRecord({ state: 'running', output: undefined }));
    const { fetch } = mockFetch(running, running, running, running, running, running, running, running);
    const err = await client(fetch).jobs.wait('job_1', { timeout: 30, pollInterval: 10 }).catch((e) => e);
    expect(err).toBeInstanceOf(WaitTimeoutError);
    expect(err.task.state).toBe('running');
  });

  it('createAndWait returns the record from wait=60 without polling', async () => {
    const { fetch, calls } = mockFetch(envelope(taskRecord()));
    const task = await client(fetch).jobs.createAndWait(params);
    expect(task.state).toBe('succeeded');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain('wait=60');
  });

  it('createAndWait falls back to polling after a 202', async () => {
    const { fetch, calls } = mockFetch(envelope(accepted, { status: 202 }), envelope(taskRecord()));
    const task = await client(fetch).jobs.createAndWait(params, { wait: 0, pollInterval: 1 });
    expect(task.taskId).toBe('job_1');
    expect(calls[0]!.url).not.toContain('wait=');
    expect(calls[1]!.url).toContain('recordInfo?taskId=job_1');
  });

  it('isTaskDone treats unknown states as not final', () => {
    expect(isTaskDone({ state: 'succeeded' })).toBe(true);
    expect(isTaskDone({ state: 'something_new' as never })).toBe(false);
  });
});

describe('files', () => {
  const ticket = {
    fileId: 'fil_1',
    key: 'popnow://f/fil_1',
    uploadUrl: 'https://uploads.example.com/put?sig=1',
    method: 'PUT',
    headers: { 'Content-Type': 'image/png', 'Content-Length': '8' },
    expiresAt: '2026-10-17T09:00:00Z',
    maxBytes: 10485760,
  };
  const committed = { fileId: 'fil_1', status: 'ready', uri: 'popnow://f/fil_1', bytes: 8, contentType: 'image/png' };
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  it('uploads bytes: ticket, PUT without the API key, commit', async () => {
    const { fetch, calls } = mockFetch(envelope(ticket), () => new Response(null, { status: 200 }), envelope(committed));
    const file = await client(fetch).files.upload(png);
    expect(file.uri).toBe('popnow://f/fil_1');

    expect(calls[0]!.url).toBe('https://api.popnow.ai/api/v1/common/upload-url');
    expect(calls[0]!.body).toEqual({ contentType: 'image/png', bytes: 8 });

    expect(calls[1]!.url).toBe(ticket.uploadUrl);
    expect(calls[1]!.method).toBe('PUT');
    expect(calls[1]!.headers.authorization).toBeUndefined();
    expect(calls[1]!.headers['content-type']).toBe('image/png');
    expect(calls[1]!.headers['content-length']).toBeUndefined();
    expect(calls[1]!.body).toBe(png);

    expect(calls[2]!.url).toBe('https://api.popnow.ai/api/v1/files/fil_1/commit');
    expect(calls[2]!.method).toBe('POST');
  });

  it('uses a Blob type and an explicit contentType', async () => {
    const a = mockFetch(envelope(ticket), () => new Response(null), envelope(committed));
    await client(a.fetch).files.upload(new Blob([new Uint8Array(5)], { type: 'video/mp4' }));
    expect(a.calls[0]!.body).toEqual({ contentType: 'video/mp4', bytes: 5 });

    const b = mockFetch(envelope(ticket), () => new Response(null), envelope(committed));
    await client(b.fetch).files.upload(new Uint8Array(3).buffer, { contentType: 'application/octet-stream' });
    expect(b.calls[0]!.body).toEqual({ contentType: 'application/octet-stream', bytes: 3 });
  });

  it('refuses unknown media without a contentType', async () => {
    const { fetch } = mockFetch();
    await expect(client(fetch).files.upload(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(PopNowError);
  });

  it('reports a failed PUT', async () => {
    const { fetch } = mockFetch(envelope(ticket), () => new Response('SignatureDoesNotMatch', { status: 403 }));
    const err = await client(fetch).files.upload(png).catch((e) => e);
    expect(err).toBeInstanceOf(APIError);
    expect(err.status).toBe(403);
  });

  it('imports a LoRA and mints a download URL', async () => {
    const { fetch, calls } = mockFetch(envelope(committed), envelope({ key: 'out_0', url: 'https://x', expiresAt: 'y' }));
    const popnow = client(fetch);
    await popnow.files.import({ url: 'owner/repo', token: 'hf_x' });
    expect(calls[0]!.url).toBe('https://api.popnow.ai/api/v1/files/import');
    expect(calls[0]!.body).toEqual({ url: 'owner/repo', token: 'hf_x' });
    const link = await popnow.files.downloadUrl({ taskId: 'job_1' });
    expect(link.url).toBe('https://x');
    expect(calls[1]!.url).toBe('https://api.popnow.ai/api/v1/common/download-url');
  });
});

describe('assets', () => {
  it('creates with a required idempotency key and manages assets', async () => {
    const asset = { id: 'ast_1', uri: 'popnow://a/ast_1', name: 'Hero shot' };
    const { fetch, calls } = mockFetch(
      envelope(asset),
      envelope({ items: [asset] }),
      envelope(asset),
      envelope({ ...asset, name: 'New' }),
      envelope({ id: 'ast_1', deleted: true }),
      envelope({ full: false }),
    );
    const popnow = client(fetch);
    await popnow.assets.create({ source: 'task_output', taskId: 'job_1', index: 0, name: 'Hero shot' });
    expect(calls[0]!.headers['idempotency-key']).toBeTruthy();
    expect(calls[0]!.body).toEqual({ source: 'task_output', taskId: 'job_1', index: 0, name: 'Hero shot' });

    await popnow.assets.list({ kind: 'image', source: ['upload', 'url'], favorite: true });
    expect(calls[1]!.url).toBe('https://api.popnow.ai/api/v1/assets?kind=image&source=upload%2Curl&favorite=true');

    await popnow.assets.get('ast_1');
    expect(calls[2]!.url).toBe('https://api.popnow.ai/api/v1/assets/ast_1');

    await popnow.assets.update('ast_1', { name: 'New' });
    expect(calls[3]!.method).toBe('PATCH');
    expect(calls[3]!.body).toEqual({ name: 'New' });

    expect((await popnow.assets.delete('ast_1')).deleted).toBe(true);
    expect(calls[4]!.method).toBe('DELETE');

    await popnow.assets.usage();
    expect(calls[5]!.url).toBe('https://api.popnow.ai/api/v1/assets/usage');
  });

  it('reads characters', async () => {
    const { fetch, calls } = mockFetch(envelope({ items: [] }), envelope({ id: 'ent_1', kind: 'character' }));
    const popnow = client(fetch);
    await popnow.assets.characters.list({ limit: 10 });
    expect(calls[0]!.url).toBe('https://api.popnow.ai/api/v1/assets/entities?kind=character&limit=10');
    await popnow.assets.characters.get('ent_1');
    expect(calls[1]!.url).toBe('https://api.popnow.ai/api/v1/assets/entities/ent_1');
  });
});

describe('account', () => {
  it('reads the USD balance and usage', async () => {
    const { fetch, calls } = mockFetch(
      envelope({
        availableUsd: '12.000000005',
        heldUsd: '0.034',
        totalUsd: '12.034000005',
        available: '12.000000005',
        held: '0.034',
        total: '12.034000005',
      }),
      envelope({
        from: '2026-10-01',
        to: '2026-10-16',
        currency: 'USD',
        totalCalls: 3,
        totalSpend: '0.099',
        days: [{ day: '2026-10-02', calls: 3, succeeded: 3, failed: 0, spend: '0.099' }],
        models: [],
      }),
    );
    const popnow = client(fetch);
    const balance = await popnow.account.balance();
    expect(balance.availableUsd).toBe('12.000000005');
    expect(balance.heldUsd).toBe('0.034');
    expect(balance.totalUsd).toBe('12.034000005');
    expect(calls[0]!.url).toBe('https://api.popnow.ai/api/v1/chat/credit');
    const usage = await popnow.account.usage({ from: '2026-10-01', to: '2026-10-16' });
    expect(usage.totalSpend).toBe('0.099');
    expect(usage.days[0]!.spend).toBe('0.099');
    expect(calls[1]!.url).toBe('https://api.popnow.ai/api/v1/usage?from=2026-10-01&to=2026-10-16');
  });
});

describe('deprecated credit fields', () => {
  it('still parses and sends the legacy credit fields', async () => {
    const { fetch, calls } = mockFetch(
      envelope({ quoteId: 'q_1', maxCredits: 68, expectedCredits: 45, maxCharge: '0.068', estimatedCost: '0.068' }),
      envelope({ taskId: 'job_1', state: 'queued', estimatedCost: '0.068', estimatedCredits: 68, deadlineAt: '2099-01-01T00:00:00Z' }, { status: 202 }),
      envelope(taskRecord({ credits: 10, exactCredits: '10' })),
      envelope({ items: [{ taskId: 'job_1', cost: '0.01', credits: 10, exactCredits: '10' }], hasMore: false }),
      envelope({ availableCredits: 1200, heldCredits: 34, totalCredits: 1234, available: '1.2', held: '0.034', total: '1.234' }),
      envelope({ totalCredits: 99, days: [{ day: '2026-10-02', credits: 99 }], models: [{ model: 'm', credits: 99 }] }),
      envelope({ model: 'alibaba/z-image-turbo/text-to-image', credits: { unit: 'per_image', perUnit: 10 } }),
    );
    const popnow = client(fetch);
    const params = { model: 'alibaba/z-image-turbo/text-to-image', input: { prompt: 'fox' } };

    const quote = await popnow.jobs.quote(params);
    expect(quote.maxCredits).toBe(68);
    expect(quote.expectedCredits).toBe(45);

    const created = await popnow.jobs.create({ ...params, quoteId: quote.quoteId, expectedCredits: quote.maxCredits, expectedCost: quote.maxCharge });
    if (isTaskRecord(created)) throw new Error('expected the acceptance response');
    expect(created.estimatedCredits).toBe(68);
    expect(calls[1]!.body).toEqual({ ...params, quoteId: 'q_1', expectedCredits: 68, expectedCost: '0.068' });

    const task = await popnow.jobs.get('job_1');
    expect(task.credits).toBe(10);
    expect(task.exactCredits).toBe('10');

    const page = await popnow.jobs.list();
    expect(page.items[0]!.credits).toBe(10);

    const balance = await popnow.account.balance();
    expect(balance.availableCredits).toBe(1200);
    expect(balance.available).toBe('1.2');

    const usage = await popnow.account.usage();
    expect(usage.totalCredits).toBe(99);
    expect(usage.days[0]!.credits).toBe(99);
    expect(usage.models[0]!.credits).toBe(99);

    const model = await popnow.models.get('alibaba/z-image-turbo/text-to-image');
    expect(model.credits.perUnit).toBe(10);
  });
});
