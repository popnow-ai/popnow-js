import type { IdempotentRequestOptions, RequestOptions, Transport } from '../core.js';
import type {
  Asset,
  AssetCreateParams,
  AssetDeleted,
  AssetList,
  AssetListParams,
  AssetUpdateParams,
  AssetUsage,
  Character,
  CharacterList,
  CharacterListParams,
} from '../types.js';
import { randomId } from '../util.js';

/** Characters: named sets of images in your asset library (read-only through the API). */
export class Characters {
  constructor(private readonly transport: Transport) {}

  /** `GET /api/v1/assets/entities?kind=character`: one page of characters, newest first. */
  async list(params: CharacterListParams = {}, options?: RequestOptions): Promise<CharacterList> {
    const res = await this.transport.request<CharacterList>({
      method: 'GET',
      path: '/api/v1/assets/entities',
      query: { kind: 'character', ...params },
      options,
    });
    return res.data;
  }

  /** `GET /api/v1/assets/entities/{id}`: one character with its images in order. */
  async get(characterId: string, options?: RequestOptions): Promise<Character> {
    const res = await this.transport.request<Character>({
      method: 'GET',
      path: `/api/v1/assets/entities/${encodeURIComponent(characterId)}`,
      options,
    });
    return res.data;
  }
}

/**
 * The long-term private asset library. Saved assets are referenced as `popnow://a/<id>` in
 * generation requests made with keys of the same workspace.
 */
export class Assets {
  readonly characters: Characters;

  constructor(private readonly transport: Transport) {
    this.characters = new Characters(transport);
  }

  /** `GET /api/v1/assets`: one page of saved assets. */
  async list(params: AssetListParams = {}, options?: RequestOptions): Promise<AssetList> {
    const res = await this.transport.request<AssetList>({
      method: 'GET',
      path: '/api/v1/assets',
      query: { ...params, source: Array.isArray(params.source) ? params.source.join(',') : params.source },
      options,
    });
    return res.data;
  }

  /** Iterates every asset matching the filters, following `nextCursor`. */
  async *listAll(params: Omit<AssetListParams, 'cursor'> = {}, options?: RequestOptions): AsyncGenerator<Asset> {
    let cursor: string | undefined;
    do {
      const page = await this.list({ ...params, cursor }, options);
      yield* page.items;
      cursor = page.nextCursor;
    } while (cursor);
  }

  /**
   * `POST /api/v1/assets`: save a task output, a committed upload or a public URL to the library.
   * The required `Idempotency-Key` is generated when you do not pass one.
   */
  async create(params: AssetCreateParams, options: IdempotentRequestOptions = {}): Promise<Asset> {
    const { idempotencyKey, ...rest } = options;
    const res = await this.transport.request<Asset>({
      method: 'POST',
      path: '/api/v1/assets',
      body: params,
      headers: { 'Idempotency-Key': idempotencyKey ?? randomId() },
      options: rest,
    });
    return res.data;
  }

  /** `GET /api/v1/assets/{id}`: one asset with a fresh private preview link. */
  async get(assetId: string, options?: RequestOptions): Promise<Asset> {
    const res = await this.transport.request<Asset>({
      method: 'GET',
      path: `/api/v1/assets/${encodeURIComponent(assetId)}`,
      options,
    });
    return res.data;
  }

  /** `PATCH /api/v1/assets/{id}`: rename an asset and/or change its favorite mark. */
  async update(assetId: string, params: AssetUpdateParams, options?: RequestOptions): Promise<Asset> {
    const res = await this.transport.request<Asset>({
      method: 'PATCH',
      path: `/api/v1/assets/${encodeURIComponent(assetId)}`,
      body: params,
      options,
    });
    return res.data;
  }

  /** `DELETE /api/v1/assets/{id}`: delete an asset. Safe to repeat. */
  async delete(assetId: string, options?: RequestOptions): Promise<AssetDeleted> {
    const res = await this.transport.request<AssetDeleted>({
      method: 'DELETE',
      path: `/api/v1/assets/${encodeURIComponent(assetId)}`,
      options,
    });
    return res.data;
  }

  /** `GET /api/v1/assets/usage`: storage plan, usage, limits and the next plan. */
  async usage(options?: RequestOptions): Promise<AssetUsage> {
    const res = await this.transport.request<AssetUsage>({ method: 'GET', path: '/api/v1/assets/usage', options });
    return res.data;
  }
}
