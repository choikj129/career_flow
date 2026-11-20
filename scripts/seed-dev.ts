// 개발용 시드. 화면 확인에 쓸 가짜 데이터를 넣는다. 실제 데이터와 섞이지 않게 data-dev에서만 쓴다.
//
//   CAREER_FLOW_DATA_DIR=data-dev npx tsx scripts/seed-dev.ts [--reset]
//
// 분석 작업(queued)은 만들지 않는다. 개발 서버의 워커가 실제 claude를 부르기 때문이다.
import { existsSync, rmSync } from 'node:fs';
import { basename } from 'node:path';
import { config } from '../src/lib/config';
import { getDb, runMigrations } from '../src/lib/db/client';
import { aiJobs, companies, postings } from '../src/lib/db/schema';
import {
  bulkCreateApplications,
  changeStatus,
  markApplied,
} from '../src/lib/applications/repo';
import { saveAnalysis } from '../src/lib/postings/repo';
import { saveResumeVersion } from '../src/lib/resume/repo';
import { emptyResume, type ResumeContent } from '../src/lib/resume/schema';
import type { AnalysisResult } from '../src/lib/ai/tasks/schemas';
import type { SiteId } from '../src/lib/domain/types';

if (!process.env.CAREER_FLOW_DATA_DIR || !basename(config.dataDir).startsWith('data-')) {
  console.error('CAREER_FLOW_DATA_DIR=data-dev 처럼 data-로 시작하는 폴더를 지정하세요. 실제 data/에는 쓰지 않습니다.');
  process.exit(1);
}

if (process.argv.includes('--reset')) {
  for (const suffix of ['', '-wal', '-shm']) {
    if (existsSync(config.dbPath + suffix)) rmSync(config.dbPath + suffix);
  }
}

const db = getDb();
runMigrations(db);
if (db.select().from(companies).limit(1).all().length > 0) {
  console.log('이미 데이터가 있습니다. 다시 넣으려면 --reset을 붙이세요.');
  process.exit(0);
}

const iso = (d: string) => new Date(`${d}T09:00:00`).toISOString();

function resume(summary: string): ResumeContent {
  const r = emptyResume();
  r.basics.name = '홍길동';
  r.summary = summary;
  r.experiences = [
    {
      id: 'e1',
      company: '예시컴퍼니',
      role: '백엔드 개발자',
      start: '2021-03',
      end: null,
      description: '결제 서버 개발',
      achievements: ['정산 배치 처리 시간 단축'],
    },
  ];
  r.skills = [{ category: '언어', items: ['Java', 'Kotlin'] }];
  return r;
}

function analysis(opts: {
  company: string;
  legal?: string | null;
  position: string;
  score: number;
  deadline: string | null;
}): AnalysisResult {
  return {
    posting: {
      companyDisplayName: opts.company,
      companyLegalName: opts.legal ?? null,
      positionTitle: opts.position,
      experienceRequirement: '3년 이상',
      employmentType: '정규직',
      location: '서울 강남',
      deadline: opts.deadline,
      salary: null,
      responsibilities: ['결제 시스템 설계와 운영', '정산 배치 고도화'],
      requirements: ['Java, Spring 3년 이상', '대용량 트랜잭션 처리 경험'],
      preferred: ['Kafka 운영 경험', 'Kotlin 실무'],
      techStack: ['Java', 'Spring', 'MySQL', 'Kafka'],
    },
    fit: {
      score: opts.score,
      breakdown: [
        { category: 'requirements', score: Math.min(100, opts.score + 6), reason: '필수 요건 대부분에 이력서 근거가 있습니다' },
        { category: 'preferred', score: Math.max(0, opts.score - 12), reason: 'Kafka 운영 경험이 드러나지 않습니다' },
        { category: 'experience_years', score: Math.min(100, opts.score + 8), reason: '요구 3년 이상, 보유 5년' },
        { category: 'tech_stack', score: opts.score, reason: 'Java, Spring 일치' },
        { category: 'domain', score: Math.max(0, opts.score - 6), reason: '결제 도메인 경험 있음' },
        { category: 'preferences', score: Math.min(100, opts.score + 3), reason: '근무지가 희망 조건과 맞습니다' },
      ],
    },
    strengths: [
      { point: '대용량 결제 트랜잭션 처리', evidence: '예시컴퍼니 결제 서버 개발 경력' },
      { point: 'RDBMS 설계와 튜닝', evidence: '정산 배치 처리 시간 단축' },
    ],
    gaps: [
      { point: 'Kafka 운영 경험', kind: 'hidden', suggestion: '프로젝트에 있으나 경력란에 드러나지 않습니다. 맞춤 이력서에서 강조하세요.' },
      { point: 'Kotlin 실무 경험', kind: 'missing', suggestion: '학습 계획과 Java 경험을 연결해 답변을 준비하세요.' },
    ],
    preferenceMismatches: opts.score < 75 ? ['근무지가 희망 지역과 다릅니다'] : [],
    tailoringAdvice: 'Kafka 경험을 경력 성과로 올린 맞춤본을 권합니다.',
  };
}

function fakeJob(status: 'succeeded' | 'failed', payload: unknown, error?: { kind: 'extract_failed' | 'auth' | 'timeout' | 'schema'; message: string }): number {
  return db
    .insert(aiJobs)
    .values({
      type: 'analyze_posting',
      payload,
      status,
      errorKind: error?.kind ?? null,
      errorMessage: error?.message ?? null,
      createdAt: iso('2026-11-10'),
      startedAt: iso('2026-11-10'),
      finishedAt: iso('2026-11-10'),
    })
    .returning({ id: aiJobs.id })
    .get().id;
}

function addPosting(opts: {
  url: string | null;
  site: SiteId;
  siteNote?: string;
  text: string;
  created: string;
  analyzed?: Parameters<typeof analysis>[0];
  resumeVersionId?: number;
  fail?: { kind: 'extract_failed' | 'auth' | 'timeout' | 'schema'; message: string };
}): number {
  const id = db
    .insert(postings)
    .values({
      url: opts.url,
      canonicalUrl: opts.url,
      site: opts.site,
      siteNote: opts.siteNote ?? null,
      rawText: opts.fail?.kind === 'extract_failed' ? null : opts.text,
      rawTextSource: opts.fail?.kind === 'extract_failed' ? null : opts.url ? 'extracted' : 'pasted',
      fetchedAt: opts.fail?.kind === 'extract_failed' ? null : iso(opts.created),
      createdAt: iso(opts.created),
    })
    .returning({ id: postings.id })
    .get().id;
  if (opts.analyzed) {
    const jobId = fakeJob('succeeded', { postingId: id });
    saveAnalysis(id, opts.resumeVersionId!, analysis(opts.analyzed), jobId, db);
  } else if (opts.fail) {
    fakeJob('failed', { postingId: id }, opts.fail);
  }
  return id;
}

// 기본 이력서 v1. 이 시점에 지원한 것은 "기본 v1"로 남는다.
const v1 = saveResumeVersion(resume('결제 도메인 백엔드 개발자'), '시드', db);
const body = '[예시] 서버 개발자\n\n주요 업무\n- 결제 시스템 설계와 운영\n\n자격 요건\n- Java, Spring 3년 이상';

const pMobil = addPosting({ url: 'https://www.wanted.co.kr/wd/900001', site: 'wanted', text: body, created: '2026-10-20', resumeVersionId: v1.id,
  analyzed: { company: '모빌페이', legal: '모빌리티페이먼츠', position: '서버 개발자 (결제)', score: 84, deadline: '2026-12-31' } });
const pHanbit = addPosting({ url: 'https://rememberapp.co.kr/job/900002', site: 'remember', text: body, created: '2026-10-28', resumeVersionId: v1.id,
  analyzed: { company: '한빛커머스', position: '백엔드 개발자', score: 78, deadline: null } });
const pOrange = addPosting({ url: null, site: 'other', siteNote: '지인 추천', text: body, created: '2026-11-01', resumeVersionId: v1.id,
  analyzed: { company: '오렌지핀', position: '서버 개발자', score: 77, deadline: null } });

markApplied({ postingId: pMobil, appliedAt: '2026-10-22' }, db);
markApplied({ postingId: pHanbit, appliedAt: '2026-10-30' }, db);
markApplied({ postingId: pOrange, appliedAt: '2026-11-02', site: 'other', siteNote: '지인 추천' }, db);
// 3단계 전에 지원한 기록(예전 [지원 완료]는 기본 이력서 버전으로 남겼다). markApplied는 이제 제출 서류 기본값을 쓰므로 직접 맞춘다.
db.$client.prepare('update applications set submitted_resume = ? where posting_id is not null').run(JSON.stringify({ kind: 'base', versionId: v1.id }));

// 이후 지원은 v2 기준
saveResumeVersion(resume('결제·정산 도메인 백엔드 개발자, Kafka 파이프라인 경험'), '시드 v2', db);
const v2 = db.$client.prepare('select id from resume_versions order by version_no desc limit 1').get() as { id: number };

// 같은 회사(모빌페이)의 다른 공고: 중복 경고 배너 확인용. 분석만 하고 지원하지 않는다.
addPosting({ url: 'https://www.wanted.co.kr/wd/900003', site: 'wanted', text: body, created: '2026-11-14', resumeVersionId: v2.id,
  analyzed: { company: '모빌페이', legal: '모빌리티페이먼츠', position: '플랫폼 엔지니어', score: 81, deadline: '2026-12-10' } });
addPosting({ url: 'https://www.groupby.kr/positions/900004', site: 'groupby', text: body, created: '2026-11-12', resumeVersionId: v2.id,
  analyzed: { company: '스텔라랩스', position: 'Backend Engineer', score: 71, deadline: null } });
addPosting({ url: 'https://www.example-corp.test/careers/5', site: 'other', siteNote: '회사 채용 페이지', text: body, created: '2026-11-02', resumeVersionId: v2.id,
  analyzed: { company: '루미에듀', position: 'API 개발자', score: 69, deadline: '2026-11-10' } });
// 합치기 확인용: 별개 회사로 들어간 같은 서비스
addPosting({ url: 'https://www.jobkorea.co.kr/Recruit/GI_Read/900005', site: 'jobkorea', text: body, created: '2026-11-15', resumeVersionId: v2.id,
  analyzed: { company: '모빌리티페이', position: '정산 개발자', score: 74, deadline: null } });
// 실패 표시 확인용
addPosting({ url: 'https://www.wanted.co.kr/wd/900006', site: 'wanted', text: '', created: '2026-11-16',
  fail: { kind: 'extract_failed', message: '본문이 너무 짧습니다(로그인 필요 페이지로 보임)' } });
addPosting({ url: null, site: 'other', text: body, created: '2026-11-16',
  fail: { kind: 'auth', message: 'Failed to authenticate: OAuth session expired' } });

// 상태 다양화
const appRows = db.$client.prepare('select id, posting_id from applications').all() as { id: number; posting_id: number }[];
const appOf = (postingId: number) => appRows.find((r) => r.posting_id === postingId)!.id;
changeStatus(appOf(pMobil), 'document_passed', { at: '2026-10-27', note: '서류 통과 메일' }, db);
changeStatus(appOf(pHanbit), 'document_passed', { at: '2026-11-03' }, db);
changeStatus(appOf(pHanbit), 'interview', { interviewRound: 1, at: '2026-11-08' }, db);
changeStatus(appOf(pHanbit), 'interview', { interviewRound: 2, at: '2026-11-14', note: '2차 기술 면접' }, db);

// 가져온 기록(공고 없음, 제출 이력서 모름). 같은 회사의 다른 표기와 기타 출처 포함.
bulkCreateApplications(
  [
    { companyName: '토스', positionTitle: 'Server Developer', site: 'wanted', appliedAt: '2025-10-03', status: 'document_passed' },
    { companyName: '(주)토스뱅크', positionTitle: '백엔드', site: 'remember', appliedAt: '2025-09-12', status: 'rejected' },
    { companyName: '비바리퍼블리카', positionTitle: 'Platform Engineer', site: 'jobkorea', appliedAt: '2025-03-02', status: 'rejected' },
    { companyName: '노을헬스', positionTitle: '서버 개발자', site: 'wanted', appliedAt: '2025-12-15', status: 'final_passed' },
    { companyName: '그린로지스', positionTitle: 'Java 백엔드', site: 'jobkorea', appliedAt: '2026-01-30', status: 'withdrawn' },
    { companyName: '하이퍼셀', positionTitle: 'Java 개발자', site: 'groupby', appliedAt: '2026-02-21', status: 'applied' },
    { companyName: '코드웨이브', positionTitle: '플랫폼 개발자', site: 'other', siteNote: '지인 추천', appliedAt: '2026-03-08', status: 'applied' },
    { companyName: '코어뱅크', positionTitle: '시니어 백엔드', site: 'remember', appliedAt: '2026-11-05', status: 'applied' },
  ],
  db,
);
const imported = db.$client.prepare("select id from applications where posting_id is null and position_title = 'Platform Engineer'").get() as { id: number };
changeStatus(imported.id, 'interview', { interviewRound: 2, at: '2025-03-20' }, db);
changeStatus(imported.id, 'rejected', { at: '2025-04-01' }, db);
const hyper = db.$client.prepare("select id from applications where position_title = 'Java 개발자'").get() as { id: number };
changeStatus(hyper.id, 'interview', { interviewRound: 1, at: '2026-03-02' }, db);

void v2;
console.log(`시드 완료: ${config.dbPath}`);
