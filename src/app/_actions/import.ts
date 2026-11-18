'use server';

import { redirect } from 'next/navigation';
import { SITE_IDS } from '@/lib/domain/types';
import { enqueueJob } from '@/lib/ai/queue';
import { bulkCreateApplications } from '@/lib/applications/repo';
import { markExistingRows } from '@/lib/applications/import-review';
import { rowsToRegister, type CheckedRow } from '@/lib/applications/import-rows';
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
export async function checkExistingAction(
  rows: { companyName: string; appliedAt: string }[],
): Promise<boolean[]> {
  return markExistingRows(
    rows.slice(0, 500).map((r) => ({ companyName: String(r.companyName ?? ''), appliedAt: String(r.appliedAt ?? '') })),
  );
}

export async function commitApplicationImportAction(rows: CheckedRow[]): Promise<ActionResult> {
  let count = 0;
  const r = await run(() => {
    const toSave = rowsToRegister(rows);
    if (toSave.length === 0) throw new Error('등록할 행을 선택하세요.');
    count = bulkCreateApplications(toSave);
  });
  if (!r.ok) return r;
  redirect(`/?notice=${encodeURIComponent(`${count}건을 등록했습니다`)}`);
}
