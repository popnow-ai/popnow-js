import type { RequestOptions, Transport } from '../core.js';
import { APIError, PopNowError } from '../errors.js';
import type {
  DownloadUrl,
  DownloadUrlParams,
  LoraImportParams,
  UploadContentType,
  UploadedFile,
  UploadTicket,
  UploadUrlParams,
} from '../types.js';
import { sniffContentType } from '../util.js';

/** Anything with a known length: a `Blob`/`File`, a Node `Buffer`, a `Uint8Array` or an `ArrayBuffer`. */
export type Uploadable = Blob | Uint8Array | ArrayBuffer;

export interface UploadOptions extends RequestOptions {
  /** Media type to declare. Defaults to the Blob's type, or is detected from the first bytes. */
  contentType?: UploadContentType;
  /** Timeout for the PUT of the bytes, in milliseconds. Default 10 minutes. */
  uploadTimeout?: number;
}

const DEFAULT_UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;
/** Headers the runtime computes itself; browsers refuse to set them. */
const RUNTIME_HEADERS = new Set(['content-length', 'host', 'connection']);

/** Uploads (upload ticket, PUT, commit), LoRA imports and download links. */
export class Files {
  constructor(private readonly transport: Transport) {}

  /**
   * Uploads a file in three steps and returns the committed file. Put `uri`
   * (`popnow://f/fil_...`) in a model's media field. Uploaded files are temporary.
   */
  async upload(data: Uploadable, options: UploadOptions = {}): Promise<UploadedFile> {
    const { contentType: explicitType, uploadTimeout, ...requestOptions } = options;
    const body = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    const bytes = body instanceof Uint8Array ? body.byteLength : body.size;
    const contentType = explicitType ?? (await detectContentType(body));
    if (!contentType) {
      throw new PopNowError('Could not detect the media type; pass `contentType` to files.upload().');
    }
    if (bytes < 1) throw new PopNowError('Cannot upload an empty file.');

    const ticket = await this.createUploadUrl({ contentType: contentType as UploadContentType, bytes }, requestOptions);
    await this.put(ticket, body, uploadTimeout ?? DEFAULT_UPLOAD_TIMEOUT_MS, requestOptions.signal);
    return this.commit(ticket.fileId, requestOptions);
  }

  /** `POST /api/v1/common/upload-url`: a presigned upload ticket. Most callers want `upload()`. */
  async createUploadUrl(params: UploadUrlParams, options?: RequestOptions): Promise<UploadTicket> {
    const res = await this.transport.request<UploadTicket>({
      method: 'POST',
      path: '/api/v1/common/upload-url',
      body: params,
      options,
    });
    return res.data;
  }

  /** `POST /api/v1/files/{fileId}/commit`: verify an uploaded file and get its `popnow://` URI. Idempotent. */
  async commit(fileId: string, options?: RequestOptions): Promise<UploadedFile> {
    const res = await this.transport.request<UploadedFile>({
      method: 'POST',
      path: `/api/v1/files/${encodeURIComponent(fileId)}/commit`,
      options,
    });
    return res.data;
  }

  /**
   * `POST /api/v1/files/import`: download a `.safetensors` LoRA file once from a link
   * (Hugging Face repo id or page, or a direct https URL) and keep it as your upload.
   */
  async import(params: LoraImportParams, options?: RequestOptions): Promise<UploadedFile> {
    const res = await this.transport.request<UploadedFile>({
      method: 'POST',
      path: '/api/v1/files/import',
      body: params,
      options,
    });
    return res.data;
  }

  /** `POST /api/v1/common/download-url`: a fresh short-lived link to one output of a task. */
  async downloadUrl(params: DownloadUrlParams, options?: RequestOptions): Promise<DownloadUrl> {
    const res = await this.transport.request<DownloadUrl>({
      method: 'POST',
      path: '/api/v1/common/download-url',
      body: params,
      options,
    });
    return res.data;
  }

  private async put(ticket: UploadTicket, body: Blob | Uint8Array, timeout: number, signal?: AbortSignal) {
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(ticket.headers ?? {})) {
      if (!RUNTIME_HEADERS.has(key.toLowerCase())) headers[key] = value;
    }
    // The upload URL is presigned: never send the API key to it.
    const response = await this.transport.fetchWithTimeout(
      ticket.uploadUrl,
      { method: ticket.method || 'PUT', headers, body: body as BodyInit },
      timeout,
      signal,
    );
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new APIError({
        status: response.status,
        code: response.status,
        message: `Upload PUT failed with HTTP ${response.status}: ${text.slice(0, 200)}`,
        headers: response.headers,
      });
    }
  }
}

async function detectContentType(body: Blob | Uint8Array): Promise<string | undefined> {
  if (body instanceof Uint8Array) return sniffContentType(body.subarray(0, 16));
  if (body.type) return body.type.split(';')[0]!.trim();
  const head = new Uint8Array(await body.slice(0, 16).arrayBuffer());
  return sniffContentType(head);
}
