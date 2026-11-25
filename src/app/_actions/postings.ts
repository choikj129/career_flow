'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { assertHttpUrl } from '@/lib/domain/normalize';
import { latestJobFor } from '@/lib/ai/queue';
import {
  deletePosting,
  providePostingText,
  updatePostingInfo,
  reanalyzePosting,
  registerPosting,
} from '@/lib/postings/repo';
import { run } from './run';
import type { ActionResult } from './types';

export type RegisterState = { error?: string } | null;

export async function registerPostingAction(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  let result: { postingId: number; existing: boolean };
  const url = String(formData.get('url') ?? '').trim();
  if (url) {
    try {
      assertHttpUrl(url);
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }
  try {
    result = registerPosting({
      url,
      pastedText: String(formData.get('pastedText') ?? ''),
      siteNote: String(formData.get('siteNote') ?? ''),
      companyName: String(formData.get('companyName') ?? ''),
      positionTitle: String(formData.get('positionTitle') ?? ''),
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  const notice = result.existing ? `?notice=${encodeURIComponent('이미 등록된 공고입니다')}` : '';
  redirect(`/postings/${result.postingId}${notice}`);
}

function assertNoActiveJob(postingId: number): void {
  const job = latestJobFor('analyze_posting', () => true, undefined, { postingId, statuses: ['queued', 'running'] });
  if (job) {
    throw new Error('이미 분석이 진행 중입니다.');
  }
}

export async function provideTextAction(postingId: number, text: string): Promise<ActionResult> {
  return run(() => {
    const id = z.number().int().parse(postingId);
    if (!text.trim()) throw new Error('본문을 입력하세요.');
    assertNoActiveJob(id);
    providePostingText(id, text.trim());
  }, '분석을 시작했습니다');
}

export async function reanalyzeAction(postingId: number): Promise<ActionResult> {
  return run(() => {
    const id = z.number().int().parse(postingId);
    assertNoActiveJob(id);
    reanalyzePosting(id);
  }, '분석을 시작했습니다');
}

export async function deletePostingAction(postingId: number): Promise<ActionResult> {
  const r = await run(() => {
    deletePosting(z.number().int().parse(postingId));
  });
  if (!r.ok) return r;
  redirect(`/?notice=${encodeURIComponent('공고를 삭제했습니다')}`);
}

/** 분석한 공고 목록의 [삭제]. 상세 화면과 달리 이동하지 않고 목록에 머문다. */
export async function deletePostingFromListAction(postingId: number): Promise<ActionResult> {
  return run(() => {
    deletePosting(z.number().int().parse(postingId));
  }, '공고를 삭제했습니다');
}

/** 상세 화면 [수정]: 회사명·포지션. */
export async function updatePostingInfoAction(
  postingId: number,
  companyName: string,
  positionTitle: string,
): Promise<ActionResult> {
  return run(() => {
    updatePostingInfo(z.number().int().parse(postingId), {
      companyName: z.string().parse(companyName),
      positionTitle: z.string().parse(positionTitle),
    });
  }, '공고 정보를 고쳤습니다');
}
