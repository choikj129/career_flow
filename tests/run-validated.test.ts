import { expect, test } from 'vitest';
import { z } from 'zod';
import { AiError, type AiRunRequest, type AiRunResult, type AiRunner } from '@/lib/ai/runner';
import { runValidated } from '@/lib/ai/tasks/run-validated';

const schema = z.object({ n: z.number() });
const req: AiRunRequest = { prompt: 'p', jsonSchema: {}, model: 'opus', tools: [], cwd: '.', timeoutMs: 1000 };

class Seq implements AiRunner {
  calls: AiRunRequest[] = [];
  constructor(private results: AiRunResult[]) {}
  async run(r: AiRunRequest): Promise<AiRunResult> {
    this.calls.push(r);
    return this.results[this.calls.length - 1];
  }
}
const res = (output: unknown, sessionId: string): AiRunResult => ({ output, sessionId, usage: null, durationMs: 1 });

test('TC-AI-27 세션 ID 가 없으면 재시도하지 않고 바로 schema 오류로 끝낸다', async () => {
  const runner = new Seq([res({ n: 'x' }, ''), res({ n: 1 }, '')]);
  const p = runValidated(runner, req, schema);
  await expect(p).rejects.toBeInstanceOf(AiError);
  await expect(p).rejects.toMatchObject({ kind: 'schema' });
  expect(runner.calls).toHaveLength(1);
});

test('TC-AI-27 세션 ID 가 있으면 같은 세션으로 한 번 다시 요청한다', async () => {
  const runner = new Seq([res({ n: 'x' }, 's1'), res({ n: 2 }, 's1')]);
  const r = await runValidated(runner, req, schema);
  expect(r.data).toEqual({ n: 2 });
  expect(runner.calls[1].resumeSessionId).toBe('s1');
});
