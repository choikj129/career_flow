'use server';

import { z } from 'zod';
import { checkClaudeHealth } from '@/lib/ai/health';
import { isBrowserBusy, openSiteLogin } from '@/lib/extract/browser';
import { clearUploads } from '@/lib/uploads/cleanup';
import { formatBytes } from '@/lib/uploads/check';
import { setModelFor, setSetting, MODEL_CHOICES } from '@/lib/settings';
import type { SiteId } from '@/lib/domain/types';
import { run } from './run';
import type { ActionResult } from './types';

export type LoginCheckResult =
  | { ok: true; loggedIn: boolean | null; message: string; checkedAt: string }
  | { ok: false; error: string };

/** [로그인 확인] 버튼을 눌렀을 때만 haiku로 짧게 호출한다. */
export async function checkLoginAction(): Promise<LoginCheckResult> {
  try {
    const h = await checkClaudeHealth({ checkLogin: true });
    const checkedAt = new Date().toISOString();
    if (h.installed && h.loggedIn !== null) {
      setSetting('claude.loginCheck', JSON.stringify({ at: checkedAt, loggedIn: h.loggedIn }));
    }
    return { ok: true, loggedIn: h.loggedIn, message: h.message, checkedAt };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const ModelSetting = z.object({
  type: z.enum(['analyze_posting', 'import_resume', 'import_applications']),
  model: z.enum(MODEL_CHOICES),
});

export async function setModelAction(type: string, model: string): Promise<ActionResult> {
  return run(() => {
    const v = ModelSetting.parse({ type, model });
    setModelFor(v.type, v.model);
  }, '모델을 저장했습니다');
}

const LOGIN_SITES = ['remember', 'wanted', 'groupby', 'jobkorea'] as const;

export async function openSiteLoginAction(site: string): Promise<ActionResult> {
  const id = z.enum(LOGIN_SITES).safeParse(site);
  if (!id.success) return { ok: false, error: '로그인 창을 열 수 없는 사이트입니다.' };
  if (isBrowserBusy()) return { ok: false, error: '브라우저를 사용 중입니다. 분석 작업이 끝난 뒤 시도하세요.' };
  try {
    await openSiteLogin(id.data as SiteId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  return { ok: true, notice: '브라우저 창이 열렸습니다. 로그인한 뒤 창을 닫으세요' };
}

/** 올린 이력서·캡처 원본을 지운다. 이미 저장한 이력서와 지원 기록은 그대로다. */
export async function clearUploadsAction(): Promise<ActionResult> {
  let done = { count: 0, bytes: 0 };
  const r = await run(() => {
    done = clearUploads();
  });
  if (!r.ok) return r;
  return { ok: true, notice: `올린 파일 ${done.count}개(${formatBytes(done.bytes)})를 지웠습니다` };
}
