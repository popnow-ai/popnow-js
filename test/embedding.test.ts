import { expect, it } from 'vitest';
import { client, envelope, mockFetch, taskRecord } from './helpers.js';
it('retains vectors and measured usage when a successful task has no media assets', async () => {
 const embeddings = {data:[{index:0,embedding:[0.25,-0.5]}],inputTokens:7};
 const {fetch} = mockFetch(envelope(taskRecord({model:'openai/text-embedding-3-small/embedding',output:{embeddings}})));
 const result = await client(fetch).jobs.get('job_1');
 expect(result.output?.embeddings).toEqual(embeddings);
 expect(result.output?.assets).toBeUndefined();
});
