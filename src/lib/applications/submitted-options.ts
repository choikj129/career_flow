import type { Db } from '@/lib/db/client';
import { getDb } from '@/lib/db/client';
import { eventDate } from '@/lib/domain/dates';
import { DOC_NONE, docLabel, docValueText, type DocFile } from '@/lib/documents/files';
import { listDocFiles } from '@/lib/documents/folder';
import { getUsableKit } from '@/lib/kit/repo';
import { getResumeVersion } from '@/lib/resume/repo';
import { listRevisionsForPosting } from '@/lib/tailored/repo';
import { defaultKitChoice, getApplication } from './repo';
import { currentSubmitted, encodeResumeChoice, resumeLabel, type SubmittedInput } from './submitted';

// [지원 완료] 창과 [기록 수정] 창의 "제출 서류" 선택지(화면 문서 3.7). 서버 전용이다.

/** label은 select 안에 들어가는 짧은 글(프로필 id까지), full은 select 아래에 줄바꿈해서 다 보이는 전체 이름 */
export type ChoiceOption = { value: string; label: string; full?: string };

export type SubmittedFormData = {
  resumeOptions: ChoiceOption[];
  /** 경력기술서·포트폴리오 선택지. 값 ''는 모름(수정 창에만 있다) */
  careerOptions: ChoiceOption[];
  portfolioOptions: ChoiceOption[];
  /** 지원일에 따라 기본값을 다시 고를 때 쓴다(클라이언트의 defaultSubmitted 입력) */
  files: DocFile[];
  latestRevisionId: number | null;
  kit: { id: number; track: string; profileId?: string } | null;
  /** 수정 창일 때 지금 기록 값. 지원 완료 창이면 null */
  current: SubmittedInput | null;
  noFiles: boolean;
  /** 이력서 세션 맞춤본을 고를 때 "바탕 이력서" 날짜의 처음 값(D-33 a): 지금 기록이 그 값이면 기록된 날짜, 아니면 지금 키트를 올린 날, 키트가 없으면 null */
  sessionBaseDate: string | null;
};

function docOptions(kind: 'career' | 'portfolio', files: DocFile[], current: string | null, withUnknown: boolean): ChoiceOption[] {
  const out: ChoiceOption[] = [
    ...(withUnknown ? [{ value: '', label: '모름' }] : []),
    { value: DOC_NONE, label: '없음' },
    ...files.filter((f) => f.kind === kind).map((f) => ({ value: f.fileName, label: f.date })),
  ];
  // 지금 기록의 파일이 폴더에서 없어졌어도 그 값을 보여 준다
  if (current && current !== DOC_NONE && !out.some((o) => o.value === current)) {
    out.push({ value: current, label: `${docValueText(current)} (파일 없음)` });
  }
  return out;
}

/**
 * 제출 서류 선택지. 지원 완료 창은 postingId, 수정 창은 applicationId(그 기록의 공고·지금 값)로 부른다.
 * 맞춤 리비전 선택지는 그 공고의 것만, 공고 없는 기록(가져오기·직접 입력)은 없다.
 */
export function loadSubmittedFormData(
  input: { postingId: number } | { applicationId: number },
  db: Db = getDb(),
  docsDir?: string,
  /** 이 공고에서 [이력서 세션 요청 복사]로 고른 프로필 id(브라우저가 기억한 값). 키트에 없으면 무시한다 */
  copiedProfileId?: string | null,
): SubmittedFormData {
  const app = 'applicationId' in input ? getApplication(input.applicationId, db) : undefined;
  if ('applicationId' in input && !app) throw new Error('지원 기록을 찾을 수 없습니다');
  const postingId = app ? app.postingId : (input as { postingId: number }).postingId;
  const current = app ? currentSubmitted(app.submittedResume, app.submittedDocs) : null;

  const files = listDocFiles(docsDir).files;
  const revisions = postingId != null ? listRevisionsForPosting(postingId, db) : [];
  const kit = getUsableKit(db);
  // 새 기록([지원 완료])에서는 지난 이력서 파일과 모름을 고르지 않는다. 수정 창은 지난 기록 때문에 둘 다 유지한다
  const isApply = !app;

  const resumeOptions: ChoiceOption[] = [];
  const seen = new Set<string>();
  const add = (value: string, label: string, full?: string) => {
    if (seen.has(value)) return;
    seen.add(value);
    resumeOptions.push({ value, label, ...(full && full !== label ? { full } : {}) });
  };

  for (const r of revisions) {
    add(encodeResumeChoice({ kind: 'tailored', tailoredRevisionId: r.id }), `맞춤 이력서 r${r.revNo} · ${r.profileId}`, `맞춤 이력서 r${r.revNo} · ${r.profileId} ${r.profileName}`);
  }
  if (kit) {
    const profiles = kit.parsed.tracks.flatMap((t) => kit.parsed.profiles.filter((x) => x.track === t.name).map((p) => ({ t, p })));
    // 이력서 세션 맞춤본은 한 줄. 프로필은 복사 때 고른 것 → 분석 추천 1순위 → 직무 기본 프로필 순(기록 수정에서 이미 session이면 그 프로필)
    const find = (id: string | null | undefined) => profiles.find((x) => x.p.id === id);
    const cur = current?.resume.kind === 'session' && current.resume.kitId === kit.id ? current.resume : null;
    const kc = postingId != null ? defaultKitChoice(postingId, db) : null;
    const track = kit.parsed.tracks.find((t) => t.name === kc?.track) ?? kit.parsed.tracks[0];
    const pick =
      (cur && profiles.find((x) => x.t.name === cur.track && x.p.id === cur.profileId)) ||
      (!app ? find(copiedProfileId) : undefined) ||
      find(kc?.profileId) ||
      profiles.find((x) => x.t.name === track?.name && (x.p.id === track?.defaultProfileId || x.p.isDefault)) ||
      profiles[0];
    if (pick) {
      add(encodeResumeChoice({ kind: 'session', kitId: kit.id, track: pick.t.name, profileId: pick.p.id }), '이력서 세션 맞춤본', `${pick.p.id} ${pick.p.name}`);
    }
    for (const { t, p } of profiles) {
      add(encodeResumeChoice({ kind: 'kit', kitId: kit.id, track: t.name, profileId: p.id }), `기본 서류 ${t.name} · ${p.id}`, `기본 서류 ${t.name} · ${p.id} ${p.name}`);
    }
  }
  if (!isApply) {
    for (const f of files.filter((x) => x.kind === 'resume')) {
      add(encodeResumeChoice({ kind: 'file', fileName: f.fileName }), docLabel(f.fileName));
    }
  }
  // 새 기록에서도 고를 것이 하나도 없으면(키트·맞춤본 없음) 모름만 둔다
  if (!isApply || resumeOptions.length === 0) add('unknown', '모름');

  // 지금 기록의 값이 위 선택지에 없으면(예전 기록·옛 키트·없어진 파일) 그 값을 선택지로 더한다
  if (current) {
    const cv = encodeResumeChoice(current.resume);
    if (!seen.has(cv)) {
      const sr = app!.submittedResume;
      let label: string;
      let full: string | undefined;
      if (current.resume.kind === 'base') {
        const no = getResumeVersion(current.resume.versionId, db)?.versionNo;
        label = `${no != null ? `기본 이력서 v${no}` : '기본 이력서'} (예전 기록)`;
      } else if (sr.kind === 'session') {
        label = `이력서 세션 맞춤본 · ${sr.profileId} (이전 키트)`;
        full = `이력서 세션 맞춤본 · ${sr.profileId} ${sr.profileName} (이전 키트)`;
      } else if (current.resume.kind === 'file') {
        label = `${docLabel(current.resume.fileName)} (파일 없음)`;
      } else {
        label = resumeLabel(sr, app!.submittedDocs, {}, 'short') ?? '이전 값';
        full = resumeLabel(sr, app!.submittedDocs, {}, 'long') ?? undefined;
      }
      resumeOptions.unshift({ value: cv, label, ...(full && full !== label ? { full } : {}) });
    }
  }

  return {
    resumeOptions,
    careerOptions: docOptions('career', files, current?.career ?? null, !isApply),
    portfolioOptions: docOptions('portfolio', files, current?.portfolio ?? null, !isApply),
    files,
    latestRevisionId: revisions[0]?.id ?? null,
    kit: postingId != null ? defaultKitChoice(postingId, db) : null,
    current,
    noFiles: files.length === 0,
    sessionBaseDate: current?.sessionBaseDate ?? (kit ? eventDate(kit.createdAt) : null),
  };
}
