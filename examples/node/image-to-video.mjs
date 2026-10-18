// Upload a local photo and turn it into a 5-second video.
//
//   export POPNOW_API_KEY="sk-popnow-..."
//   node image-to-video.mjs ./photo.jpg "The camera slowly pushes in, leaves drift in the wind"
import { readFile, writeFile } from 'node:fs/promises';
import { PopNow } from 'popnow';

const [path = './photo.jpg', prompt = 'The camera slowly pushes in, soft wind'] = process.argv.slice(2);
const popnow = new PopNow();

// 1. Upload: ticket, PUT and commit in one call. The media type is detected from the bytes.
const file = await popnow.files.upload(await readFile(path));
console.log('Uploaded', file.uri);

// 2. Create the task. Reuse the same idempotency key if you retry after a crash.
const created = await popnow.jobs.create(
  {
    model: 'alibaba/wan-3.0/image-to-video',
    input: { image_url: file.uri, prompt, resolution: '480p', duration_seconds: 5 },
  },
  { idempotencyKey: `i2v-${file.fileId}` },
);
console.log(`Task ${created.taskId} accepted, ${created.estimatedCredits} credits held`);

// 3. Wait with backoff (video usually takes a few minutes). Ctrl-C stops waiting, not the task.
const task = await popnow.jobs.wait(created.taskId, {
  pollInterval: 10_000,
  onPoll: (t) => console.log('state:', t.state),
});
if (task.state !== 'succeeded') {
  console.error(`Task ${task.state}: ${task.errorCode} ${task.errorMessage ?? ''}`);
  process.exit(1);
}
const video = await fetch(task.output.assets[0].url);
await writeFile('video.mp4', Buffer.from(await video.arrayBuffer()));
console.log(`Saved video.mp4 (${task.credits} credits)`);
