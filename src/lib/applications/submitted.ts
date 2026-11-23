import { docFileOf, docLabel, pickDocFile, type DocFile, type SubmittedDocs } from '@/lib/documents/files';
import type { SubmittedResume } from '@/lib/domain/types';

// 지원 기록의 제출 서류(D-23 a). 순수 함수라 클라이언트 컴포넌트에서도 쓴다. DB·파일 시스템을 import하지 않는다.

export type ResumeChoice =
  | { kind: 'tailored'; tailoredRevisionId: number }
  | { kind: 'kit'; kitId: number; track: string } // 기본 서류 그대로. 프로필 = 그 직무의 기본 프로필
  | { kind: 'file'; fileName: string }
  | { kind: 'unknown' }
  | { kind: 'base'; versionId: number }; // 예전 기록 유지 전용. 새로 고를 수 없다

/** 이력서 칸 + 경력기술서·포트폴리오 값(파일 이름 | DOC_NONE | null=모름) */
export type SubmittedInput = { resume: ResumeChoice; career: string | null; portfolio: string | null };

export function encodeResumeChoice(c: ResumeChoice): string {
  switch (c.kind) {
    case 'tailored':
      return `tailored:${c.tailoredRevisionId}`;
    case 'kit':
      return `kit:${c.kitId}:${c.track}`;
    case 'file':
      return `file:${c.fileName}`;
    case 'unknown':
      return 'unknown';
    case 'base':
      return `base:${c.versionId}`;
  }
}

const posInt = (s: string): number | null => (/^[1-9]\d*$/.test(s) ? Number(s) : null);

export function decodeResumeChoice(s: string): ResumeChoice | null {
  if (s === 'unknown') return { kind: 'unknown' };
  const i = s.indexOf(':');
  if (i < 0) return null;
  const head = s.slice(0, i);
  const rest = s.slice(i + 1);
  if (head === 'tailored') {
    const id = posInt(rest);
    return id == null ? null : { kind: 'tailored', tailoredRevisionId: id };
  }
  if (head === 'base') {
    const id = posInt(rest);
    return id == null ? null : { kind: 'base', versionId: id };
  }
  if (head === 'file') return rest ? { kind: 'file', fileName: rest } : null;
  if (head === 'kit') {
    const j = rest.indexOf(':');
    if (j < 0) return null;
    const kitId = posInt(rest.slice(0, j));
    const track = rest.slice(j + 1);
    return kitId == null || !track ? null : { kind: 'kit', kitId, track };
  }
  return null;
}

/** 지금 기록 값 → 선택 값 */
export function currentSubmitted(sr: SubmittedResume, docs: SubmittedDocs | null): SubmittedInput {
  const career = docs?.career ?? null;
  const portfolio = docs?.portfolio ?? null;
  switch (sr.kind) {
    case 'tailored':
      return { resume: { kind: 'tailored', tailoredRevisionId: sr.tailoredRevisionId }, career, portfolio };
    case 'kit':
      return { resume: { kind: 'kit', kitId: sr.kitId, track: sr.track }, career, portfolio };
    case 'base':
      return { resume: { kind: 'base', versionId: sr.versionId }, career, portfolio };
    default: {
      const f = docFileOf(docs?.resume);
      return { resume: f ? { kind: 'file', fileName: f } : { kind: 'unknown' }, career, portfolio };
    }
  }
}

/**
 * [지원 완료] 기본값. 이력서: 최신 맞춤 리비전(작업 공간 결과 포함) → (키트가 있으면) 추천 직무의 기본 서류
 * → 지원일 기준 이력서 파일 → 모름. 경력기술서·포트폴리오: 지원일 기준 파일 / 없음 / 모름.
 */
export function defaultSubmitted(i: {
  appliedAt: string;
  files: DocFile[];
  latestRevisionId: number | null;
  kit: { id: number; track: string } | null;
}): SubmittedInput {
  const resumeFile = pickDocFile('resume', i.appliedAt, i.files);
  const resume: ResumeChoice =
    i.latestRevisionId != null
      ? { kind: 'tailored', tailoredRevisionId: i.latestRevisionId }
      : i.kit
        ? { kind: 'kit', kitId: i.kit.id, track: i.kit.track }
        : resumeFile
          ? { kind: 'file', fileName: resumeFile }
          : { kind: 'unknown' };
  return {
    resume,
    career: pickDocFile('career', i.appliedAt, i.files),
    portfolio: pickDocFile('portfolio', i.appliedAt, i.files),
  };
}

/**
 * 칸에 쓸 값. file·unknown은 가져온 기록(prevKind 'imported')이면 종류를 imported로 둔다.
 * kit이면 ctx.kitProfile(그 직무의 기본 프로필)이 있어야 한다.
 */
export function toColumns(
  input: SubmittedInput,
  ctx: { prevKind?: SubmittedResume['kind']; kitProfile?: { profileId: string; profileName: string } } = {},
): { submittedResume: SubmittedResume; submittedDocs: SubmittedDocs } {
  const r = input.resume;
  const plain = ctx.prevKind === 'imported' ? 'imported' : 'file';
  let submittedResume: SubmittedResume;
  let resume: string | null = null;
  switch (r.kind) {
    case 'tailored':
      submittedResume = { kind: 'tailored', tailoredRevisionId: r.tailoredRevisionId };
      break;
    case 'kit':
      if (!ctx.kitProfile) throw new Error('기본 서류의 프로필을 찾을 수 없습니다');
      submittedResume = { kind: 'kit', kitId: r.kitId, track: r.track, ...ctx.kitProfile };
      break;
    case 'base':
      submittedResume = { kind: 'base', versionId: r.versionId };
      break;
    case 'file':
      submittedResume = { kind: plain };
      resume = r.fileName;
      break;
    case 'unknown':
      submittedResume = { kind: plain };
      break;
  }
  return { submittedResume, submittedDocs: { resume, career: input.career, portfolio: input.portfolio } };
}

/**
 * short: '맞춤 r2 · B3' | '기본 서류 백엔드 · B1' | '이력서 2026-11-02' | '기본 v3' | null
 * long: '맞춤 이력서 r2 (B3 정합성)' | '기본 서류 백엔드 (B1 범용)' | '이력서 2026-11-02' | '기본 이력서 v3' | null
 * 맞춤본의 번호·프로필은 리비전에서 읽어 names로 넘긴다(기록에는 리비전 id만 있다).
 */
export function resumeLabel(
  sr: SubmittedResume,
  docs: SubmittedDocs | null,
  names: { revNo?: number | null; profile?: string | null; profileName?: string | null; versionNo?: number | null },
  style: 'short' | 'long',
): string | null {
  const long = style === 'long';
  switch (sr.kind) {
    case 'tailored': {
      const head = names.revNo != null ? `${long ? '맞춤 이력서' : '맞춤'} r${names.revNo}` : long ? '맞춤 이력서' : '맞춤';
      if (!names.profile) return head;
      return long ? `${head} (${names.profileName ? `${names.profile} ${names.profileName}` : names.profile})` : `${head} · ${names.profile}`;
    }
    case 'kit':
      return long ? `기본 서류 ${sr.track} (${sr.profileId} ${sr.profileName})` : `기본 서류 ${sr.track} · ${sr.profileId}`;
    case 'base':
      return names.versionNo != null ? `${long ? '기본 이력서' : '기본'} v${names.versionNo}` : long ? '기본 이력서' : '기본';
    default: {
      const f = docFileOf(docs?.resume);
      return f ? docLabel(f) : null;
    }
  }
}

/** 경력기술서·포트폴리오 칸의 값 ↔ select 값(모름 = '') */
export const docToSelect = (v: string | null): string => v ?? '';
export const selectToDoc = (v: string): string | null => (v === '' ? null : v);

/**
 * 제출 서류 표시의 이력서 줄(화면 문서 5.5 "제출 서류 표시"): 맞춤본은 "맞춤 이력서 r2 [보기]", 기본 서류는 "기본 서류 백엔드 [보기]".
 * 맞춤본·기본 서류 PDF는 서류 파일 목록에 없으므로 [보기]는 그때그때 만드는 라우트로 간다(D-25). 예전 기록(base)은 [보기] 없이 이름만.
 * 파일·모름은 null(기존 표시를 쓴다).
 */
export function resumeDisplay(
  sr: SubmittedResume,
  names: { revNo?: number | null; versionNo?: number | null },
): { label: string; href: string | null } | null {
  switch (sr.kind) {
    case 'tailored':
      return {
        label: names.revNo != null ? `맞춤 이력서 r${names.revNo}` : '맞춤 이력서',
        href: `/api/tailored/${sr.tailoredRevisionId}/resume?inline=1`,
      };
    case 'kit':
      return { label: `기본 서류 ${sr.track}`, href: `/api/kit/${sr.kitId}/${encodeURIComponent(sr.track)}/resume?inline=1` };
    case 'base':
      return { label: `${names.versionNo != null ? `기본 이력서 v${names.versionNo}` : '기본 이력서'} (예전 기록)`, href: null };
    default:
      return null;
  }
}
