// Next.js App Router route handler: app/api/generate/route.ts
//
// POST /api/generate  { "prompt": "..." }  -> { taskId }
// GET  /api/generate?taskId=job_...        -> { state, url }
//
// The API key stays on the server (POPNOW_API_KEY in .env.local). Never import the
// PopNow client into a client component.
import { PopNow, APIError } from 'popnow';

const popnow = new PopNow();

export async function POST(request: Request) {
  const { prompt } = (await request.json()) as { prompt?: string };
  if (!prompt) return Response.json({ error: 'prompt is required' }, { status: 400 });

  try {
    const task = await popnow.jobs.create(
      {
        model: 'alibaba/z-image-turbo/text-to-image',
        input: { prompt },
        // Optional: let PopNow call you back instead of polling (see ../popnow-webhook/route.ts).
        callBackUrl: process.env.POPNOW_CALLBACK_URL,
      },
      { wait: 20 },
    );
    return Response.json({ taskId: task.taskId, state: task.state });
  } catch (err) {
    if (err instanceof APIError) {
      // Branch on the business code, never on the message text.
      const status = err.code === 40201 ? 402 : err.status;
      return Response.json({ error: err.message, code: err.code }, { status });
    }
    throw err;
  }
}

export async function GET(request: Request) {
  const taskId = new URL(request.url).searchParams.get('taskId');
  if (!taskId) return Response.json({ error: 'taskId is required' }, { status: 400 });
  const task = await popnow.jobs.get(taskId);
  return Response.json({
    state: task.state,
    url: task.output?.assets?.[0]?.url ?? null,
    errorCode: task.errorCode ?? null,
  });
}
