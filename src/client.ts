import { Transport, type APIRequest, type APIResponse, type Fetch } from './core.js';
import { PopNowError } from './errors.js';
import { Account } from './resources/account.js';
import { Assets } from './resources/assets.js';
import { Files } from './resources/files.js';
import { Jobs } from './resources/jobs.js';
import { Models } from './resources/models.js';
import { isBrowser, readEnv } from './util.js';
import { VERSION } from './version.js';

export interface ClientOptions {
  /** API key (`sk-popnow-...`). Defaults to the `POPNOW_API_KEY` environment variable. */
  apiKey?: string;
  /** Defaults to `POPNOW_BASE_URL` or `https://api.popnow.ai`. */
  baseURL?: string;
  /** Per-attempt request timeout in milliseconds. Default 60000. */
  timeout?: number;
  /** Automatic retries for connection errors, timeouts, 429 and retryable 5xx. Default 2. */
  maxRetries?: number;
  /** Language for error messages (`Accept-Language`), for example `de` or `ja`. Codes never change. */
  language?: string;
  /** Headers sent with every request. */
  defaultHeaders?: Record<string, string>;
  /** Custom fetch implementation. Defaults to the global `fetch`. */
  fetch?: Fetch;
  /**
   * Silences the warning printed when the client is created in a browser. Anyone who can read
   * your page can read the key and spend your credits; call PopNow from your server instead.
   */
  dangerouslyAllowBrowser?: boolean;
}

export const DEFAULT_BASE_URL = 'https://api.popnow.ai';

let browserWarningShown = false;

/**
 * PopNow API client.
 *
 * ```ts
 * const popnow = new PopNow(); // reads POPNOW_API_KEY
 * const task = await popnow.jobs.createAndWait({
 *   model: 'alibaba/z-image-turbo/text-to-image',
 *   input: { prompt: 'A small red fox curled up in a teacup' },
 * });
 * ```
 */
export class PopNow {
  readonly models: Models;
  readonly jobs: Jobs;
  readonly files: Files;
  readonly assets: Assets;
  readonly account: Account;
  readonly baseURL: string;

  private readonly transport: Transport;

  constructor(options: ClientOptions = {}) {
    const apiKey = options.apiKey ?? readEnv('POPNOW_API_KEY');
    if (!apiKey) {
      throw new PopNowError(
        'Missing API key. Pass `apiKey` or set the POPNOW_API_KEY environment variable. ' +
          'Create a key at https://popnow.ai/api/console/keys',
      );
    }
    const fetchImpl = options.fetch ?? (globalThis as { fetch?: Fetch }).fetch;
    if (typeof fetchImpl !== 'function') {
      throw new PopNowError('No global fetch found. Use Node.js 18+ or pass a `fetch` implementation.');
    }
    if (isBrowser() && !options.dangerouslyAllowBrowser && !browserWarningShown) {
      browserWarningShown = true;
      console.warn(
        '[popnow] The PopNow client is running in a browser. Your API key is visible to anyone who ' +
          'opens this page and can spend your credits. Call PopNow from your own server instead.',
      );
    }

    this.baseURL = (options.baseURL ?? readEnv('POPNOW_BASE_URL') ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    const defaultHeaders: Record<string, string> = { ...options.defaultHeaders };
    if (options.language) defaultHeaders['Accept-Language'] = options.language;
    // Browsers forbid setting User-Agent; everywhere else it helps support trace SDK traffic.
    if (!isBrowser()) defaultHeaders['User-Agent'] ??= `popnow-js/${VERSION}`;

    this.transport = new Transport({
      apiKey,
      baseURL: this.baseURL,
      timeout: options.timeout ?? 60_000,
      maxRetries: options.maxRetries ?? 2,
      fetch: (input, init) => fetchImpl(input, init),
      defaultHeaders,
    });

    this.models = new Models(this.transport);
    this.jobs = new Jobs(this.transport);
    this.files = new Files(this.transport);
    this.assets = new Assets(this.transport);
    this.account = new Account(this.transport);
  }

  /**
   * Low-level escape hatch: send any request with the client's auth, retries and error mapping.
   * Returns the unwrapped `data` plus the status, `request_id` and headers.
   */
  request<T = unknown>(req: APIRequest): Promise<APIResponse<T>> {
    return this.transport.request<T>(req);
  }
}
