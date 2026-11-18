import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { SiteId, ApplicationStatus, JobType, JobStatus, AiErrorKind } from '@/lib/domain/types';

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
  submittedResume: text('submitted_resume', { mode: 'json' })
    .$type<{ kind: 'base'; versionId: number } | { kind: 'imported' }>()
    .notNull(),
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
