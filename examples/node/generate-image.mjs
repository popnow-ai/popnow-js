// Generate one image and save it to disk.
//
//   npm install github:popnow-ai/popnow-js
//   export POPNOW_API_KEY="sk-popnow-..."
//   node generate-image.mjs "A small red fox curled up in a teacup, soft morning light"
import { writeFile } from 'node:fs/promises';
import { PopNow, APIError } from 'popnow';

const popnow = new PopNow(); // reads POPNOW_API_KEY
const prompt = process.argv[2] ?? 'A small red fox curled up in a teacup, soft morning light';

try {
  // Optional: ask the price first. Nothing is held or charged.
  const params = { model: 'alibaba/z-image-turbo/text-to-image', input: { prompt } };
  const quote = await popnow.jobs.quote(params);
  console.log(`This image costs at most ${quote.maxCredits} credits`);

  // Lock in that price, wait up to 60 s on the first call, then poll until done.
  const task = await popnow.jobs.createAndWait(
    { ...params, quoteId: quote.quoteId, expectedCredits: quote.maxCredits },
    { throwOnFailure: true },
  );

  const asset = task.output?.assets?.[0];
  if (!asset?.url) throw new Error('The task finished without a downloadable file');
  // Signed links are bearer URLs: do not send your API key when downloading.
  const file = await fetch(asset.url);
  await writeFile('image.png', Buffer.from(await file.arrayBuffer()));
  console.log(`Saved image.png (${task.credits} credits, task ${task.taskId})`);
} catch (err) {
  if (err instanceof APIError) {
    console.error(`PopNow error ${err.code}: ${err.message}`);
  } else {
    console.error(err);
  }
  process.exitCode = 1;
}
