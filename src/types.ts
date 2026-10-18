/**
 * Types for the PopNow API, written by hand from the public OpenAPI contract
 * (https://popnow.ai/docs/openapi). Amounts are returned twice: as integer
 * credits (1 credit = $0.01) and as exact USD decimal strings.
 */

/** Decimal USD amount encoded as a string, for example `"0.34"`. */
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

export interface ModelCreditRule {
  when: Record<string, unknown>;
  perUnit: number;
  unit?: string;
}

export interface ModelCredits {
  /** How the price scales: `per_image`, `per_second`, `per_request`... */
  unit: string;
  /** Starting price per unit, in credits. */
  perUnit: number;
  rules?: ModelCreditRule[];
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
  /** Signed quote from `jobs.quote` for the same request. */
  quoteId?: string;
  /** Confirmed amount in USD to reserve. */
  expectedCost?: USDString;
  /** Confirmed number of credits to reserve (the quote's `maxCredits`). Wins over `expectedCost`. */
  expectedCredits?: number;
}

export interface TaskQuote {
  quoteId: string;
  model: ModelId;
  estimatedCost: USDString;
  maxCharge: USDString;
  /** The most this request can cost, in credits. This amount is held on acceptance. */
  maxCredits: number;
  /** What this request usually costs, in credits. */
  expectedCredits: number;
  currency: 'USD';
  quantity: string;
  unit: string;
  expiresAt: string;
}

export interface CreateTaskResponse {
  taskId: string;
  state: TaskState;
  estimatedCost: USDString;
  /** Credits held when the task was accepted; the most this task can cost. */
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
  cost: USDString;
  /** Held amount before settlement, final charge after. */
  credits: number;
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
  cost: USDString;
  credits: number;
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
  spend: USDString;
  credits: number;
}

export interface UsageModel {
  model: ModelId;
  calls: number;
  succeeded: number;
  failed: number;
  spend: USDString;
  credits: number;
}

export interface Usage {
  from: string;
  to: string;
  currency: 'USD';
  totalCalls: number;
  totalSpend: USDString;
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

export interface Balance {
  funding?: FundingOverview;
  available: USDString;
  held: USDString;
  total: USDString;
  /** Credits you can spend now. */
  availableCredits: number;
  /** Credits held by accepted tasks that have not settled yet. */
  heldCredits: number;
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
