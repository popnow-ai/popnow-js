import { PopNow, type ClientOptions } from '../src/index.js';

export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

type Responder = (call: RecordedCall) => Response | Promise<Response>;

/** A fetch stand-in that replays queued responses and records every request. No network. */
export function mockFetch(...responders: Responder[]) {
  const calls: RecordedCall[] = [];
  const queue = [...responders];
  const fetch = async (input: string, init: RequestInit = {}) => {
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, key) => {
      headers[key] = value;
    });
    let body: unknown = init.body;
    if (typeof init.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    const call: RecordedCall = { url: input, method: init.method ?? 'GET', headers, body };
    calls.push(call);
    const next = queue.shift();
    if (!next) throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    return next(call);
  };
  return { fetch, calls };
}

export function envelope(data: unknown, init: { status?: number; code?: number; msg?: string; headers?: Record<string, string> } = {}) {
  return () =>
    new Response(
      JSON.stringify({ code: init.code ?? 200, msg: init.msg ?? 'success', data, request_id: 'req_test' }),
      { status: init.status ?? 200, headers: { 'content-type': 'application/json', ...init.headers } },
    );
}

export function errorEnvelope(status: number, code: number, msg: string, extra: { headers?: Record<string, string>; data?: unknown } = {}) {
  return () =>
    new Response(
      JSON.stringify({ code, msg, request_id: 'req_err', ...(extra.data ? { data: extra.data } : {}) }),
      { status, headers: { 'content-type': 'application/json', ...extra.headers } },
    );
}

export function client(fetch: ClientOptions['fetch'], options: ClientOptions = {}) {
  return new PopNow({ apiKey: 'sk-popnow-test', fetch, maxRetries: 0, ...options });
}

export const taskRecord = (overrides: Record<string, unknown> = {}) => ({
  taskId: 'job_1',
  model: 'alibaba/z-image-turbo/text-to-image',
  state: 'succeeded',
  cost: '0.02',
  credits: 2,
  settled: true,
  createdAt: '2026-10-16T09:00:00Z',
  deadlineAt: '2026-10-16T09:10:00Z',
  output: { assets: [{ key: 'out_0', url: 'https://example.com/a.png', mime: 'image/png' }] },
  ...overrides,
});
