# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-11-01

The PopNow API bills in USD from its own API balance, separate from website credits. This release moves the SDK
to the USD fields. Nothing is removed: the credit fields are still typed and returned, but deprecated.

### Added

- `TaskQuote.maxChargeUsd` (the exact hold) and `expectedChargeUsd` (typical charge), plus the `expectedCharge` alias.
- `CreateTaskParams.expectedCostUsd`: confirm a quote by sending its `maxChargeUsd` (or send `quoteId` alone).
- `CreateTaskResponse.estimatedCostUsd`, `TaskRecord.costUsd`, and `Balance.availableUsd`, `heldUsd` and `totalUsd`.
- `Model.usd`: USD rate snapshot (`ModelUsd`, `ModelUsdRule`, `ModelUsdBlocks`, `ModelUsdLongContext`) with exact
  decimal string amounts.
- Typed the deprecated `exactCredits` field on task records and task list items.

### Deprecated

- Credit fields: `maxCredits`, `expectedCredits` (quote and request), `estimatedCredits`, `credits`, `exactCredits`,
  `availableCredits`, `heldCredits`, `totalCredits`, usage `credits` / `totalCredits`, `Model.credits`
  (`ModelCredits`, `ModelCreditRule`) and the `expectedCost` request alias. Use the USD fields instead.

### Changed

- README, examples and `llms.txt` use USD amounts, the API balance and API billing links, and point to the
  developer MCP server (`popnow.ai/api/mcp`, `popnow-ai/popnow-api-mcp`) and developer skills (`popnow.ai/api/skills`).

## [0.1.0] - 2026-10-19

### Added

- `PopNow` client with `apiKey` (defaults to `POPNOW_API_KEY`), `baseURL`, `timeout`, `maxRetries`,
  `language` and custom `fetch`.
- Tasks: `quote`, `create` (with `wait`, retention and idempotency keys), `get`, `list`, `listAll`,
  `retry`, `purge`, `wait` (backoff and `AbortSignal`) and `createAndWait`.
- Models: `list` and `get`.
- Files: `upload` (ticket, PUT, commit), `createUploadUrl`, `commit`, `import` for LoRA weights and `downloadUrl`.
- Assets: `create`, `list`, `listAll`, `get`, `update`, `delete`, `usage`, `characters.list` and `characters.get`.
- Account: `balance` and `usage`.
- Typed errors mapped from the response envelope, with `code`, `status`, `requestId` and `reason`.
- Automatic retries for connection errors, timeouts, 429, 500, 503 and 50301, honouring `Retry-After`.
- Webhook helpers `verifyWebhook` and `verifyStandardWebhook` built on Web Crypto.
- ESM and CommonJS builds with type definitions; zero runtime dependencies.
