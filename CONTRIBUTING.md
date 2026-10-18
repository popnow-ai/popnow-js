# Contributing

Thanks for helping improve the PopNow JavaScript / TypeScript SDK.

1. Fork the repository and create a branch.
2. `npm ci`, then make your change.
3. Run `npm run typecheck && npm test && npm run build && npm run smoke`. Tests use a mocked `fetch`
   and never call the live API.
4. Open a pull request that explains what changed and why.

Guidelines:

- Keep the package free of runtime dependencies; it must work on Node.js 18+, Deno, Bun, Cloudflare
  Workers and browsers.
- Follow the public API contract at [popnow.ai/docs/openapi](https://popnow.ai/docs/openapi). Do not add
  endpoints or fields that are not documented there.
- Add a test for every behaviour change and a line to `CHANGELOG.md`.

For questions about the API itself (accounts, billing, models), contact [PopNow support](https://popnow.ai/contact).
