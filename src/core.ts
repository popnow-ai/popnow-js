import {
  APIConnectionError,
  APIError,
  APITimeoutError,
  APIUserAbortError,
  errorClassFor,
} from './errors.js';
import { buildQuery, sleep, type QueryValue } from './util.js';

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Options accepted by every SDK method as the last argument. */
export interface RequestOptions {
  /** Cancels the request (and any retries) when aborted. */
  signal?: AbortSignal;
  /** Per-attempt timeout in milliseconds. */
  timeout?: number;
  /** Retries for connection errors, timeouts, 429 and retryable 5xx. */
  maxRetries?: number;
  /** Extra headers for this request. */
  headers?: Record<string, string>;
}

export interface IdempotentRequestOptions extends RequestOptions {
  /**
   * Stable key for one logical piece of work, reused on every retry. When omitted the SDK
   * generates one per call, so its own retries never create a second task or charge.
   */
  idempotencyKey?: string;
}

export interface APIRequest {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  path: string;
  query?: Record<string, QueryValue>;
  body?: unknown;
  headers?: Record<string, string | undefined>;
  options?: RequestOptions;
  /** Minimum per-attempt timeout for this call (for example when `wait` holds the connection). */
  minTimeout?: number;
}

export interface APIResponse<T> {
  data: T;
  status: number;
  requestId: string | undefined;
  headers: Headers;
}

export interface TransportConfig {
  apiKey: string;
  baseURL: string;
  timeout: number;
  maxRetries: number;
  fetch: Fetch;
  defaultHeaders: Record<string, string>;
}

/** Business codes the docs list as worth retrying. */
const RETRYABLE_CODES = new Set([429, 500, 503, 50301]);
/** HTTP statuses worth retrying when the body is not a PopNow envelope (edge and proxy errors). */
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524]);

const MAX_RETRY_AFTER_MS = 60_000;

export class Transport {
  constructor(private readonly config: TransportConfig) {}

  async request<T>(req: APIRequest): Promise<APIResponse<T>> {
    const opts = req.options ?? {};
    const maxRetries = Math.max(0, opts.maxRetries ?? this.config.maxRetries);
    const timeout = Math.max(opts.timeout ?? this.config.timeout, req.minTimeout ?? 0);
    const url = this.config.baseURL + req.path + buildQuery(req.query);

    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...this.config.defaultHeaders,
      Authorization: `Bearer ${this.config.apiKey}`,
    };
    for (const [key, value] of Object.entries(req.headers ?? {})) {
      if (value !== undefined) headers[key] = value;
    }
    Object.assign(headers, opts.headers);
    let body: string | undefined;
    if (req.body !== undefined) {
      body = JSON.stringify(req.body);
      headers['Content-Type'] = 'application/json';
    }

    for (let attempt = 0; ; attempt++) {
      const isLast = attempt >= maxRetries;
      let response: Response;
      try {
        response = await this.fetchWithTimeout(url, { method: req.method, headers, body }, timeout, opts.signal);
      } catch (err) {
        if (err instanceof APIUserAbortError || isLast) throw err;
        await this.backoff(attempt, undefined, opts.signal);
        continue;
      }

      const result = await parseResponse<T>(response);
      if (!(result instanceof APIError)) return result;

      const retryable = result.body !== undefined && isEnvelope(result.body)
        ? RETRYABLE_CODES.has(result.code)
        : RETRYABLE_STATUSES.has(result.status);
      if (!retryable || isLast) throw result;
      await this.backoff(attempt, result.retryAfter, opts.signal);
    }
  }

  /** Performs one fetch with a timeout and an optional caller signal, mapping failures to SDK errors. */
  async fetchWithTimeout(url: string, init: RequestInit, timeout: number, signal?: AbortSignal): Promise<Response> {
    if (signal?.aborted) throw new APIUserAbortError('Request was aborted', { cause: signal.reason });
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      return await this.config.fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      if (signal?.aborted) throw new APIUserAbortError('Request was aborted', { cause: signal.reason });
      if (timedOut) throw new APITimeoutError(`Request timed out after ${timeout} ms`, { cause: err });
      throw new APIConnectionError(`Connection error: ${(err as Error)?.message ?? String(err)}`, { cause: err });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  private async backoff(attempt: number, retryAfterSeconds: number | undefined, signal?: AbortSignal) {
    const ms = retryAfterSeconds !== undefined
      ? Math.min(retryAfterSeconds * 1000, MAX_RETRY_AFTER_MS)
      : Math.min(500 * 2 ** attempt, 8000) + Math.random() * 250;
    try {
      await sleep(ms, signal);
    } catch (err) {
      throw new APIUserAbortError('Request was aborted', { cause: err });
    }
  }
}

function isEnvelope(value: unknown): value is { code: number; msg?: string; data?: unknown; request_id?: string } {
  return typeof value === 'object' && value !== null && typeof (value as { code?: unknown }).code === 'number';
}

async function parseResponse<T>(response: Response): Promise<APIResponse<T> | APIError> {
  const text = await response.text().catch(() => '');
  const headerRequestId = response.headers.get('x-request-id') ?? undefined;
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }

  if (isEnvelope(json)) {
    const requestId = json.request_id || headerRequestId;
    if (json.code === 200 && response.ok) {
      return { data: json.data as T, status: response.status, requestId, headers: response.headers };
    }
    const data = json.data as { reason?: unknown } | undefined;
    const ErrorClass = errorClassFor(json.code, response.status);
    return new ErrorClass({
      status: response.status,
      code: json.code === 200 ? response.status : json.code,
      message: json.msg || response.statusText || 'Request failed',
      requestId,
      reason: typeof data?.reason === 'string' ? data.reason : undefined,
      headers: response.headers,
      body: json,
    });
  }

  // Not a PopNow envelope: an HTML or plain-text page from the network in between.
  const ErrorClass = errorClassFor(response.status, response.status);
  return new ErrorClass({
    status: response.status,
    code: response.status,
    message: `Unexpected ${response.ok ? 'non-JSON success' : 'error'} response (HTTP ${response.status}): ${text.slice(0, 200)}`,
    requestId: headerRequestId,
    headers: response.headers,
  });
}
