# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

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
