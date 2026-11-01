import type { RequestOptions, Transport } from '../core.js';
import type { Balance, Usage, UsageParams } from '../types.js';

/** API USD balance and usage for the authenticated API key. */
export class Account {
  constructor(private readonly transport: Transport) {}

  /**
   * `GET /api/v1/chat/credit`: available, held and total API balance as exact USD strings
   * (`availableUsd`, `heldUsd`, `totalUsd`). The API balance is separate from website credits.
   * (The path name is historical; it has nothing to do with chat or credits.)
   */
  async balance(options?: RequestOptions): Promise<Balance> {
    const res = await this.transport.request<Balance>({ method: 'GET', path: '/api/v1/chat/credit', options });
    return res.data;
  }

  /**
   * `GET /api/v1/usage`: calls and settled USD spend for this key, per day and per model.
   * Dates are UTC `YYYY-MM-DD`; `to` is exclusive and the range is at most 92 days.
   */
  async usage(params: UsageParams = {}, options?: RequestOptions): Promise<Usage> {
    const res = await this.transport.request<Usage>({
      method: 'GET',
      path: '/api/v1/usage',
      query: { ...params },
      options,
    });
    return res.data;
  }
}
