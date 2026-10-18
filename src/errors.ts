import type { TaskRecord } from './types.js';

/** Base class for every error this SDK throws. */
export class PopNowError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = new.target.name;
    if (options && 'cause' in options) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

export interface APIErrorInit {
  status: number;
  code: number;
  message: string;
  requestId?: string;
  reason?: string;
  headers?: Headers;
  body?: unknown;
}

/**
 * The API answered with a non-success envelope (`code !== 200`) or a non-JSON
 * error page. Branch on `code` (the business code), never on `message`.
 */
export class APIError extends PopNowError {
  /** HTTP status of the response. */
  readonly status: number;
  /** Business code from the envelope, for example `40201`. Falls back to the HTTP status. */
  readonly code: number;
  /** Correlation id from `request_id` or `X-Request-Id`. Quote it to support. */
  readonly requestId: string | undefined;
  /** Machine-readable `data.reason`, when the failure carries one. */
  readonly reason: string | undefined;
  readonly headers: Headers | undefined;
  /** Parsed JSON body, or the first part of a non-JSON body. */
  readonly body: unknown;

  constructor(init: APIErrorInit) {
    const suffix = init.requestId ? ` (request_id: ${init.requestId})` : '';
    super(`${init.code} ${init.message}${suffix}`);
    this.status = init.status;
    this.code = init.code;
    this.requestId = init.requestId;
    this.reason = init.reason;
    this.headers = init.headers;
    this.body = init.body;
  }

  /** Seconds from the `Retry-After` header, when present. */
  get retryAfter(): number | undefined {
    const value = this.headers?.get('retry-after');
    if (!value) return undefined;
    const seconds = Number(value);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
  }
}

/** 400: invalid request or input. Also `40003` (upload mismatch) and `40004` (unsupported combination). */
export class BadRequestError extends APIError {}
/** 401: missing, malformed, revoked or expired API key. */
export class AuthenticationError extends APIError {}
/** 402: insufficient balance (`40201`) or a key spend cap was reached (`40202`). */
export class PaymentRequiredError extends APIError {}
/** 403: model, IP, region or account restrictions (`40301`, `40302`, `40303`, `40310`). */
export class PermissionDeniedError extends APIError {}
/** 404: does not exist, or belongs to another API key. */
export class NotFoundError extends APIError {}
/** 409: idempotency or state conflict; `40901` means the quote expired or the price changed. */
export class ConflictError extends APIError {}
/** 413: request body too large. Upload media instead of inlining it. */
export class PayloadTooLargeError extends APIError {}
/** 429: rate limited. Honour `retryAfter`. */
export class RateLimitError extends APIError {}
/** 500 and other 5xx without a more specific class. */
export class InternalServerError extends APIError {}
/** 503: dependency unavailable (`503`), model unavailable (`50301`) or refunded failure (`50302`). */
export class ServiceUnavailableError extends APIError {}

/** The request never produced a response (DNS, TLS, connection reset...). */
export class APIConnectionError extends PopNowError {}
/** The request exceeded the configured timeout. */
export class APITimeoutError extends APIConnectionError {}
/** The caller aborted the request through an `AbortSignal`. */
export class APIUserAbortError extends PopNowError {}

/** `jobs.wait` gave up before the task reached a terminal state. The task keeps running. */
export class WaitTimeoutError extends PopNowError {
  readonly task: TaskRecord | undefined;
  constructor(message: string, task?: TaskRecord) {
    super(message);
    this.task = task;
  }
}

/** Thrown by `jobs.wait` / `jobs.createAndWait` with `throwOnFailure: true` when a task ends without succeeding. */
export class TaskFailedError extends PopNowError {
  readonly task: TaskRecord;
  readonly errorCode: string | undefined;
  constructor(task: TaskRecord) {
    const detail = task.errorCode ? `${task.errorCode}: ${task.errorMessage ?? 'no detail'}` : task.state;
    super(`Task ${task.taskId} ended as ${task.state} (${detail})`);
    this.task = task;
    this.errorCode = task.errorCode;
  }
}

/** A webhook signature, timestamp or payload failed verification. Answer 401 and do nothing. */
export class WebhookVerificationError extends PopNowError {}

/** Maps a business code (or HTTP status) to its error class. */
export function errorClassFor(code: number, status: number): typeof APIError {
  const family = code >= 1000 ? Math.floor(code / 100) : code;
  const key = family >= 100 && family < 600 ? family : status;
  switch (key) {
    case 400:
      return BadRequestError;
    case 401:
      return AuthenticationError;
    case 402:
      return PaymentRequiredError;
    case 403:
      return PermissionDeniedError;
    case 404:
      return NotFoundError;
    case 409:
      return ConflictError;
    case 413:
      return PayloadTooLargeError;
    case 429:
      return RateLimitError;
    case 503:
      return ServiceUnavailableError;
    default:
      return key >= 500 ? InternalServerError : APIError;
  }
}
