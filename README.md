<p align="center">
  <a href="https://popnow.ai">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="assets/popnow-wordmark-dark.png">
      <source media="(prefers-color-scheme: light)" srcset="assets/popnow-wordmark.png">
      <img alt="PopNow" src="assets/popnow-wordmark.png" width="280">
    </picture>
  </a>
</p>

<h1 align="center">PopNow JavaScript / TypeScript SDK — AI Video, Image &amp; Music Generation API</h1>

<p align="center">
  <strong><code>popnow</code> is the official TypeScript SDK for the PopNow API</strong>, a single API for
  AI video, image, music and speech generation with models such as Kling, Seedance, Wan, Vidu, MiniMax,
  Nano Banana, GPT Image, Flux and Suno.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/language-TypeScript-3178c6.svg">
  <img alt="Zero dependencies" src="https://img.shields.io/badge/dependencies-0-brightgreen.svg">
  <img alt="Node 18+" src="https://img.shields.io/badge/node-%3E%3D18-339933.svg">
  <a href="https://popnow.ai"><img alt="Website" src="https://img.shields.io/badge/site-popnow.ai-ff5c8a.svg"></a>
  <a href="https://popnow.ai/docs"><img alt="Docs" src="https://img.shields.io/badge/docs-popnow.ai%2Fdocs-111.svg"></a>
</p>

PopNow is a browser-based AI studio for videos, images and music: image-to-video, text-to-video, AI images,
music and speech, one-tap trending video effects and image styles. This SDK gives Node.js, Deno, Bun,
Cloudflare Workers and edge runtimes typed access to the same models, prices and credit wallet as
[popnow.ai](https://popnow.ai). It has **zero runtime dependencies** and uses the global `fetch`.

## Quickstart

**1. Install** and create an API key at [popnow.ai/api/console/keys](https://popnow.ai/api/console/keys):

```bash
npm install popnow
export POPNOW_API_KEY="sk-popnow-..."
```

Also on [JSR](https://jsr.io/@popnow/popnow) for Deno and Bun: `deno add jsr:@popnow/popnow` or `npx jsr add @popnow/popnow`.

**2. Generate** an image (a fast model, about 10 credits):

```ts
import { PopNow } from 'popnow';

const popnow = new PopNow(); // reads POPNOW_API_KEY

const task = await popnow.jobs.createAndWait({
  model: 'alibaba/z-image-turbo/text-to-image',
  input: { prompt: 'A small red fox curled up in a teacup, soft morning light' },
});
```

**3. Use the result.** `output.assets[0].url` is a signed link that works for about 20 minutes:

```ts
console.log(task.state, task.credits, task.output?.assets?.[0]?.url);
```

## Features

| Area | What the SDK does |
| --- | --- |
| Tasks | `quote`, `create`, `get`, `list` / `listAll`, `retry`, `purge`, `wait` (backoff + `AbortSignal`), `createAndWait` |
| Models | `list` (filter by modality, provider, task, search; optional input schemas and examples) and `get` |
| Files | `upload` a `Blob`, `File`, `Buffer`, `Uint8Array` or `ArrayBuffer` (ticket, PUT, commit in one call), `import` LoRA weights from a link, `downloadUrl` |
| Assets | Long-term asset library: `create`, `list` / `listAll`, `get`, `update`, `delete`, `usage`, `characters.list` / `characters.get` |
| Account | `balance()` and `usage()` in credits and USD |
| Reliability | Automatic retries for connection errors, timeouts, `429`, `500`, `503`, `50301` with `Retry-After`; an `Idempotency-Key` is always sent on task creation so retries never charge twice |
| Errors | Typed error classes from the `{code,msg,data,request_id}` envelope, with `code`, `status`, `requestId` and `reason` |
| Webhooks | `verifyWebhook` (task callbacks) and `verifyStandardWebhook` (account endpoints), using Web Crypto |
| Runtimes | Node.js 18+, Deno, Bun, Cloudflare Workers, Vercel / Next.js edge and Node runtimes; ESM and CommonJS builds with type definitions |

### Supported models

Every image, video and audio model on PopNow is callable with the same `jobs.create` call. A model ID is
`<maker>/<model>/<task>`. A few examples:

| Kind | Example model IDs |
| --- | --- |
| Image to video | `alibaba/wan-3.0/image-to-video`, `kling/3.0/image-to-video`, `bytedance/seedance-2.0/image-to-video`, `minimax/h3/image-to-video`, `vidu/q3/image-to-video` |
| Text to video | `kling/3.0/text-to-video`, `bytedance/seedance-2.0/text-to-video`, `alibaba/wan-3.0/text-to-video` |
| Text to image | `alibaba/z-image-turbo/text-to-image`, `google/nano-banana-2.1/text-to-image`, `openai/gpt-image-2/text-to-image`, `black-forest-labs/flux-2-pro/text-to-image` |
| Image editing | `google/nano-banana-2.1/edit`, `bytedance/seedream-5.0-pro/edit`, `popnow/background-remover-v1/edit` |
| Music and speech | `suno/v6/text-to-audio`, `minimax/music-3.0/text-to-audio`, `google/gemini-3.8-flash-tts/text-to-speech` |

The live list, prices and input schemas come from `popnow.models.list()` or
[popnow.ai/docs/models](https://popnow.ai/docs/models).

## Usage

### Configuration

```ts
const popnow = new PopNow({
  apiKey: process.env.POPNOW_API_KEY, // default
  baseURL: 'https://api.popnow.ai',   // default (or POPNOW_BASE_URL)
  timeout: 60_000,                    // per attempt, in ms
  maxRetries: 2,                      // connection errors, timeouts, 429, 500, 503, 50301
  language: 'en',                     // Accept-Language for error messages; codes never change
});
```

Every method takes a last `options` argument with `signal`, `timeout`, `maxRetries` and `headers`.

### Create a video from an image

```ts
const created = await popnow.jobs.create(
  {
    model: 'alibaba/wan-3.0/image-to-video',
    input: {
      image_url: 'https://media.popnow.ai/movie/lighthouse.webp',
      prompt: 'Waves roll in slowly, the camera drifts toward the lighthouse',
      resolution: '480p',
      duration_seconds: 5,
    },
    callBackUrl: 'https://your-app.example.com/hooks/popnow', // optional
  },
  { idempotencyKey: 'order-8814-render-1' },
);
// created: { taskId, state: 'queued', estimatedCredits, estimatedCost, deadlineAt }

const controller = new AbortController();
const task = await popnow.jobs.wait(created.taskId, {
  signal: controller.signal, // stops waiting; the task keeps running
  pollInterval: 10_000,      // grows x1.5 up to maxPollInterval (15 s)
  onPoll: (t) => console.log(t.state),
});
```

`wait` returns the terminal record whatever its state (`succeeded`, `failed`, `expired`). Pass
`throwOnFailure: true` to get a `TaskFailedError` instead. Unknown states are treated as still running.

### Quote first, then lock the price

```ts
const params = { model: 'alibaba/wan-3.0/image-to-video', input: { image_url, resolution: '720p', duration_seconds: 5 } };
const quote = await popnow.jobs.quote(params); // nothing is held
console.log(`At most ${quote.maxCredits} credits`);
await popnow.jobs.create({ ...params, quoteId: quote.quoteId, expectedCredits: quote.maxCredits });
// A changed price or an expired quote fails with ConflictError code 40901.
```

### Upload your own files

```ts
import { readFile } from 'node:fs/promises';

const file = await popnow.files.upload(await readFile('reference.png')); // type detected from the bytes
// or: await popnow.files.upload(blob)  /  { contentType: 'video/mp4' }
await popnow.jobs.create({ model: 'google/nano-banana-2.1/edit', input: { prompt: 'Make it night', image_urls: [file.uri] } });
```

Uploads are temporary. To reuse a file for a long time, save it to the asset library:

```ts
const asset = await popnow.assets.create({ source: 'task_output', taskId: task.taskId, index: 0, name: 'Hero shot' });
// asset.uri === 'popnow://a/ast_...' works in any matching media field
```

LoRA weights can be imported from a Hugging Face repo or a direct link:

```ts
const lora = await popnow.files.import({ url: 'your-name/your-lora-repo', token: process.env.HF_TOKEN });
await popnow.jobs.create({
  model: 'alibaba/qwen-image-2.1-lora/text-to-image',
  input: { prompt: 'A cozy reading nook in watercolor style', loras: [{ path: lora.uri, scale: 1 }] },
});
```

### Lists and pagination

```ts
const page = await popnow.jobs.list({ state: 'failed', from: '2026-10-01', limit: 50 });
for await (const item of popnow.jobs.listAll({ model: 'alibaba/wan-3.0/image-to-video' })) {
  console.log(item.taskId, item.state, item.credits);
}
```

### Balance and usage

```ts
const balance = await popnow.account.balance(); // availableCredits, heldCredits, totalCredits
const usage = await popnow.account.usage({ from: '2026-10-01', to: '2026-10-16' });
```

### Error handling

Errors carry the business `code` (branch on it, never on the message), the HTTP `status`, the
`requestId` to quote to support, and `reason` when the API adds a machine-readable `data.reason`.

```ts
import { APIError, PaymentRequiredError, RateLimitError, TaskFailedError } from 'popnow';

try {
  await popnow.jobs.createAndWait(params, { throwOnFailure: true });
} catch (err) {
  if (err instanceof PaymentRequiredError) {
    // 40201: not enough credits, 40202: a key spend cap was reached
  } else if (err instanceof RateLimitError) {
    console.log('retry after', err.retryAfter, 'seconds');
  } else if (err instanceof TaskFailedError) {
    console.log(err.errorCode, err.task.errorMessage); // e.g. content_rejected
  } else if (err instanceof APIError) {
    console.log(err.code, err.status, err.requestId, err.reason);
  }
}
```

| Class | HTTP | Business codes |
| --- | --- | --- |
| `BadRequestError` | 400 | `400`, `40003`, `40004` |
| `AuthenticationError` | 401 | `401` |
| `PaymentRequiredError` | 402 | `40201`, `40202` |
| `PermissionDeniedError` | 403 | `403`, `40301`, `40302`, `40303`, `40310` |
| `NotFoundError` | 404 | `404` |
| `ConflictError` | 409 | `409`, `40901` |
| `PayloadTooLargeError` | 413 | `413` |
| `RateLimitError` | 429 | `429` |
| `InternalServerError` | 5xx | `500` |
| `ServiceUnavailableError` | 503 | `503`, `50301`, `50302` |
| `APIConnectionError` / `APITimeoutError` | — | no response |
| `APIUserAbortError` | — | your `AbortSignal` fired |
| `WaitTimeoutError`, `TaskFailedError`, `WebhookVerificationError` | — | SDK helpers |

### Webhooks

Task callbacks (`callBackUrl`) are signed with your account webhook secret:
`base64(HMAC-SHA256(secret, "<taskId>.<timestamp>.<sha256_hex(raw_body)>"))`. Pass the **raw** body.

```ts
import { verifyWebhook } from 'popnow';

export async function POST(request: Request) {
  const event = await verifyWebhook({
    payload: await request.text(),
    headers: request.headers,
    secret: process.env.POPNOW_WEBHOOK_SECRET!,
  }); // throws WebhookVerificationError; rejects timestamps older than 5 minutes
  // event.request_id is the delivery id (dedupe on it); event.data is the task record
  return new Response(null, { status: 200 });
}
```

Account endpoints use the Standard Webhooks format: `verifyStandardWebhook({ payload, headers, secret: 'whsec_...' })`
returns `{ type, data: { object: TaskRecord } }`.

### Browsers

Do not ship your API key to a browser: anyone who opens the page can read it and spend your credits.
The client prints a warning when it runs in a browser. Call PopNow from your own server (for example
a Next.js route handler) and pass `dangerouslyAllowBrowser: true` only for local experiments.

### Examples

- [`examples/node/generate-image.mjs`](examples/node/generate-image.mjs): quote, generate and save an image.
- [`examples/node/image-to-video.mjs`](examples/node/image-to-video.mjs): upload a photo and animate it.
- [`examples/nextjs/app/api/generate/route.ts`](examples/nextjs/app/api/generate/route.ts): a Next.js route handler that creates and reads tasks.
- [`examples/nextjs/app/api/popnow-webhook/route.ts`](examples/nextjs/app/api/popnow-webhook/route.ts): a verified webhook receiver.

## FAQ

### How do I generate a video from an image with an API?

Upload the image (`popnow.files.upload`) or pass a public HTTPS URL, then call
`popnow.jobs.create({ model: 'alibaba/wan-3.0/image-to-video', input: { image_url, prompt, duration_seconds: 5 } })`
and `popnow.jobs.wait(taskId)`. Video usually takes a few minutes, so use `wait` or a webhook.

### How do I call Kling, Seedance or Nano Banana from Node.js?

Install the SDK (`npm install popnow`), set `POPNOW_API_KEY`, and pass the model ID, for example `kling/3.0/text-to-video`,
`bytedance/seedance-2.0/image-to-video` or `google/nano-banana-2.1/edit`. All models share one request shape.

### How much does the PopNow API cost?

The API spends the same credits as popnow.ai (1 credit = $0.001), with no subscription; failed tasks are
refunded. Call `popnow.jobs.quote(params)` for the exact price of one request, or see
[popnow.ai/pricing](https://popnow.ai/pricing).

### Does the SDK work on Cloudflare Workers, Deno, Bun and the Next.js edge runtime?

Yes. It has no dependencies and only uses `fetch`, `AbortController` and Web Crypto, so it runs anywhere
those exist. Pass `apiKey` explicitly where there is no `process.env`.

### How do I avoid paying twice when a request times out?

`jobs.create` always sends an `Idempotency-Key`, and the SDK reuses it on its own retries. For retries
across process restarts, pass your own key derived from your job ID, such as `order-8814-render-1`.

### How do I verify PopNow webhook signatures in JavaScript?

Use `verifyWebhook({ payload: rawBody, headers, secret })` for task callbacks or `verifyStandardWebhook`
for account endpoints. Always pass the raw request body, not parsed JSON.

### Can I use the OpenAI SDK instead?

For video, PopNow also exposes an OpenAI-compatible `/v1/videos` API: set the OpenAI SDK's `baseURL` to
`https://api.popnow.ai/v1`. This SDK covers the full native API (images, audio, uploads, assets, quotes).

## Links

- Website: [popnow.ai](https://popnow.ai) · Pricing: [popnow.ai/pricing](https://popnow.ai/pricing)
- Docs: [popnow.ai/docs](https://popnow.ai/docs) · API reference: [popnow.ai/docs/openapi](https://popnow.ai/docs/openapi) · [llms.txt](https://popnow.ai/llms.txt)
- MCP server for AI assistants: [popnow.ai/mcp](https://popnow.ai/mcp)
- Other PopNow repositories:
  [popnow-mcp](https://github.com/popnow-ai/popnow-mcp) ·
  [popnow-skills](https://github.com/popnow-ai/popnow-skills) ·
  [popnow-python](https://github.com/popnow-ai/popnow-python) ·
  [popnow-js](https://github.com/popnow-ai/popnow-js) ·
  [popnow-api](https://github.com/popnow-ai/popnow-api) ·
  [popnow-blender](https://github.com/popnow-ai/popnow-blender)

## License

[MIT](LICENSE) © PopNow
