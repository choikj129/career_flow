'use server';

import { redirect } from 'next/navigation';
import { SITE_IDS } from '@/lib/domain/types';
import { enqueueJob } from '@/lib/ai/queue';
import { bulkCreateApplications } from '@/lib/applications/repo';
import { findExistingMatches, markExistingRows, type ExistingMatch } from '@/lib/applications/import-review';
import { validDate } from '@/lib/domain/dates';
import { checkedRowsSchema, existingMatchRowsSchema, existingRowsSchema, rowsToRegister, type CheckedRow } from '@/lib/applications/import-rows';
import { saveUploads } from '@/lib/uploads/store';
import { run } from './run';
import type { ActionResult } from './types';

export type ImportStartState = { error?: string; rejected?: { name: string; reason: string }[] } | null;

/** 사이트·붙여넣은 텍스트·캡처 이미지로 가져오기 작업을 큐에 넣고 진행 화면으로 이동한다. */
export async function startApplicationImportAction(
  _prev: ImportStartState,
  formData: FormData,
): Promise<ImportStartState> {
  const pastedText = String(formData.get('pastedText') ?? '').trim();
  const siteRaw = String(formData.get('site') ?? '');
  const site = (SITE_IDS as string[]).includes(siteRaw) ? siteRaw : null;
  const files: { name: string; data: Buffer }[] = [];
  for (const f of formData.getAll('images')) {
    if (!(f instanceof File) || (f.size === 0 && !f.name)) continue;
    files.push({ name: f.name, data: Buffer.from(await f.arrayBuffer()) });
  }
  if (files.length === 0 && !pastedText) return { error: '텍스트를 붙여넣거나 이미지를 올려 주세요.' };

  let saved: string[] = [];
  let rejected: { name: string; reason: string }[] = [];
  try {
    ({ saved, rejected } = saveUploads(files, 'image', 'import'));
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  if (saved.length === 0 && !pastedText) return { error: '올릴 수 있는 이미지가 없습니다.', rejected };
  const jobId = enqueueJob('import_applications', { site, pastedText, imagePaths: saved });
  const notice = rejected.length ? `&notice=${encodeURIComponent(`${rejected.length}개 파일은 제외했습니다`)}` : '';
  redirect(`/import?job=${jobId}${notice}`);
}

/** 검토 표에서 회사·지원일을 고친 뒤 "이미 있음"을 다시 판단한다. */
export async function checkExistingAction(rows: { companyName: string; appliedAt: string }[]): Promise<boolean[]> {
  const parsed = existingRowsSchema.safeParse(rows);
  if (!parsed.success) return Array.isArray(rows) ? rows.map(() => false) : [];
  return markExistingRows(parsed.data.map((r) => ({ ...r, appliedAt: validDate(r.appliedAt) ? r.appliedAt : '' })));
}

/** 직접 입력 표에서 회사·포지션·지원일을 고친 뒤 같은 기록이 있는지 다시 판단한다. */
export async function checkExistingMatchesAction(
  rows: { companyName: string; positionTitle: string; appliedAt: string }[],
): Promise<ExistingMatch[]> {
  const parsed = existingMatchRowsSchema.safeParse(rows);
  if (!parsed.success) return Array.isArray(rows) ? rows.map(() => 'none' as const) : [];
  return findExistingMatches(parsed.data.map((r) => ({ ...r, appliedAt: validDate(r.appliedAt) ? r.appliedAt : '' })));
}

export async function commitApplicationImportAction(rows: CheckedRow[]): Promise<ActionResult> {
  let count = 0;
  const r = await run(() => {
    const parsed = checkedRowsSchema.parse(rows);
    const toSave = rowsToRegister(parsed);
    if (toSave.length === 0) throw new Error('등록할 행을 선택하세요.');
    count = bulkCreateApplications(toSave);
  });
  if (!r.ok) return r;
  redirect(`/?notice=${encodeURIComponent(`${count}건을 등록했습니다`)}`);
}
