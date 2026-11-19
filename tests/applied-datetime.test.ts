import { describe, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { applications } from '@/lib/db/schema';
import { syntheticKstIso, toKstIso } from '@/lib/domain/dates';
import {
  bulkCreateApplications,
  getPriorApplications,
  getRecentApplications,
  listApplicationsForPosting,
  markApplied,
} from '@/lib/applications/repo';
import { searchApplications } from '@/lib/search/dashboard';
import { registerPosting, saveAnalysis } from '@/lib/postings/repo';
import { saveResumeVersion } from '@/lib/resume/repo';
import { emptyResume } from '@/lib/resume/schema';
import {
  backfillAppliedDatetime,
  parseGroupbyTable,
  parseMailTimeLinesDetailed,
  parseMailTimeLines,
} from '@/lib/applications/backfill';
import type { AnalysisResult } from '@/lib/ai/tasks/schemas';

const base = { positionTitle: 'P', site: 'wanted' as const, status: 'applied' as const };

function result(company: string): AnalysisResult {
  return {
    posting: {
      companyDisplayName: company,
      companyLegalName: null,
      positionTitle: 'BE',
      experienceRequirement: null,
      employmentType: null,
      location: null,
      deadline: null,
      salary: null,
      responsibilities: [],
      requirements: [],
      preferred: [],
      techStack: [],
    },
    fit: { score: 50, breakdown: [] },
    strengths: [],
    gaps: [],
    preferenceMismatches: [],
    tailoringAdvice: '',
  };
}

describe('toKstIso / syntheticKstIso (TC-PAST-40)', () => {
  test('toKstIso uses Asia/Seoul with fixed shape', () => {
    expect(toKstIso(new Date('2026-03-03T16:30:00Z'))).toBe('2026-03-04T01:30:00.000+09:00');
    expect(toKstIso(new Date('2026-03-03T16:30:00.123Z'))).toBe('2026-03-04T01:30:00.123+09:00');
  });
  test('syntheticKstIso: fixed shape and smaller rank sorts later in string order', () => {
    expect(syntheticKstIso('2026-11-09', 0)).toBe('2026-11-09T12:00:00.000+09:00');
    expect(syntheticKstIso('2026-11-09', 1)).toBe('2026-11-09T11:59:59.000+09:00');
    expect(syntheticKstIso('2026-11-09', 0) > syntheticKstIso('2026-11-09', 1)).toBe(true);
    expect(syntheticKstIso('2026-11-09', 61)).toBe('2026-11-09T11:58:59.000+09:00');
  });
});

describe('ordering (TC-PAST-41)', () => {
  test('same day: datetime desc, NULL last; different day: day first; id desc as last resort', () => {
    const db = makeTestDb();
    const mk = (c: string, d: string) => bulkCreateApplications([{ ...base, companyName: c, appliedAt: d }], db);
    mk('A', '2026-11-05');
    mk('B', '2026-11-05');
    mk('C', '2026-11-05');
    mk('D', '2026-11-06');
    mk('E', '2026-11-05');
    const set = (c: string, v: string | null) => {
      const row = searchApplications({ text: c }, db)[0];
      db.update(applications).set({ appliedDatetime: v }).where(eq(applications.id, row.applicationId)).run();
    };
    set('A', '2026-11-05T10:00:00.000+09:00');
    set('B', '2026-11-05T09:00:00.000+09:00');
    set('C', null);
    set('D', '2026-11-06T01:00:00.000+09:00');
    set('E', null);
    // NULL(C, E)는 같은 날 맨 뒤이고, 둘 사이는 id 큰 쪽(E)이 먼저
    expect(searchApplications({}, db).map((r) => r.companyName)).toEqual(['D', 'A', 'B', 'E', 'C']);
  });

  test('all list functions use the same order', () => {
    const db = makeTestDb();
    const resume = saveResumeVersion(emptyResume(), undefined, db);
    const reg = registerPosting({ url: 'https://example.com/p1' }, db);
    saveAnalysis(reg.postingId, resume.id, result('토스'), reg.jobId!, db);
    markApplied({ postingId: reg.postingId, appliedAt: '2026-11-05' }, db);
    markApplied({ postingId: reg.postingId, appliedAt: '2026-11-05' }, db);
    const ids = db.select().from(applications).all().map((a) => a.id);
    // 첫 기록을 더 늦은 시각으로 바꾼다 → 첫 기록이 먼저
    db.update(applications).set({ appliedDatetime: '2026-11-05T23:00:00.000+09:00' }).where(eq(applications.id, ids[0])).run();
    db.update(applications).set({ appliedDatetime: '2026-11-05T08:00:00.000+09:00' }).where(eq(applications.id, ids[1])).run();
    const companyId = db.select().from(applications).get()!.companyId;
    expect(listApplicationsForPosting(reg.postingId, db).map((a) => a.id)).toEqual(ids);
    expect(getPriorApplications(companyId, {}, db).map((a) => a.id)).toEqual(ids);
    expect(getRecentApplications(reg.postingId, { now: new Date(2026, 10, 10) }, db).map((a) => a.id)).toEqual(ids);
    expect(searchApplications({}, db).map((r) => r.applicationId)).toEqual(ids);
  });
});

describe('writing the datetime (TC-PAST-42)', () => {
  test('bulkCreateApplications: upper row is newer within a day, ranks restart per day', () => {
    const db = makeTestDb();
    bulkCreateApplications(
      [
        { ...base, companyName: 'R1', appliedAt: '2026-11-05' },
        { ...base, companyName: 'R2', appliedAt: '2026-11-04' },
        { ...base, companyName: 'R3', appliedAt: '2026-11-05' },
        { ...base, companyName: 'R4', appliedAt: '2026-11-05' },
      ],
      db,
    );
    expect(searchApplications({}, db).map((r) => r.companyName)).toEqual(['R1', 'R3', 'R4', 'R2']);
    const dt = (c: string) => {
      const id = searchApplications({ text: c }, db)[0].applicationId;
      return db.select().from(applications).where(eq(applications.id, id)).get()!.appliedDatetime;
    };
    expect(dt('R1')).toBe('2026-11-05T12:00:00.000+09:00');
    expect(dt('R3')).toBe('2026-11-05T11:59:59.000+09:00');
    expect(dt('R2')).toBe('2026-11-04T12:00:00.000+09:00');
  });

  test('markApplied stores a +09:00 datetime', () => {
    const db = makeTestDb();
    const resume = saveResumeVersion(emptyResume(), undefined, db);
    const reg = registerPosting({ url: 'https://example.com/p2' }, db);
    saveAnalysis(reg.postingId, resume.id, result('당근'), reg.jobId!, db);
    markApplied({ postingId: reg.postingId }, db);
    expect(db.select().from(applications).get()!.appliedDatetime).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+09:00$/,
    );
  });
});

describe('one-time backfill (TC-PAST-43)', () => {
  test('parseGroupbyTable: top row gets rank 0 within a day', () => {
    const md = [
      '| 회사 | 포지션 | 날짜 |',
      '|---|---|---|',
      '| 가사 | 서버 | 20261105 |',
      '| 나사 | 서버 | 20261105 |',
      '| 다사 | 서버 | 20261104 |',
    ].join('\n');
    const e = parseGroupbyTable(md);
    expect(e.map((x) => [x.companyName, x.appliedAt, x.site])).toEqual([
      ['가사', '2026-11-05', 'groupby'],
      ['나사', '2026-11-05', 'groupby'],
      ['다사', '2026-11-04', 'groupby'],
    ]);
    expect(e[0].appliedDatetime).toBe(syntheticKstIso('2026-11-05', 0));
    expect(e[1].appliedDatetime).toBe(syntheticKstIso('2026-11-05', 1));
    expect(e[2].appliedDatetime).toBe(syntheticKstIso('2026-11-04', 0));
  });

  test('parseMailTimeLines: skips broken lines and counts them', () => {
    const text = ['2026-03-03T16:30:00Z|토스|Server', '', '깨진 줄', '2026-03-04T01:00:00Z|(주)당근|Front'].join('\n');
    const r = parseMailTimeLinesDetailed('wanted', text);
    expect(r.entries).toHaveLength(2);
    expect(r.skipped).toEqual([3]);
    expect(r.entries[0]).toMatchObject({ site: 'wanted', companyName: '토스', positionTitle: 'Server', appliedAt: '2026-03-04' });
    expect(r.entries[0].appliedDatetime).toBe('2026-03-04T01:30:00.000+09:00');
    expect(parseMailTimeLines('wanted', text)).toHaveLength(2);
  });

  test('backfillAppliedDatetime: fills matches, ignores (주), keeps existing, reports unmatched/ambiguous', () => {
    const db = makeTestDb();
    bulkCreateApplications(
      [
        { ...base, companyName: '(주)토스', positionTitle: 'Server', appliedAt: '2026-03-04' },
        { ...base, companyName: '당근', positionTitle: 'Front', appliedAt: '2026-03-04' },
        { ...base, companyName: '네이버', positionTitle: 'X', appliedAt: '2026-03-04' },
        { ...base, companyName: '카카오', positionTitle: 'Y', appliedAt: '2026-03-04' },
        { ...base, companyName: '카카오', positionTitle: 'Y', appliedAt: '2026-03-04' },
      ],
      db,
    );
    // 모두 같은 날 한 번에 만든 것이라 값이 이미 있다. 이 테스트용으로 Front만 남기고 비운다.
    db.update(applications).set({ appliedDatetime: null }).run();
    const front = db.select().from(applications).all().find((a) => a.positionTitle === 'Front')!;
    db.update(applications).set({ appliedDatetime: 'KEEP' }).where(eq(applications.id, front.id)).run();
    const mk = (company: string, pos: string, time: string) => ({
      site: 'wanted' as const,
      companyName: company,
      positionTitle: pos,
      appliedAt: '2026-03-04',
      appliedDatetime: time,
    });
    const r = backfillAppliedDatetime(
      [
        mk('토스', 'server', '2026-03-04T10:00:00.000+09:00'),
        mk('당근', 'Front', '2026-03-04T11:00:00.000+09:00'),
        mk('없는회사', 'Z', '2026-03-04T12:00:00.000+09:00'),
        mk('카카오', 'Y', '2026-03-04T09:00:00.000+09:00'),
        mk('카카오', 'Y', '2026-03-04T09:30:00.000+09:00'),
        mk('카카오', 'Y', '2026-03-04T09:45:00.000+09:00'),
      ],
      db,
    );
    const all = db.select().from(applications).all();
    const get = (p: string) => all.filter((a) => a.positionTitle === p).sort((a, b) => a.id - b.id);
    expect(get('Server')[0].appliedDatetime).toBe('2026-03-04T10:00:00.000+09:00');
    expect(get('Front')[0].appliedDatetime).toBe('KEEP');
    // 같은 키 2건: id 오름차순 기록 ↔ 시각 오름차순 항목
    expect(get('Y').map((a) => a.appliedDatetime)).toEqual([
      '2026-03-04T09:00:00.000+09:00',
      '2026-03-04T09:30:00.000+09:00',
    ]);
    expect(r.unmatched.map((e) => e.companyName).sort()).toEqual(['당근', '없는회사']);
    expect(r.ambiguous).toHaveLength(1);
    expect(r.ambiguous[0].appliedDatetime).toBe('2026-03-04T09:45:00.000+09:00');
    expect(r.updated).toBe(3);
  });
});
