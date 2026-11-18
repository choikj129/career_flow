import { refresh } from 'next/cache';
import { ZodError } from 'zod';
import type { ActionResult } from './types';

/**
 * 서버 액션 본문을 실행하고 결과를 ActionResult로 바꾼다.
 * 저장소가 던지는 한국어 예외 메시지는 화면에 그대로 보여 준다.
 * redirect()는 이 안에서 부르지 말고 run 밖에서 부른다(예외로 동작하기 때문).
 */
export async function run(fn: () => void | Promise<void>, notice?: string): Promise<ActionResult> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof ZodError) return { ok: false, error: '입력한 값을 확인해 주세요.' };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  refresh();
  return { ok: true, notice };
}
