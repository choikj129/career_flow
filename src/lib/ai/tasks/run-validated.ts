import { z } from 'zod';
import { AiError, type AiRunRequest, type AiRunner } from '@/lib/ai/runner';

function describeIssues(err: z.ZodError): string {
  return err.issues
    .slice(0, 8)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ');
}

/**
 * 실행하고 zod로 검증한다. 형식이 틀리면 같은 세션에 한 번만 다시 요청하고,
 * 그래도 틀리면 AiError('schema').
 */
export async function runValidated<T>(
  runner: AiRunner,
  req: AiRunRequest,
  schema: z.ZodType<T>,
): Promise<{ data: T; sessionId: string; usage: unknown }> {
  const first = await runner.run(req);
  const p1 = schema.safeParse(first.output);
  if (p1.success) return { data: p1.data, sessionId: first.sessionId, usage: first.usage };

  const second = await runner.run({
    ...req,
    resumeSessionId: first.sessionId,
    prompt:
      `직전 출력이 요구한 JSON 스키마와 맞지 않습니다. 문제: ${describeIssues(p1.error)}\n` +
      '같은 내용을 스키마에 맞게 고쳐서 다시 출력하세요. 원문에 없는 내용을 새로 만들지 마세요.',
  });
  const p2 = schema.safeParse(second.output);
  if (p2.success) return { data: p2.data, sessionId: second.sessionId, usage: second.usage };
  throw new AiError('schema', `AI 응답이 형식에 맞지 않습니다: ${describeIssues(p2.error)}`, second.sessionId);
}
