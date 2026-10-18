import { WebhookVerificationError } from './errors.js';
import type { Envelope, TaskRecord } from './types.js';
import { base64ToBytes, bytesToBase64, bytesToHex, timingSafeEqual, toBytes } from './util.js';

/** A `Headers` object, or a plain object such as Node's `req.headers`. */
export type HeadersLike = Headers | Record<string, string | string[] | undefined>;

export interface VerifyWebhookOptions {
  /** The raw request body, exactly as received. Never a re-serialised object. */
  payload: string | Uint8Array | ArrayBuffer;
  headers: HeadersLike;
  /** The account webhook signing secret (`POPNOW_WEBHOOK_SECRET`). */
  secret: string;
  /** Maximum age of the timestamp in seconds. Default 300. */
  toleranceSeconds?: number;
  /** Current Unix time in seconds; for tests. */
  now?: number;
}

/** Body of a task callback: the same envelope and task record `recordInfo` returns. */
export type TaskCallbackEvent = Envelope<TaskRecord> & { data: TaskRecord };

export interface StandardWebhookEvent {
  /** `task.completed`, `task.succeeded`, `task.failed`, `task.expired` or `task.canceled`. */
  type: string;
  timestamp?: string;
  data: { object: TaskRecord; [key: string]: unknown };
  [key: string]: unknown;
}

/**
 * Verifies a task callback (sent to `callBackUrl`) and returns the parsed body.
 *
 * `X-Webhook-Signature = base64(HMAC-SHA256(secret, "<taskId>.<timestamp>.<sha256_hex(raw_body)>"))`.
 * Throws `WebhookVerificationError` when the signature, timestamp or body is wrong.
 * Use `request_id` of the result as the delivery id to ignore duplicates.
 */
export async function verifyWebhook(options: VerifyWebhookOptions): Promise<TaskCallbackEvent> {
  const raw = toBytes(options.payload);
  const timestamp = readHeader(options.headers, 'x-webhook-timestamp');
  const signature = readHeader(options.headers, 'x-webhook-signature');
  if (!options.secret) throw new WebhookVerificationError('Missing webhook secret');
  if (!signature) throw new WebhookVerificationError('Missing X-Webhook-Signature header');
  checkTimestamp(timestamp, options.toleranceSeconds, options.now);

  const event = parseJson(raw) as TaskCallbackEvent & { task_id?: unknown };
  const version = readHeader(options.headers, 'x-webhook-payload-version');
  const taskId = version === '1' ? event.task_id : event.data?.taskId;
  if (typeof taskId !== 'string' || !taskId) throw new WebhookVerificationError('Payload has no task id');

  const subtle = await getSubtle();
  const digest = bytesToHex(new Uint8Array(await subtle.digest('SHA-256', raw as BufferSource)));
  const expected = await hmacBase64(subtle, new TextEncoder().encode(options.secret), new TextEncoder().encode(`${taskId}.${timestamp}.${digest}`));
  if (!timingSafeEqual(expected, signature.trim())) throw new WebhookVerificationError('Signature does not match');
  return event;
}

export interface VerifyStandardWebhookOptions extends Omit<VerifyWebhookOptions, 'secret'> {
  /** The endpoint's `whsec_...` secret from the API console. */
  secret: string;
}

/**
 * Verifies an account endpoint delivery in the Standard Webhooks format and returns the event.
 *
 * `webhook-signature: v1,base64(HMAC-SHA256(key, "<webhook-id>.<webhook-timestamp>.<raw_body>"))`,
 * where `key` is the Base64-decoded part of the secret after `whsec_`. During a rotation the header
 * may hold several space-separated signatures; any match is accepted.
 */
export async function verifyStandardWebhook(options: VerifyStandardWebhookOptions): Promise<StandardWebhookEvent> {
  const raw = toBytes(options.payload);
  const id = readHeader(options.headers, 'webhook-id');
  const timestamp = readHeader(options.headers, 'webhook-timestamp');
  const header = readHeader(options.headers, 'webhook-signature');
  if (!options.secret) throw new WebhookVerificationError('Missing webhook secret');
  if (!id || !header) throw new WebhookVerificationError('Missing webhook-id or webhook-signature header');
  checkTimestamp(timestamp, options.toleranceSeconds, options.now);

  let key: Uint8Array;
  try {
    key = base64ToBytes(options.secret.startsWith('whsec_') ? options.secret.slice('whsec_'.length) : options.secret);
  } catch {
    throw new WebhookVerificationError('Webhook secret is not valid Base64');
  }
  const prefix = new TextEncoder().encode(`${id}.${timestamp}.`);
  const message = new Uint8Array(prefix.length + raw.length);
  message.set(prefix, 0);
  message.set(raw, prefix.length);

  const expected = await hmacBase64(await getSubtle(), key, message);
  const matched = header
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => {
      const [version, value] = part.split(',', 2);
      return version === 'v1' && value !== undefined && timingSafeEqual(expected, value);
    });
  if (!matched) throw new WebhookVerificationError('Signature does not match');
  return parseJson(raw) as StandardWebhookEvent;
}

function readHeader(headers: HeadersLike, name: string): string | undefined {
  if (typeof (headers as Headers).get === 'function') return (headers as Headers).get(name) ?? undefined;
  const record = headers as Record<string, string | string[] | undefined>;
  const key = Object.keys(record).find((k) => k.toLowerCase() === name);
  const value = key === undefined ? undefined : record[key];
  return Array.isArray(value) ? value[0] : value;
}

function checkTimestamp(timestamp: string | undefined, tolerance = 300, now = Math.floor(Date.now() / 1000)) {
  if (!timestamp || !/^\d+$/.test(timestamp)) throw new WebhookVerificationError('Missing or malformed timestamp');
  if (Math.abs(now - Number(timestamp)) > tolerance) throw new WebhookVerificationError('Timestamp is outside the tolerance');
}

function parseJson(raw: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(raw));
  } catch {
    throw new WebhookVerificationError('Payload is not valid JSON');
  }
}

async function hmacBase64(subtle: SubtleCrypto, key: Uint8Array, message: Uint8Array): Promise<string> {
  const cryptoKey = await subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return bytesToBase64(new Uint8Array(await subtle.sign('HMAC', cryptoKey, message as BufferSource)));
}

async function getSubtle(): Promise<SubtleCrypto> {
  const subtle = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (subtle) return subtle;
  // Node 18 exposes Web Crypto only through the crypto module. The specifier is kept in a
  // variable so bundlers for other runtimes do not try to resolve it.
  const specifier = 'node:crypto';
  try {
    const mod = (await import(/* webpackIgnore: true */ /* @vite-ignore */ specifier)) as { webcrypto?: Crypto };
    if (mod.webcrypto?.subtle) return mod.webcrypto.subtle;
  } catch {
    // Fall through to the error below.
  }
  throw new WebhookVerificationError('Web Crypto (crypto.subtle) is not available in this runtime');
}
