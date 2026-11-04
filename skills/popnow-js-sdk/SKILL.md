---
name: popnow-js-sdk
description: Integrate the PopNow TypeScript/JavaScript SDK (npm package popnow, JSR @popnow/popnow) into Node.js, Deno, Bun or server code - generate AI images, videos, music and speech with quote-then-create pricing, idempotency keys, waiting, uploads and webhook verification. Use when writing or reviewing code that calls the PopNow API from JavaScript or TypeScript.
---

# PopNow TypeScript SDK

## Install

```bash
npm install popnow
export POPNOW_API_KEY="sk-popnow-..."
```

Deno and Bun: `deno add jsr:@popnow/popnow` or `npx jsr add @popnow/popnow`. Keep the key server-side in an environment variable or secret store; never ship it to a browser bundle (use a server route or the `popnow-proxy` project instead).

## Quick generation

```ts
import { PopNow } from 'popnow';

const popnow = new PopNow(); // reads POPNOW_API_KEY

const task = await popnow.jobs.createAndWait({
  model: 'alibaba/z-image-turbo/text-to-image',
  input: { prompt: 'A small red fox curled up in a teacup, soft morning light' },
});
console.log(task.state, task.costUsd, task.output?.assets?.[0]?.url);
```

`output.assets[].url` is a signed link valid for about 20 minutes. Store the `taskId`, not the link.

## Quote first, then lock the price

```ts
const params = { model: 'alibaba/wan-3.0/image-to-video', input: { image_url, resolution: '720p', duration_seconds: 5 } };
const quote = await popnow.jobs.quote(params); // nothing is held
await popnow.jobs.create({ ...params, quoteId: quote.quoteId, expectedCostUsd: quote.maxChargeUsd });
```

Confirm with `maxChargeUsd` (the amount held), not the typical `expectedChargeUsd`. A changed price or an expired quote (five minutes) fails with `ConflictError` code 40901 and holds nothing. Money amounts are exact decimal strings: do not convert them through floating point.

## Create, then wait

```ts
const created = await popnow.jobs.create(
  { model: 'alibaba/wan-3.0/image-to-video', input: { image_url, prompt, resolution: '480p', duration_seconds: 5 } },
  { idempotencyKey: 'order-8814-render-1' }, // reuse on every retry of the same work
);
const task = await popnow.jobs.wait(created.taskId, { onPoll: (t) => console.log(t.state) });
```

`wait` returns the terminal record whatever its state (`succeeded`, `failed`, `expired`); pass `throwOnFailure: true` to get a `TaskFailedError` instead.

## Uploads, balance, lists

```ts
const file = await popnow.files.upload(await readFile('reference.png'));
await popnow.jobs.create({ model: 'google/nano-banana-2.1/edit', input: { prompt: 'Make it night', image_urls: [file.uri] } });
const balance = await popnow.account.balance(); // availableUsd, heldUsd, totalUsd
for await (const item of popnow.jobs.listAll({ model: 'alibaba/wan-3.0/image-to-video' })) { /* ... */ }
```

## Webhooks

```ts
import { verifyWebhook } from 'popnow';

const event = await verifyWebhook({ payload: await request.text(), headers: request.headers, secret: process.env.POPNOW_WEBHOOK_SECRET! });
```

Pass the raw body. Deduplicate on `event.request_id`.

## Choosing models

Model paths look like `provider/model/task`, for example `google/nano-banana-2.1/text-to-image` or `bytedance/seedance-2.5/image-to-video`. Fetch the current list and input schemas from the API (or https://popnow.ai/api/pricing) instead of hard-coding guesses.

Docs: https://popnow.ai/docs · SDK source: https://github.com/popnow-ai/popnow-js · Support: support@popnow.ai
