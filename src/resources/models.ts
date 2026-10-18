import type { RequestOptions, Transport } from '../core.js';
import type { Model, ModelId, ModelList, ModelListParams } from '../types.js';

/** The model catalog: every image, video and audio model your key can call, with prices in credits. */
export class Models {
  constructor(private readonly transport: Transport) {}

  /** `GET /api/v1/models`. Not paginated; the server allows caching for 60 seconds. */
  async list(params: ModelListParams = {}, options?: RequestOptions): Promise<ModelList> {
    const res = await this.transport.request<ModelList>({
      method: 'GET',
      path: '/api/v1/models',
      query: { ...params },
      options,
    });
    return res.data;
  }

  /** `GET /api/v1/models/{model}`: one model including its input JSON Schema. */
  async get(model: ModelId, options?: RequestOptions): Promise<Model> {
    const path = model.split('/').map(encodeURIComponent).join('/');
    const res = await this.transport.request<Model>({
      method: 'GET',
      path: `/api/v1/models/${path}`,
      options,
    });
    return res.data;
  }
}
