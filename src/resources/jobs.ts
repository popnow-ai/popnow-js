import type { IdempotentRequestOptions, RequestOptions, Transport } from '../core.js';
import { APIUserAbortError, TaskFailedError, WaitTimeoutError } from '../errors.js';
import type {
  CreateTaskParams,
  CreateTaskResponse,
  RetryTaskResponse,
  TaskList,
  TaskListItem,
  TaskListParams,
  TaskPurgeResponse,
  TaskQuote,
  TaskRecord,
  TaskState,
} from '../types.js';
import { randomId, sleep } from '../util.js';

const TERMINAL_STATES: ReadonlySet<string> = new Set<TaskState>(['succeeded', 'failed', 'canceled', 'expired']);

/** True for `succeeded`, `failed`, `canceled` and `expired`. Unknown states are treated as not final. */
export function isTerminalState(state: string): boolean {
  return TERMINAL_STATES.has(state);
}

/** True when the task is final and none of its output files are still being copied. */
export function isTaskDone(task: Pick<TaskRecord, 'state' | 'output'>): boolean {
  if (!isTerminalState(task.state)) return false;
  const assets = task.output?.assets ?? [];
  return !assets.some((asset) => asset.pending && !asset.unavailable);
}

/** Distinguishes the full task record (returned by `wait`) from the short acceptance response. */
export function isTaskRecord(value: CreateTaskResponse | TaskRecord): value is TaskRecord {
  return 'settled' in value && 'createdAt' in value;
}

export interface CreateTaskOptions extends IdempotentRequestOptions {
  /**
   * Seconds (1 to 60) to hold the connection open until the task is final. When it finishes
   * in time the full task record is returned; otherwise the usual acceptance response.
   */
  wait?: number;
  /** Retention in seconds for this task's outputs and prompt (`X-PopNow-Retention`). Can only shorten it. */
  retention?: number;
}

export interface WaitOptions {
  /** Cancels waiting. The task itself keeps running. */
  signal?: AbortSignal;
  /**
   * Overall time budget in milliseconds. Defaults to the task's `deadlineAt` plus two minutes (at least two minutes),
   * or one hour when the deadline is unknown.
   */
  timeout?: number;
  /** First delay between polls, in milliseconds. Default 2000. */
  pollInterval?: number;
  /** Upper bound for the growing delay, in milliseconds. Default 15000. */
  maxPollInterval?: number;
  /** Throw `TaskFailedError` when the task ends in any state other than `succeeded`. */
  throwOnFailure?: boolean;
  /** Called with every task record read while waiting. */
  onPoll?: (task: TaskRecord) => void;
  /** Options for each `recordInfo` request. */
  requestOptions?: RequestOptions;
}

export interface CreateAndWaitOptions extends WaitOptions {
  idempotencyKey?: string;
  /** Seconds the first call holds the connection open (1 to 60). Default 60. Set 0 to skip. */
  wait?: number;
  retention?: number;
}

const DEFAULT_WAIT_WITHOUT_DEADLINE_MS = 60 * 60 * 1000;
const DEADLINE_GRACE_MS = 2 * 60 * 1000;

/** Asynchronous generation tasks: quote, create, read, wait, list, retry and purge. */
export class Jobs {
  constructor(private readonly transport: Transport) {}

  /** `POST /api/v1/jobs/quote`: validate a request and price it without creating a task or holding credits. */
  async quote(params: CreateTaskParams, options?: RequestOptions): Promise<TaskQuote> {
    const res = await this.transport.request<TaskQuote>({
      method: 'POST',
      path: '/api/v1/jobs/quote',
      body: params,
      options,
    });
    return res.data;
  }

  /**
   * `POST /api/v1/jobs/createTask`. Holds the maximum charge and queues the task.
   * An `Idempotency-Key` is always sent (generated when you do not pass one), so SDK retries are safe.
   */
  async create(params: CreateTaskParams, options: CreateTaskOptions = {}): Promise<CreateTaskResponse | TaskRecord> {
    const { wait, retention, idempotencyKey, ...rest } = options;
    const waitSeconds = wait && wait > 0 ? Math.min(Math.floor(wait), 60) : undefined;
    const res = await this.transport.request<CreateTaskResponse | TaskRecord>({
      method: 'POST',
      path: '/api/v1/jobs/createTask',
      query: { wait: waitSeconds },
      body: params,
      headers: {
        'Idempotency-Key': idempotencyKey ?? randomId(),
        'X-PopNow-Retention': retention === undefined ? undefined : String(Math.trunc(retention)),
      },
      options: rest,
      minTimeout: waitSeconds ? (waitSeconds + 30) * 1000 : undefined,
    });
    return res.data;
  }

  /** `GET /api/v1/jobs/recordInfo`: the current task record. */
  async get(taskId: string, options?: RequestOptions): Promise<TaskRecord> {
    const res = await this.transport.request<TaskRecord>({
      method: 'GET',
      path: '/api/v1/jobs/recordInfo',
      query: { taskId },
      options,
    });
    return res.data;
  }

  /** `GET /api/v1/jobs`: one page of tasks created by this key, newest first, without inputs or outputs. */
  async list(params: TaskListParams = {}, options?: RequestOptions): Promise<TaskList> {
    const res = await this.transport.request<TaskList>({
      method: 'GET',
      path: '/api/v1/jobs',
      query: { ...params },
      options,
    });
    return res.data;
  }

  /** Iterates every task matching the filters, following `nextCursor` page by page. */
  async *listAll(params: Omit<TaskListParams, 'cursor'> = {}, options?: RequestOptions): AsyncGenerator<TaskListItem> {
    let cursor: string | undefined;
    do {
      const page = await this.list({ ...params, cursor }, options);
      yield* page.items;
      cursor = page.hasMore ? page.nextCursor : undefined;
    } while (cursor);
  }

  /** `POST /api/v1/jobs/retry`: create a new task from a `failed` or `expired` one, at today's price. */
  async retry(taskId: string, options: IdempotentRequestOptions = {}): Promise<RetryTaskResponse> {
    const { idempotencyKey, ...rest } = options;
    const res = await this.transport.request<RetryTaskResponse>({
      method: 'POST',
      path: '/api/v1/jobs/retry',
      body: { taskId },
      headers: { 'Idempotency-Key': idempotencyKey ?? randomId() },
      options: rest,
    });
    return res.data;
  }

  /** `POST /api/v1/jobs/purge`: destroy a finished task's files, result and prompt. Billing records stay. */
  async purge(taskId: string, options?: RequestOptions): Promise<TaskPurgeResponse> {
    const res = await this.transport.request<TaskPurgeResponse>({
      method: 'POST',
      path: '/api/v1/jobs/purge',
      body: { taskId },
      options,
    });
    return res.data;
  }

  /**
   * Polls `recordInfo` with growing delays (2 s, then x1.5 up to 15 s) until the task is final
   * and its files are ready. Returns the terminal record, whatever the final state.
   */
  async wait(taskId: string, options: WaitOptions = {}): Promise<TaskRecord> {
    const { signal, pollInterval = 2000, maxPollInterval = 15_000 } = options;
    const started = Date.now();
    let budget = options.timeout;
    let delay = pollInterval;
    let last: TaskRecord | undefined;

    for (;;) {
      last = await this.get(taskId, { ...options.requestOptions, signal: signal ?? options.requestOptions?.signal });
      options.onPoll?.(last);
      if (isTaskDone(last)) return finish(last, options.throwOnFailure);

      if (budget === undefined) {
        const deadline = last.deadlineAt ? Date.parse(last.deadlineAt) : NaN;
        budget = Number.isFinite(deadline)
          ? Math.max(deadline + DEADLINE_GRACE_MS - started, DEADLINE_GRACE_MS)
          : DEFAULT_WAIT_WITHOUT_DEADLINE_MS;
      }
      const remaining = budget - (Date.now() - started);
      if (remaining <= 0) {
        throw new WaitTimeoutError(`Task ${taskId} is still ${last.state} after waiting ${Date.now() - started} ms`, last);
      }
      try {
        await sleep(Math.min(delay, remaining), signal);
      } catch (err) {
        throw new APIUserAbortError('Waiting was aborted', { cause: err });
      }
      delay = Math.min(delay * 1.5, maxPollInterval);
    }
  }

  /**
   * Creates a task and resolves with its terminal record. The first call holds the connection
   * for up to `wait` seconds (default 60), then polling takes over.
   */
  async createAndWait(params: CreateTaskParams, options: CreateAndWaitOptions = {}): Promise<TaskRecord> {
    const { idempotencyKey, wait = 60, retention, ...waitOptions } = options;
    const created = await this.create(params, {
      ...waitOptions.requestOptions,
      signal: waitOptions.signal ?? waitOptions.requestOptions?.signal,
      idempotencyKey,
      wait,
      retention,
    });
    if (isTaskRecord(created) && isTaskDone(created)) return finish(created, waitOptions.throwOnFailure);
    return this.wait(created.taskId, waitOptions);
  }
}

function finish(task: TaskRecord, throwOnFailure: boolean | undefined): TaskRecord {
  if (throwOnFailure && task.state !== 'succeeded') throw new TaskFailedError(task);
  return task;
}
