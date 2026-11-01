/**
 * Types for the PopNow API, written by hand from the public OpenAPI contract
 * (https://popnow.ai/docs/openapi). The API bills in USD from its own API balance.
 * Every amount is an exact USD decimal string (up to nine decimal places); keep it
 * as a string or a decimal type, never a binary float. Integer credit fields
 * (1 credit = $0.001) are deprecated display projections kept for compatibility.
 */

/**
 * Exact USD amount encoded as a decimal string with up to nine decimal places and no exponent,
 * for example `"0.34"` or `"0.004800000"`.
 */
export type USDString = string;

/** Model call name in `<publisher>/<model>/<task>` form, for example `alibaba/wan-3.0/image-to-video`. */
export type ModelId = string;

export type Modality = 'image' | 'video' | 'audio';

export type TaskState = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'expired';

/** Closed set of task failure codes. Treat any other value as `upstream_failed`. */
export type TaskErrorCode =
  | 'invalid_request'
  | 'unsupported_combination'
  | 'content_rejected'
  | 'rate_limited'
  | 'upstream_unavailable'
  | 'generation_failed'
  | 'timeout'
  | 'invalid_asset'
  | 'upstream_failed';

/** The `{code,msg,data,request_id}` envelope every native JSON response uses. */
export interface Envelope<T> {
  code: number;
  msg: string;
  data?: T;
  request_id: string;
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

/** @deprecated Credit-scale price rule. Use {@link ModelUsdRule} from `Model.usd`. */
export interface ModelCreditRule {
  when: Record<string, unknown>;
  perUnit: number;
  unit?: string;
}

/**
 * @deprecated Credit-scale rate snapshot (1 credit = $0.001) kept for compatibility; it may lose
 * precision. Use {@link ModelUsd} from `Model.usd`, and `jobs.quote` for the exact price of a request.
 */
export interface ModelCredits {
  /** How the price scales: `per_image`, `per_second`, `per_request`... */
  unit: string;
  /** Starting price per unit, in credits. */
  perUnit: number;
  rules?: ModelCreditRule[];
  [key: string]: unknown;
}

/** One conditional USD price; `when` holds the input conditions it applies to. */
export interface ModelUsdRule {
  when: Record<string, unknown>;
  /** USD per unit, as an exact decimal string. */
  perUnit: USDString;
  unit?: string;
}

/** Duration billing blocks: duration is rounded up to whole blocks, subject to `min` and `cap`. */
export interface ModelUsdBlocks {
  seconds: number;
  min?: number;
  cap?: number;
}

/** Chat models only: prices for requests whose input exceeds `thresholdTokens`. */
export interface ModelUsdLongContext {
  thresholdTokens?: number;
  inclusive?: boolean;
  input?: USDString;
  cachedInput?: USDString;
  cacheWrite?: USDString;
  output?: USDString;
}

/**
 * USD rate snapshot for a model. Amounts are exact decimal strings. Use `jobs.quote` for the
 * authoritative hold of one request.
 */
export interface ModelUsd {
  /** How the price scales: `per_image`, `per_second`, `per_request`... */
  unit: string;
  /** Starting USD price per unit. */
  perUnit?: USDString;
  blocks?: ModelUsdBlocks;
  /** Chat models only: USD per 1M input tokens. */
  input?: USDString;
  /** Chat models only: USD per 1M output tokens (reasoning tokens count as output). */
  output?: USDString;
  /** Chat models only: USD per 1M cached input tokens. */
  cachedInput?: USDString;
  /** Chat models only: USD per 1M tokens written to the prompt cache. */
  cacheWrite?: USDString;
  longContext?: ModelUsdLongContext;
  rules?: ModelUsdRule[];
  currency: 'USD';
  [key: string]: unknown;
}

export interface ModelExample {
  id: string;
  input: Record<string, unknown>;
  sortWeight: number;
}

export type ModelBadge =
  | 'commercial_use'
  | 'no_watermark'
  | 'commercial_restricted'
  | 'reference_input'
  | 'audio_output'
  | 'fast_tier'
  | 'high_resolution'
  | (string & {});

export interface Model {
  model: ModelId;
  family: string;
  displayName: string;
  provider: string;
  modality: Modality;
  /** Exactly one element; use it only to group or filter. */
  tasks: string[];
  async: boolean;
  toolkit?: 'subject-swap' | 'studio-tools';
  taskTimeoutSeconds: number;
  maxOutputDurationSeconds?: number;
  enabled: boolean;
  /** Whether the model can be called right now. */
  available: boolean;
  quantityField: string;
  /** USD rate snapshot. Use `jobs.quote` for the exact price of one request. */
  usd: ModelUsd;
  /** @deprecated Credit-scale rate snapshot; may lose precision. Use `usd`. */
  credits: ModelCredits;
  /** JSON Schema (draft 2020-12) for `createTask.input`. Present with `includeSchema` or on `models.get`. */
  inputSchema?: Record<string, unknown>;
  version: string;
  availability: 'planned' | 'available' | 'preview' | 'maintenance';
  badges: ModelBadge[];
  relatedModels: string[];
  examples?: ModelExample[];
  updatedAt: string;
}

export interface ModelList {
  total: number;
  items: Model[];
}

export interface ModelListParams {
  modality?: Modality;
  /** Exact model creator identifier. */
  provider?: string;
  /** Exact supported task, for example `text-to-image`. */
  task?: string;
  search?: string;
  /** Include each model's input JSON Schema. */
  includeSchema?: boolean;
  /** Include validated example inputs. */
  includeExamples?: boolean;
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export interface CreateTaskParams {
  /** Model call name, for example `alibaba/z-image-turbo/text-to-image`. */
  model: ModelId;
  /** Model input, validated against the model's `inputSchema`. */
  input: Record<string, unknown>;
  /** Public HTTPS endpoint that receives the terminal task record. */
  callBackUrl?: string;
  /**
   * Signed quote from `jobs.quote` for the same request. Sending it alone confirms the quoted
   * maximum; it does not replace the `Idempotency-Key`.
   */
  quoteId?: string;
  /**
   * Confirmed USD hold: send the quote's `maxChargeUsd` (never the typical `expectedChargeUsd`).
   * Exact decimal string, up to nine decimal places, no exponent. A changed price fails with 40901.
   */
  expectedCostUsd?: USDString;
  /**
   * @deprecated Legacy name for `expectedCostUsd`. When both are sent they must match.
   */
  expectedCost?: USDString;
  /**
   * @deprecated Integer credit projection (1 credit = $0.001). It never overrides a USD amount and,
   * alone, cannot confirm fractional-cent quotes. Use `expectedCostUsd` or `quoteId`.
   */
  expectedCredits?: number;
}

export interface TaskQuote {
  quoteId: string;
  model: ModelId;
  /**
   * Exact maximum USD charge, held when the task is accepted. Send it back as
   * `expectedCostUsd` (or send `quoteId` alone) to confirm the hold.
   */
  maxChargeUsd: USDString;
  /** Typical USD charge, never above `maxChargeUsd`. Informational: do not use it to confirm a hold. */
  expectedChargeUsd: USDString;
  /** Same value as `maxChargeUsd`. */
  estimatedCost: USDString;
  /** Same value as `maxChargeUsd`. */
  maxCharge: USDString;
  /** Legacy alias of `expectedChargeUsd`. */
  expectedCharge: USDString;
  /** @deprecated Credit projection of `maxChargeUsd`, rounded up. Use `maxChargeUsd`. */
  maxCredits: number;
  /** @deprecated Credit projection of `expectedChargeUsd`, rounded up. Use `expectedChargeUsd`. */
  expectedCredits: number;
  currency: 'USD';
  quantity: string;
  unit: string;
  expiresAt: string;
}

export interface CreateTaskResponse {
  taskId: string;
  state: TaskState;
  /** Exact USD held when the task was accepted; the most this task can cost. Unused funds are released at settlement. */
  estimatedCostUsd: USDString;
  /** Same value as `estimatedCostUsd`. */
  estimatedCost: USDString;
  /** @deprecated Credit projection of the hold, rounded up. Use `estimatedCostUsd`. */
  estimatedCredits: number;
  deadlineAt: string;
}

export interface RetryTaskResponse extends CreateTaskResponse {
  sourceTaskId: string;
}

export interface TaskLayer {
  zIndex: number;
  name?: string;
  boundingBox?: [number, number, number, number];
}

export interface TaskOutputAsset {
  key?: string;
  /** Signed GET URL, valid for about 20 minutes. Never send your API key when fetching it. */
  url?: string;
  expiresAt?: string;
  mime?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  bytes?: number;
  /** `video`, `image`, `audio`, `segment` or a model-specific role. */
  role?: string;
  pending?: boolean;
  unavailable?: boolean;
  deleted?: boolean;
  layer?: TaskLayer;
  [key: string]: unknown;
}

export interface TaskTranscriptWord {
  text: string;
  start: number;
  end: number;
  type?: string;
  speakerId?: string;
}

export interface TaskTranscriptChannel {
  index: number;
  text?: string;
  language?: string;
  languageCode?: string;
  words?: TaskTranscriptWord[];
}

export interface TaskTranscript {
  text?: string;
  language?: string;
  languageCode?: string;
  languageProbability?: number;
  durationSeconds?: number;
  words?: TaskTranscriptWord[];
  channels?: TaskTranscriptChannel[];
}

export interface TaskOutput {
  /** Text result (transcription). */
  text?: string;
  transcript?: TaskTranscript;
  assets?: TaskOutputAsset[];
  [key: string]: unknown;
}

export interface TaskRetention {
  outputsExpireAt: string;
  promptsExpireAt: string;
  source: 'header' | 'account' | 'platform';
}

export interface TaskRecord {
  taskId: string;
  sourceTaskId?: string;
  model: ModelId;
  state: TaskState;
  input?: Record<string, unknown>;
  output?: TaskOutput;
  errorCode?: TaskErrorCode | (string & {});
  errorMessage?: string;
  /** Exact USD: the hold while `settled` is false, the final charge once it is true. Use it for reconciliation. */
  costUsd: USDString;
  /** Same value as `costUsd`. */
  cost: USDString;
  /** @deprecated Credit projection of `costUsd`, rounded up. Use `costUsd`. */
  credits: number;
  /** @deprecated Unrounded credit-scale decimal string (USD x 1000). Use `costUsd`. */
  exactCredits?: string;
  /** When false, `costUsd` is the hold; when true, it is the final charge. */
  settled: boolean;
  createdAt: string;
  deadlineAt?: string;
  completedAt?: string;
  contentState?: 'present' | 'expired' | 'purged';
  contentRemovedBy?: 'user' | 'system';
  purgedAt?: string;
  retention?: TaskRetention;
}

export interface TaskPurgeResponse {
  taskId: string;
  contentState: 'present' | 'expired' | 'purged';
  purgedAt?: string;
  contentRemovedBy?: 'user' | 'system';
  billingRetained: true;
  mediaDeletionPending: boolean;
}

export interface TaskListParams {
  /** Inclusive UTC date, `YYYY-MM-DD`. */
  from?: string;
  /** Exclusive UTC date, `YYYY-MM-DD`. */
  to?: string;
  state?: TaskState;
  model?: ModelId;
  /** 1 to 100, default 20. */
  limit?: number;
  /** Opaque `nextCursor` from the previous page. */
  cursor?: string;
}

export interface TaskListItem {
  taskId: string;
  requestId?: string;
  model: ModelId;
  state: TaskState;
  /** Exact USD: the final charge if settled, otherwise the current hold. */
  cost: USDString;
  /** @deprecated Credit projection of `cost`, rounded up. Use `cost`. */
  credits: number;
  /** @deprecated Unrounded credit-scale decimal string (USD x 1000). Use `cost`. */
  exactCredits?: string;
  settled: boolean;
  createdAt: string;
  deadlineAt: string;
  completedAt?: string;
}

export interface TaskList {
  items: TaskListItem[];
  hasMore: boolean;
  nextCursor?: string;
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

export interface UsageParams {
  from?: string;
  to?: string;
}

export interface UsageDay {
  day: string;
  calls: number;
  succeeded: number;
  failed: number;
  /** Settled USD spend. */
  spend: USDString;
  /** @deprecated Credit projection of `spend`, rounded up. Use `spend`. */
  credits: number;
}

export interface UsageModel {
  model: ModelId;
  calls: number;
  succeeded: number;
  failed: number;
  /** Settled USD spend. */
  spend: USDString;
  /** @deprecated Credit projection of `spend`, rounded up. Use `spend`. */
  credits: number;
}

export interface Usage {
  from: string;
  to: string;
  currency: 'USD';
  totalCalls: number;
  /** Settled USD spend over the whole range. */
  totalSpend: USDString;
  /** @deprecated Credit projection of `totalSpend`, rounded up. Use `totalSpend`. */
  totalCredits: number;
  days: UsageDay[];
  models: UsageModel[];
}

export interface FundingGrant {
  id: string;
  name: string;
  amountUsd: USDString;
  availableUsd: USDString;
  heldUsd: USDString;
  spentUsd: USDString;
  status: string;
  startsAt: string;
  expiresAt?: string | null;
  modelSlugs: string[];
  customerMemo: string;
  createdAt: string;
}

export interface CreditFacility {
  enabled: boolean;
  limitUsd: USDString;
  availableUsd: USDString;
  usedUsd: USDString;
  heldUsd: USDString;
  expiresAt?: string | null;
  status: string;
  version: number;
}

export interface FundingOverview {
  balanceUsd: USDString;
  heldUsd: USDString;
  prepaidAvailableUsd: USDString;
  grantAvailableUsd: USDString;
  cashShortfallUsd: USDString;
  credit: CreditFacility;
  grants: FundingGrant[];
  grantsHasMore: boolean;
}

/** The independent API USD balance behind the key. Website credits are separate and never count here. */
export interface Balance {
  funding?: FundingOverview;
  /** Exact USD new tasks can use now. Can be negative. */
  availableUsd: USDString;
  /** Exact USD held by accepted tasks that have not settled yet. */
  heldUsd: USDString;
  /** `availableUsd` plus `heldUsd`. */
  totalUsd: USDString;
  /** Legacy alias of `availableUsd`. */
  available: USDString;
  /** Legacy alias of `heldUsd`. */
  held: USDString;
  /** Legacy alias of `totalUsd`. */
  total: USDString;
  /** @deprecated Credit projection of `availableUsd`, truncated toward zero. Use `availableUsd`. */
  availableCredits: number;
  /** @deprecated Credit projection of `heldUsd`, rounded up. Use `heldUsd`. */
  heldCredits: number;
  /** @deprecated Sum of the two credit projections; not an exact balance. Use `totalUsd`. */
  totalCredits: number;
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export type UploadContentType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/gif'
  | 'video/mp4'
  | 'video/webm'
  | 'audio/mpeg'
  | 'audio/wav'
  | 'application/pdf'
  | 'application/msword'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'application/vnd.ms-excel'
  | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  | 'application/vnd.ms-powerpoint'
  | 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  | 'application/vnd.apple.keynote'
  | 'application/vnd.apple.pages'
  | 'application/vnd.apple.numbers'
  | 'text/plain'
  | 'text/markdown'
  | 'application/octet-stream';

export interface UploadUrlParams {
  contentType: UploadContentType;
  bytes: number;
}

export interface UploadTicket {
  fileId: string;
  /** Compatibility alias for the final URI; unusable until commit succeeds. */
  key: string;
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: string;
  maxBytes: number;
}

export interface UploadedFile {
  fileId: string;
  status: 'ready';
  bytes: number;
  contentType: string;
  sha256: string;
  /** `popnow://f/fil_...`: put this in a model's media field. */
  uri: string;
  /** When the temporary upload is removed. */
  expiresAt: string;
  durationSeconds?: string;
  width?: number;
  height?: number;
}

export interface LoraImportParams {
  /** Hugging Face repo id (`owner/repo`), a Hugging Face repo or file page, or a direct https link to a `.safetensors` file. */
  url: string;
  /** Optional Hugging Face access token or Civitai API key, used only for this download. */
  token?: string;
}

export interface DownloadUrlParams {
  taskId: string;
  /** Output key; empty selects the first output. */
  key?: string;
}

export interface DownloadUrl {
  key: string;
  url: string;
  expiresAt: string;
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

export type AssetSource = 'task_output' | 'upload' | 'url';

export interface Asset {
  id: string;
  /** Stable reference `popnow://a/ast_...`, usable in generation requests of the same workspace. */
  uri: string;
  name: string;
  kind: Modality;
  contentType: string;
  bytes: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
  source: AssetSource;
  sourceId: string;
  createdAt: string;
  updatedAt: string;
  /** Private preview signed for at most 20 minutes. Persist `uri` instead. */
  previewUrl: string;
  previewUrlExpiresAt?: string;
  favorite: boolean;
  model: string;
  modelName: string;
}

export interface AssetList {
  items: Asset[];
  /** Absent on the last page. */
  nextCursor?: string;
}

export interface AssetListParams {
  kind?: Modality;
  /** One source or several (sent comma-separated). */
  source?: AssetSource | AssetSource[];
  q?: string;
  favorite?: boolean;
  collectionId?: string;
  entityId?: string;
  sort?: 'recent' | 'oldest' | 'name' | 'size';
  cursor?: string;
  /** 1 to 100, default 100. */
  limit?: number;
}

export type AssetCreateParams =
  | { source: 'task_output'; taskId: string; key?: string; index?: number; name?: string }
  | { source: 'upload'; fileId: string; name?: string }
  | { source: 'url'; url: string; name?: string };

export interface AssetUpdateParams {
  name?: string;
  favorite?: boolean;
}

export interface AssetDeleted {
  id: string;
  deleted: true;
}

export interface AssetPlan {
  id: string;
  name: string;
  minTopupUsd: USDString;
  maxBytes: number;
  maxCount: number;
  maxFileBytes: number;
}

export interface AssetScope {
  workspaceId: string;
  personal: boolean;
  role: 'owner' | 'admin' | 'developer' | 'billing' | 'readonly';
  canWrite: boolean;
  canTopUp: boolean;
}

export interface AssetUsage {
  tier: AssetPlan;
  usage: { count: number; bytes: number };
  limits: {
    tier: string;
    maxCount: number;
    maxBytes: number;
    maxFileBytes: number;
    globalMaxBytes: number;
    nameMaxChars: number;
  };
  full: boolean;
  nextTier: AssetPlan | null;
  topupToNextTierUsd?: USDString;
  lifetimeTopupUsd?: USDString;
  tiers: AssetPlan[];
  dailyCreateLimit: number;
  createdToday: number;
  scope: AssetScope;
}

export interface Character {
  id: string;
  kind: 'character';
  name: string;
  note: string;
  coverAssetId: string;
  cover: Asset | null;
  assets: Asset[];
  count: number;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterList {
  items: Character[];
  nextCursor?: string;
}

export interface CharacterListParams {
  assetId?: string;
  cursor?: string;
  /** 1 to 100, default 50. */
  limit?: number;
}
