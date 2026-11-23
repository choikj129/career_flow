'use server';

import { z } from 'zod';
import { buildHandoffMdForRevision, HANDOFF_NOTE_MAX } from '@/lib/tailored/handoff-data';
import {
  addExternalRevision,
  createRecipeRevision,
  EXTERNAL_MD_MAX_BYTES,
  getRevision,
  latestTailorJob,
  requestTailoredRevision,
  requestTermsMatch,
  revisionPostingId,
} from '@/lib/tailored/repo';
import { run } from './run';
import type { ActionResult } from './types';

const id = z.number().int().positive();
const recipe = z.object({
  track: z.string().min(1),
  profileId: z.string().min(1),
  adjustmentIds: z.array(z.string()),
});

/** 1단계 조립(호출 0). 바로 새 리비전이 생긴다 */
export async function createRecipeAction(input: { postingId: number; track: string; profileId: string; adjustmentIds: string[] }): Promise<ActionResult> {
  return run(() => {
    const v = recipe.extend({ postingId: id }).parse(input);
    createRecipeRevision(v.postingId, { track: v.track, profileId: v.profileId, adjustmentIds: v.adjustmentIds });
  }, '맞춤본을 만들었습니다');
}

/** 고른 리비전과 같은 직무·프로필·추가 조정으로 지금 키트에서 다시 조립한다 */
export async function rebuildWithNewKitAction(input: { postingId: number; revisionId: number }): Promise<ActionResult> {
  return run(() => {
    const v = z.object({ postingId: id, revisionId: id }).parse(input);
    const rev = getRevision(v.revisionId);
    if (!rev || revisionPostingId(rev.id) !== v.postingId) throw new Error('맞춤본을 찾을 수 없습니다');
    createRecipeRevision(v.postingId, { track: rev.track, profileId: rev.profileId, adjustmentIds: rev.adjustments.map((a) => a.id) });
  }, '새 키트로 다시 조립했습니다');
}

export async function requestTermsMatchAction(postingId: number): Promise<ActionResult> {
  return run(() => {
    requestTermsMatch(id.parse(postingId));
  }, '공고 용어 맞추기를 시작했습니다');
}

export async function requestReviseAction(postingId: number, request: string): Promise<ActionResult> {
  return run(() => {
    requestTailoredRevision(id.parse(postingId), z.string().parse(request));
  }, '다듬기를 시작했습니다');
}

/** 실패한 맞춤 작업(용어 맞추기·다듬기)을 같은 내용으로 다시 요청한다 */
export async function retryTailorJobAction(postingId: number): Promise<ActionResult> {
  return run(() => {
    const pid = id.parse(postingId);
    const last = latestTailorJob(pid);
    if (!last) throw new Error('다시 시도할 작업이 없습니다');
    if (last.type === 'tailor_resume') requestTermsMatch(pid);
    else {
      const req = (last.payload as { request?: unknown } | null)?.request;
      requestTailoredRevision(pid, typeof req === 'string' ? req : '');
    }
  }, '다시 시작했습니다');
}

export type HandoffTextResult = { ok: true; text: string } | { ok: false; error: string };

/** [요청문 복사]: 요청문 글을 돌려주면 브라우저가 클립보드에 넣는다 */
export async function handoffTextAction(revisionId: number, note: string): Promise<HandoffTextResult> {
  try {
    const v = z.object({ revisionId: id, note: z.string().max(HANDOFF_NOTE_MAX, `메모는 ${HANDOFF_NOTE_MAX}자까지 쓸 수 있습니다`) }).parse({ revisionId, note });
    const text = buildHandoffMdForRevision(v.revisionId, v.note);
    return text ? { ok: true, text } : { ok: false, error: '맞춤본을 찾을 수 없습니다' };
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? (e.issues[0]?.message ?? '입력을 확인해 주세요') : e instanceof Error ? e.message : String(e) };
  }
}

async function readMd(f: FormDataEntryValue | null, label: string): Promise<string> {
  if (!(f instanceof File) || f.size === 0) throw new Error(`${label}을 골라 주세요`);
  if (f.size > EXTERNAL_MD_MAX_BYTES) throw new Error(`${label}는 1MB까지 올릴 수 있습니다`);
  return f.text();
}

/** [결과 올리기]: 작업 공간에서 만든 이력서.md·경력기술서.md를 새 리비전("작업 공간")으로 남긴다 */
export async function uploadExternalAction(formData: FormData): Promise<ActionResult> {
  try {
    const v = recipe.extend({ postingId: id }).parse({
      postingId: Number(formData.get('postingId')),
      track: String(formData.get('track') ?? ''),
      profileId: String(formData.get('profileId') ?? ''),
      adjustmentIds: formData.getAll('adjustmentIds').map(String),
    });
    const resumeMd = await readMd(formData.get('resumeFile'), '이력서.md');
    const careerMd = await readMd(formData.get('careerFile'), '경력기술서.md');
    return await run(() => {
      addExternalRevision(v.postingId, { resumeMd, careerMd, recipe: { track: v.track, profileId: v.profileId, adjustmentIds: v.adjustmentIds }, note: String(formData.get('note') ?? '') });
    }, '작업 공간 결과를 올렸습니다');
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? '입력한 값을 확인해 주세요.' : e instanceof Error ? e.message : String(e) };
  }
}
