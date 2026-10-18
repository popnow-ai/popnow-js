// Next.js App Router route handler: app/api/popnow-webhook/route.ts
//
// Receives the task callback sent to `callBackUrl` and verifies its signature.
// Set POPNOW_WEBHOOK_SECRET from the Webhooks page of the API console.
import { verifyWebhook, WebhookVerificationError } from 'popnow';

export async function POST(request: Request) {
  // Read the raw body: the signature covers the exact bytes, not re-serialised JSON.
  const payload = await request.text();
  try {
    const event = await verifyWebhook({
      payload,
      headers: request.headers,
      secret: process.env.POPNOW_WEBHOOK_SECRET!,
    });

    // `request_id` is the delivery id and stays the same across retries: store it with a
    // unique index and skip repeats. Acknowledge fast; do slow work in a background job.
    const task = event.data;
    console.log(event.request_id, task.taskId, task.state, task.output?.assets?.[0]?.url);
    return new Response(null, { status: 200 });
  } catch (err) {
    if (err instanceof WebhookVerificationError) return new Response(null, { status: 401 });
    throw err;
  }
}
