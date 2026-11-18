'use server';

import { redirect } from 'next/navigation';
import { enqueueJob } from '@/lib/ai/queue';
import { getLatestResume, savePreferences, saveResumeVersion } from '@/lib/resume/repo';
import { sameResume } from '@/lib/resume/compare';
import { Preferences, ResumeContent } from '@/lib/resume/schema';
import { saveUploads } from '@/lib/uploads/store';
import { run } from './run';
import type { ActionResult } from './types';

export type UploadState = { error?: string; rejected?: { name: string; reason: string }[] } | null;

/** 이력서 파일·붙여넣은 텍스트로 가져오기 작업을 큐에 넣고 진행 화면으로 이동한다. */
export async function uploadResumeFilesAction(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const pastedText = String(formData.get('pastedText') ?? '').trim();
  const files: { name: string; data: Buffer }[] = [];
  for (const f of formData.getAll('files')) {
    if (!(f instanceof File) || (f.size === 0 && !f.name)) continue;
    files.push({ name: f.name, data: Buffer.from(await f.arrayBuffer()) });
  }
  if (files.length === 0 && !pastedText) return { error: '파일을 고르거나 텍스트를 붙여넣어 주세요.' };

  let saved: string[] = [];
  let rejected: { name: string; reason: string }[] = [];
  try {
    ({ saved, rejected } = saveUploads(files, 'resume', 'resume'));
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  if (saved.length === 0 && !pastedText) {
    return { error: '올릴 수 있는 파일이 없습니다.', rejected };
  }
  const jobId = enqueueJob('import_resume', { filePaths: saved, pastedText });
  const notice = rejected.length ? `&notice=${encodeURIComponent(`${rejected.length}개 파일은 제외했습니다`)}` : '';
  redirect(`/resume?job=${jobId}${notice}`);
}

function describeIssue(path: PropertyKey[], message: string): string {
  const labels: Record<string, string> = {
    basics: '기본 정보',
    summary: '한 줄 소개',
    experiences: '경력',
    projects: '프로젝트',
    skills: '기술 스택',
    education: '학력',
    certifications: '자격증',
    careerNarrative: '경력기술서',
    portfolio: '포트폴리오',
  };
  const [head, idx] = path;
  const label = labels[String(head)] ?? String(head);
  const n = typeof idx === 'number' ? ` ${idx + 1}번째` : '';
  return `${label}${n}: ${message}`;
}

export async function saveResumeAction(content: ResumeContent, note?: string): Promise<ActionResult> {
  return run(() => {
    const parsed = ResumeContent.safeParse(content);
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      throw new Error(describeIssue(i.path, i.message));
    }
    const latest = getLatestResume();
    if (latest && sameResume(latest.content, parsed.data)) {
      throw new NoChange();
    }
    saveResumeVersion(parsed.data, note?.trim() || (latest ? undefined : '처음 등록'));
  }, '이력서를 저장했습니다').then((r) =>
    !r.ok && r.error === NO_CHANGE ? { ok: true as const, notice: NO_CHANGE } : r,
  );
}

const NO_CHANGE = '바뀐 내용이 없습니다';
class NoChange extends Error {
  constructor() {
    super(NO_CHANGE);
  }
}

export async function savePreferencesAction(p: Preferences): Promise<ActionResult> {
  return run(() => {
    savePreferences(Preferences.parse(p));
  }, '희망 조건을 저장했습니다');
}
