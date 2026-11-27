'use server';

import { z } from 'zod';
import { regenerateBookmarkletToken } from '@/lib/bookmarklet/token';
import type { ReceiveResult } from '@/lib/bookmarklet/payload';
import { receiveFromBookmarklet } from '@/lib/postings/receive';
import { run } from './run';
import type { ActionResult } from './types';

const ReceiveInput = z.object({
  token: z.string().max(100),
  url: z.string().max(2_000),
  title: z.string().max(1_000),
  // 서버에서 다시 5만 자로 자른다. 여기서는 터무니없이 큰 입력만 막는다.
  text: z.string().max(200_000),
  cut: z.boolean(),
});

/**
 * 북마크 버튼이 보낸 공고를 받는다. 검사 실패·예외는 값으로 돌려주고 던지지 않는다.
 * 입력(확인 값)은 로그에 남기지 않는다.
 */
export async function receiveBookmarkletAction(input: unknown): Promise<ReceiveResult> {
  const parsed = ReceiveInput.safeParse(input);
  if (!parsed.success) return { kind: 'error', message: '받은 값의 형식이 맞지 않습니다.' };
  try {
    return receiveFromBookmarklet(parsed.data);
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : '알 수 없는 오류가 났습니다.' };
  }
}

/** 설정 > 북마크 버튼 [새로 만들기]. 예전 버튼은 그 순간부터 확인 후 등록으로 떨어진다. */
export async function regenerateBookmarkletTokenAction(): Promise<ActionResult> {
  return run(() => {
    regenerateBookmarkletToken();
  }, '북마크 버튼을 새로 만들었습니다. 북마크바의 버튼을 바꾸세요');
}
