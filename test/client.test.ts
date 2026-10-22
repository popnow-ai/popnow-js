import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  APIConnectionError,
  APITimeoutError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  ConflictError,
  InternalServerError,
  NotFoundError,
  PaymentRequiredError,
  PermissionDeniedError,
  PopNow,
  PopNowError,
  RateLimitError,
  ServiceUnavailableError,
} from '../src/index.js';
import { client, envelope, errorEnvelope, mockFetch } from './helpers.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('configuration', () => {
  it('reads the API key from POPNOW_API_KEY', async () => {
    vi.stubEnv('POPNOW_API_KEY', 'sk-popnow-fromenv');
    const { fetch, calls } = mockFetch(envelope({ total: 0, items: [] }));
    await new PopNow({ fetch }).models.list();
    expect(calls[0]!.headers.authorization).toBe('Bearer sk-popnow-fromenv');
  });

  it('throws a helpful error without an API key', () => {
    vi.stubEnv('POPNOW_API_KEY', '');
    expect(() => new PopNow({ fetch: async () => new Response() })).toThrow(PopNowError);
    expect(() => new PopNow({ fetch: async () => new Response() })).toThrow(/POPNOW_API_KEY/);
  });

  it('uses the default base URL and accepts an override without a trailing slash', async () => {
    const a = mockFetch(envelope({ total: 0, items: [] }));
    await client(a.fetch).models.list();
    expect(a.calls[0]!.url).toBe('https://api.popnow.ai/api/v1/models');

    const b = mockFetch(envelope({ total: 0, items: [] }));
    await client(b.fetch, { baseURL: 'https://staging.example.com/' }).models.list();
    expect(b.calls[0]!.url).toBe('https://staging.example.com/api/v1/models');
  });

  it('sends Accept-Language and custom headers', async () => {
    const { fetch, calls } = mockFetch(envelope({ total: 0, items: [] }));
    await client(fetch, { language: 'de', defaultHeaders: { 'X-Trace': 'abc' } }).models.list();
    expect(calls[0]!.headers['accept-language']).toBe('de');
    expect(calls[0]!.headers['x-trace']).toBe('abc');
    expect(calls[0]!.headers['user-agent']).toMatch(/^popnow-js\//);
  });

  it('exposes a low-level request() that returns the request id', async () => {
    const { fetch } = mockFetch(envelope({ ok: true }));
    const res = await client(fetch).request<{ ok: boolean }>({ method: 'GET', path: '/api/v1/usage' });
    expect(res.data.ok).toBe(true);
    expect(res.requestId).toBe('req_test');
    expect(res.status).toBe(200);
  });
});

describe('errors', () => {
  const cases: Array<[number, number, new (...args: never[]) => Error]> = [
    [400, 400, BadRequestError],
    [400, 40004, BadRequestError],
    [401, 401, AuthenticationError],
    [402, 40201, PaymentRequiredError],
    [403, 40301, PermissionDeniedError],
    [404, 404, NotFoundError],
    [409, 40901, ConflictError],
    [429, 429, RateLimitError],
    [500, 500, InternalServerError],
    [503, 50302, ServiceUnavailableError],
  ];

  it.each(cases)('maps HTTP %i / code %i to the right class', async (status, code, ErrorClass) => {
    const { fetch } = mockFetch(errorEnvelope(status, code, 'Something went wrong'));
    const err = await client(fetch).models.list().catch((e) => e);
    expect(err).toBeInstanceOf(ErrorClass);
    expect(err.code).toBe(code);
    expect(err.status).toBe(status);
    expect(err.requestId).toBe('req_err');
    expect(err.message).toContain('Something went wrong');
  });

  it('exposes data.reason and Retry-After', async () => {
    const { fetch } = mockFetch(
      errorEnvelope(429, 429, 'Daily limit', { data: { reason: 'asset_daily_limit' }, headers: { 'retry-after': '120' } }),
    );
    const err = await client(fetch).assets.list().catch((e) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.reason).toBe('asset_daily_limit');
    expect(err.retryAfter).toBe(120);
  });

  it('handles non-JSON error pages by HTTP status', async () => {
    const { fetch } = mockFetch(
      () => new Response('<html>Bad gateway</html>', { status: 502, headers: { 'x-request-id': 'req_edge' } }),
    );
    const err = await client(fetch).models.list().catch((e) => e);
    expect(err).toBeInstanceOf(InternalServerError);
    expect(err.status).toBe(502);
    expect(err.requestId).toBe('req_edge');
    expect(err.message).toContain('Bad gateway');
  });
});

describe('retries', () => {
  it('retries retryable business codes and honours Retry-After', async () => {
    const { fetch, calls } = mockFetch(
      errorEnvelope(429, 429, 'Too many requests', { headers: { 'retry-after': '0' } }),
      errorEnvelope(503, 50301, 'Model unavailable', { headers: { 'retry-after': '0' } }),
      envelope({ total: 0, items: [] }),
    );
    const list = await client(fetch, { maxRetries: 2 }).models.list();
    expect(list.total).toBe(0);
    expect(calls).toHaveLength(3);
  });

  it('does not retry errors that need a fix', async () => {
    const { fetch, calls } = mockFetch(errorEnvelope(400, 400, 'Invalid input'));
    await expect(client(fetch, { maxRetries: 3 }).models.list()).rejects.toBeInstanceOf(BadRequestError);
    expect(calls).toHaveLength(1);
  });

  it('does not retry 50302 (the original idempotency key would replay the failure)', async () => {
    const { fetch, calls } = mockFetch(errorEnvelope(503, 50302, 'Refunded'));
    await expect(client(fetch, { maxRetries: 3 }).models.list()).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(calls).toHaveLength(1);
  });

  it('retries connection errors and reuses the same idempotency key', async () => {
    const { fetch, calls } = mockFetch(
      () => {
        throw new TypeError('fetch failed');
      },
      () => new Response('gateway timeout', { status: 524 }),
      envelope({ taskId: 'job_1', state: 'queued', estimatedCost: '0.01', estimatedCredits: 10, deadlineAt: 'x' }, { status: 202 }),
    );
    const popnow = client(fetch, { maxRetries: 2 });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const created = await popnow.jobs.create({ model: 'm', input: {} });
    vi.restoreAllMocks();
    expect(created.taskId).toBe('job_1');
    expect(calls).toHaveLength(3);
    const keys = new Set(calls.map((c) => c.headers['idempotency-key']));
    expect(keys.size).toBe(1);
  });

  it('wraps a final connection failure in APIConnectionError', async () => {
    const { fetch } = mockFetch(() => {
      throw new TypeError('fetch failed');
    });
    await expect(client(fetch).models.list()).rejects.toBeInstanceOf(APIConnectionError);
  });
});

describe('timeouts and abort', () => {
  const hanging = (call: unknown, init?: RequestInit) =>
    new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    });

  it('times out with APITimeoutError', async () => {
    const popnow = new PopNow({ apiKey: 'sk-popnow-test', fetch: hanging, timeout: 20, maxRetries: 0 });
    await expect(popnow.models.list()).rejects.toBeInstanceOf(APITimeoutError);
  });

  it('stops on a caller AbortSignal with APIUserAbortError', async () => {
    const popnow = new PopNow({ apiKey: 'sk-popnow-test', fetch: hanging, maxRetries: 3 });
    const controller = new AbortController();
    const promise = popnow.models.list({}, { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toBeInstanceOf(APIUserAbortError);
  });
});
