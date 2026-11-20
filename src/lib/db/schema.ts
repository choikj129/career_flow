import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { SubmittedDocs } from '@/lib/documents/files';
import type { SiteId, ApplicationStatus, JobType, JobStatus, AiErrorKind, SubmittedResume } from '@/lib/domain/types';
import type { KitError, KitFile, KitParsed, KitWarning } from '@/lib/kit/types';

export const resumeVersions = sqliteTable('resume_versions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  versionNo: integer('version_no').notNull().unique(),
  content: text('content', { mode: 'json' }).notNull(),
  sourceNote: text('source_note'),
  createdAt: text('created_at').notNull(),
});

export const preferences = sqliteTable('preferences', {
  id: integer('id').primaryKey(),
  content: text('content', { mode: 'json' }).notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const companies = sqliteTable('companies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  displayName: text('display_name').notNull(),
  legalName: text('legal_name'),
  createdAt: text('created_at').notNull(),
});

export const companyKeys = sqliteTable('company_keys', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id').notNull().references(() => companies.id),
  key: text('key').notNull().unique(),
  kind: text('kind').$type<'display' | 'legal' | 'alias'>().notNull(),
});

export const aiJobs = sqliteTable('ai_jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').$type<JobType>().notNull(),
  payload: text('payload', { mode: 'json' }).notNull(),
  status: text('status').$type<JobStatus>().notNull(),
  result: text('result', { mode: 'json' }),
  errorKind: text('error_kind').$type<AiErrorKind>(),
  errorMessage: text('error_message'),
  sessionId: text('session_id'),
  model: text('model'),
  usage: text('usage', { mode: 'json' }),
  createdAt: text('created_at').notNull(),
  startedAt: text('started_at'),
  finishedAt: text('finished_at'),
}, (t) => [index('ai_jobs_status_idx').on(t.status)]);

export const postings = sqliteTable('postings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id').references(() => companies.id),
  url: text('url'),
  canonicalUrl: text('canonical_url').unique(),
  site: text('site').$type<SiteId>().notNull(),
  siteNote: text('site_note'),
  positionTitle: text('position_title'),
  rawText: text('raw_text'),
  rawTextSource: text('raw_text_source').$type<'extracted' | 'pasted'>(),
  fetchedAt: text('fetched_at'),
  extracted: text('extracted', { mode: 'json' }),
  deadline: text('deadline'),
  createdAt: text('created_at').notNull(),
});

export const analyses = sqliteTable('analyses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  postingId: integer('posting_id').notNull().references(() => postings.id, { onDelete: 'cascade' }),
  resumeVersionId: integer('resume_version_id').notNull().references(() => resumeVersions.id),
  result: text('result', { mode: 'json' }).notNull(),
  fitScore: integer('fit_score').notNull(),
  jobId: integer('job_id').notNull().references(() => aiJobs.id),
  createdAt: text('created_at').notNull(),
}, (t) => [index('analyses_posting_id_idx').on(t.postingId)]);

export const applications = sqliteTable('applications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  postingId: integer('posting_id').references(() => postings.id),
  companyId: integer('company_id').notNull().references(() => companies.id),
  positionTitle: text('position_title').notNull(),
  site: text('site').$type<SiteId>().notNull(),
  siteNote: text('site_note'),
  appliedAt: text('applied_at').notNull(), // YYYY-MM-DD
  /**
   * 같은 지원일 안의 순서를 정하는 정렬 전용 값(D-17). 화면에 보이지 않는다.
   * 한국 시간 고정 모양 `YYYY-MM-DDTHH:mm:ss.SSS+09:00`(문자열 비교로 정렬). nullable(없으면 같은 날 맨 뒤).
   * 실제 지원 시각이 아닐 수 있다: [지원 완료]는 저장 시각, 지난 메일은 수신 시각,
   * 직접 입력·가져오기·그룹바이는 표 순서로 만든 값(12:00:00에서 순번초를 뺀 값).
   */
  appliedDatetime: text('applied_datetime'),
  submittedResume: text('submitted_resume', { mode: 'json' }).$type<SubmittedResume>().notNull(),
  /** 낸 이력서·경력기술서·포트폴리오 파일 이름(종류별, null = 모름). 기존 행은 null. */
  submittedDocs: text('submitted_docs', { mode: 'json' }).$type<SubmittedDocs>(),
  status: text('status').$type<ApplicationStatus>().notNull(),
  interviewRound: integer('interview_round'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
}, (t) => [
  index('applications_company_id_idx').on(t.companyId),
  index('applications_posting_id_idx').on(t.postingId),
]);

export const statusEvents = sqliteTable('status_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  applicationId: integer('application_id')
    .notNull()
    .references(() => applications.id, { onDelete: 'cascade' }),
  status: text('status').$type<ApplicationStatus>().notNull(),
  interviewRound: integer('interview_round'),
  at: text('at').notNull(),
  note: text('note'),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/** 서류 키트: 사용자가 올린 가이드·기본 서류·규칙·마스터스토리. 파일은 data/kit/<id>/에 보관한다. 올릴 때마다 새 행. */
export const kits = sqliteTable('kits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  label: text('label').notNull(),
  files: text('files', { mode: 'json' }).$type<KitFile[]>().notNull(),
  parsed: text('parsed', { mode: 'json' }).$type<KitParsed | null>(),
  errors: text('errors', { mode: 'json' }).$type<KitError[]>().notNull(),
  createdAt: text('created_at').notNull(),
});

/** 공고마다 하나인 맞춤 이력서 묶음. 공고를 지우면 함께 지운다. */
export const tailoredResumes = sqliteTable('tailored_resumes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  postingId: integer('posting_id').notNull().unique().references(() => postings.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull(),
});

/** 맞춤본의 한 번 저장. source: recipe(코드 조립) / terms(공고 용어 맞추기) / revise(다듬기) / external(이력서 작업 공간 결과) */
export const tailoredRevisions = sqliteTable(
  'tailored_revisions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tailoredResumeId: integer('tailored_resume_id').notNull().references(() => tailoredResumes.id, { onDelete: 'cascade' }),
    revNo: integer('rev_no').notNull(),
    kitId: integer('kit_id').notNull().references(() => kits.id),
    track: text('track').notNull(),
    profileId: text('profile_id').notNull(),
    profileName: text('profile_name').notNull(),
    adjustments: text('adjustments', { mode: 'json' }).$type<{ id: string; label: string }[]>().notNull(),
    source: text('source').$type<'recipe' | 'terms' | 'revise' | 'external'>().notNull(),
    resumeMd: text('resume_md').notNull(),
    careerMd: text('career_md').notNull(),
    pendingAdjustments: text('pending_adjustments', { mode: 'json' }).$type<string[]>().notNull(),
    changeReasons: text('change_reasons', { mode: 'json' }).$type<{ doc: 'resume' | 'career'; after: string; reason: string }[]>().notNull(),
    warnings: text('warnings', { mode: 'json' }).$type<KitWarning[]>().notNull(),
    notes: text('notes').notNull(),
    userRequest: text('user_request'),
    jobId: integer('job_id').references(() => aiJobs.id),
    createdAt: text('created_at').notNull(),
  },
  (t) => [uniqueIndex('tailored_revisions_resume_rev_idx').on(t.tailoredResumeId, t.revNo)],
);
