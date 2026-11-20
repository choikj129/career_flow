import { describe, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { applications } from '@/lib/db/schema';
import { bulkCreateApplications, changeStatus } from '@/lib/applications/repo';
import { saveResumeVersion } from '@/lib/resume/repo';
import { emptyResume } from '@/lib/resume/schema';
import { periodRange } from '@/lib/search/dashboard-params';
import { byDocVersion, byPeriod, bySite, byProfile, byWeekday, funnel, tailoredCompare } from '@/lib/stats/aggregate';
import { getStats, loadStatItems, type StatItem } from '@/lib/stats/load';
import { parseStatsParams, statsHref, toStatsQuery } from '@/lib/stats/params';
import { niceMax, ticks } from '@/lib/stats/chart-scale';
import { daysBetween, weekdayMon0 } from '@/lib/domain/dates';
import { classifyOutcome, NO_RESPONSE_DAYS, type Outcome } from '@/lib/stats/outcome';
import { formatPercent, sampleLevel, tally } from '@/lib/stats/rates';

describe('classifyOutcome (TC-STATS-01)', () => {
  const today = '2026-11-30';
  const applied = (appliedAt: string) => ({ status: 'applied' as const, appliedAt, reached: [] as never[] });
  test('30-day boundary', () => {
    expect(NO_RESPONSE_DAYS).toBe(30);
    expect(classifyOutcome(applied('2026-11-01'), today)).toBe('pending'); // 29일 전
    expect(classifyOutcome(applied('2026-10-31'), today)).toBe('no_response'); // 30일 전
    expect(classifyOutcome(applied('2026-11-30'), today)).toBe('pending'); // 당일
  });
  test('custom noResponseDays', () => {
    expect(classifyOutcome(applied('2026-11-22'), today, 7)).toBe('no_response'); // 8일 전
  });
  test('passed beats rejected and withdrawn', () => {
    expect(classifyOutcome({ status: 'rejected', appliedAt: '2026-10-01', reached: ['document_passed'] }, today)).toBe('passed');
    expect(classifyOutcome({ status: 'withdrawn', appliedAt: '2026-10-01', reached: ['document_passed'] }, today)).toBe('passed');
  });
  test('withdrawn and rejected without reaching', () => {
    expect(classifyOutcome({ status: 'withdrawn', appliedAt: '2026-10-01', reached: [] }, today)).toBe('withdrawn');
    expect(classifyOutcome({ status: 'rejected', appliedAt: '2026-10-01', reached: [] }, today)).toBe('rejected');
  });
});

describe('tally / sampleLevel / formatPercent (TC-STATS-02)', () => {
  test('tally counts and rates', () => {
    const o: Outcome[] = [
      ...Array(2).fill('passed'),
      'rejected',
      ...Array(7).fill('no_response'),
      ...Array(3).fill('pending'),
      'withdrawn',
    ];
    const t = tally(o);
    expect(t).toMatchObject({ total: 14, passed: 2, rejected: 1, noResponse: 7, pending: 3, withdrawn: 1, sample: 10 });
    expect(t.passRate).toBeCloseTo(0.2);
    expect(t.decidedRate).toBeCloseTo(2 / 3);
    expect(t.noResponseRate).toBeCloseTo(0.7);
    expect(t.sampleLevel).toBe('low');
    expect(t.decidedLevel).toBe('few');
  });
  test('empty tally has null rates', () => {
    const t = tally([]);
    expect(t).toMatchObject({ total: 0, sample: 0, passRate: null, decidedRate: null, noResponseRate: null, sampleLevel: 'none' });
  });
  test('sampleLevel boundaries', () => {
    expect([0, 4, 5, 19, 20].map(sampleLevel)).toEqual(['none', 'few', 'low', 'low', 'ok']);
  });
  test('formatPercent', () => {
    expect(formatPercent(0.01918)).toBe('1.9%');
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(0)).toBe('0.0%');
  });
});

describe('daysBetween / weekdayMon0 (TC-STATS-03)', () => {
  test('daysBetween', () => {
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1);
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2);
    expect(daysBetween('2026-11-16', '2026-11-16')).toBe(0);
    expect(daysBetween('2026-03-01', '2026-02-28')).toBe(-1);
  });
  test('weekdayMon0', () => {
    expect(weekdayMon0('2026-11-16')).toBe(0);
    expect(weekdayMon0('2026-11-22')).toBe(6);
  });
});

// ---- Task 2 ----

const mk = (over: Partial<StatItem> = {}): StatItem => {
  const base: StatItem = {
    applicationId: 1,
    companyId: 1,
    site: 'wanted',
    appliedAt: '2026-03-05',
    status: 'applied',
    reached: [],
    outcome: 'no_response',
    baseVersionNo: null,
    tailored: false,
    profile: null,
    kitTrack: null,
    docs: { resume: null, career: null, portfolio: null },
  };
  return { ...base, ...over };
};

describe('byPeriod (TC-STATS-04, 05)', () => {
  const items = [mk({ appliedAt: '2026-01-10' }), mk({ appliedAt: '2026-03-05' })];
  test('month: fills empty months, only current month is partial', () => {
    const b = byPeriod(items, 'month', {}, '2026-03-20');
    expect(b.map((x) => x.key)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(b.map((x) => x.tally.total)).toEqual([1, 0, 1]);
    expect(b.map((x) => x.partial)).toEqual([false, false, true]);
    expect(b[0].label).toBe('2026-01');
  });
  test('month: range.from starts earlier', () => {
    expect(byPeriod(items, 'month', { from: '2025-12-01' }, '2026-03-20')[0].key).toBe('2025-12');
  });
  test('year', () => {
    const b = byPeriod([mk({ appliedAt: '2024-05-01' }), mk({ appliedAt: '2026-02-01' })], 'year', {}, '2026-11-01');
    expect(b.map((x) => x.key)).toEqual(['2024', '2025', '2026']);
    expect(b.map((x) => x.partial)).toEqual([false, false, true]);
  });
  test('no items -> empty', () => {
    expect(byPeriod([], 'month', {}, '2026-03-20')).toEqual([]);
  });
});

describe('byDocVersion (TC-STATS-06)', () => {
  const docs = (resume: string | null, career: string | null = null) => ({ resume, career, portfolio: null });
  const items = [
    mk({ baseVersionNo: 1, appliedAt: '2026-01-01' }),
    mk({ baseVersionNo: 2, appliedAt: '2026-02-01' }),
    mk({ baseVersionNo: 2, appliedAt: '2026-02-10' }),
    mk({ docs: docs('이력서_20260905.pdf', '경력기술서_20261102.pdf'), appliedAt: '2026-09-10' }),
    mk({ docs: docs('이력서_20261102.pdf'), appliedAt: '2026-11-05' }),
    mk({ docs: docs('이력서_20261102.pdf'), appliedAt: '2026-11-09' }),
    mk({ appliedAt: '2026-07-01' }),
  ];
  test('resume order: base desc, files desc, unknown last', () => {
    const b = byDocVersion(items, 'resume');
    expect(b.map((x) => x.label)).toEqual(['기본 v2', '기본 v1', '이력서 2026-11-02', '이력서 2026-09-05', '모름']);
    expect(b[0]).toMatchObject({ firstApplied: '2026-02-01', lastApplied: '2026-02-10', unknown: false });
    expect(b[2].tally.total).toBe(2);
    expect(b[4].unknown).toBe(true);
  });
  test('career ignores base versions', () => {
    const b = byDocVersion(items, 'career');
    expect(b.map((x) => x.label)).toEqual(['경력기술서 2026-11-02', '모름']);
    expect(b[1].tally.total).toBe(6);
  });
});

describe('bySite (TC-STATS-07)', () => {
  test('site order, zero sites hidden, other included', () => {
    const b = bySite([mk({ site: 'other' }), mk({ site: 'wanted' }), mk({ site: 'wanted' }), mk({ site: 'remember' })]);
    expect(b.map((x) => [x.site, x.tally.total])).toEqual([['remember', 1], ['wanted', 2], ['other', 1]]);
  });
});

describe('funnel (TC-STATS-08)', () => {
  const passed = (reached: StatItem['reached'], status: StatItem['status'] = 'document_passed') =>
    mk({ status, reached, outcome: 'passed' });
  test('counts, ofPrev, optional assignment', () => {
    const items = [
      mk({ outcome: 'withdrawn', status: 'withdrawn' }), // 통과 못 한 지원취소: 지원에서 뺀다
      mk({ outcome: 'rejected', status: 'rejected' }),
      mk({ outcome: 'pending' }),
      passed(['document_passed', 'assignment'], 'assignment'),
      passed(['document_passed', 'interview'], 'interview'),
      passed(['document_passed', 'interview', 'final_passed'], 'final_passed'),
    ];
    const f = funnel(items);
    expect(f.map((s) => s.stage)).toEqual(['applied', 'document_passed', 'assignment', 'interview', 'final_passed']);
    expect(f.map((s) => s.count)).toEqual([5, 3, 1, 2, 1]);
    expect(f[0].ofPrev).toBeNull();
    expect(f[1].ofPrev).toBeCloseTo(3 / 5);
    expect(f[2].ofPrev).toBeCloseTo(1 / 3); // 서류 통과 대비
    expect(f[3].ofPrev).toBeCloseTo(2 / 3); // 서류 통과 대비
    expect(f[4].ofPrev).toBeCloseTo(1 / 2); // 면접 대비
    expect(f.map((s) => s.optional)).toEqual([false, false, true, false, false]);
  });
  test('zero previous -> null', () => {
    const f = funnel([mk({ outcome: 'rejected', status: 'rejected' })]);
    expect(f.map((s) => s.count)).toEqual([1, 0, 0, 0, 0]);
    expect(f[2].ofPrev).toBeNull();
    expect(f[4].ofPrev).toBeNull();
  });
});

describe('byWeekday (TC-STATS-09)', () => {
  test('always seven columns Mon..Sun', () => {
    const b = byWeekday([]);
    expect(b.map((x) => x.label)).toEqual(['월', '화', '수', '목', '금', '토', '일']);
    expect(b.every((x) => x.tally.total === 0)).toBe(true);
  });
  test('counts by applied date weekday', () => {
    const b = byWeekday([mk({ appliedAt: '2026-11-16' }), mk({ appliedAt: '2026-11-22' }), mk({ appliedAt: '2026-11-23' })]);
    expect(b.map((x) => x.tally.total)).toEqual([2, 0, 0, 0, 0, 0, 1]);
  });
});

describe('loadStatItems / getStats (TC-STATS-10, 11)', () => {
  const NOW = new Date(2026, 10, 30); // 2026-11-30
  function db0() {
    const db = makeTestDb();
    const resume = saveResumeVersion(emptyResume(), undefined, db);
    return { db, resume };
  }
  const add = (db: ReturnType<typeof makeTestDb>, o: { c: string; at: string; site?: 'wanted' | 'remember'; status?: StatItem['status'] }) => {
    bulkCreateApplications(
      [{ companyName: o.c, positionTitle: 'P', site: o.site ?? 'wanted', appliedAt: o.at, status: 'applied' }],
      db,
    );
    const id = db.select().from(applications).all().at(-1)!.id;
    return id;
  };

  test('site and period filters are inclusive; docs and base version are read', () => {
    const { db, resume } = db0();
    const a = add(db, { c: 'A', at: '2026-10-01' });
    add(db, { c: 'B', at: '2026-10-31', site: 'remember' });
    add(db, { c: 'C', at: '2026-11-01' });
    db.update(applications)
      .set({ submittedDocs: { resume: '이력서_20261002.pdf', career: null, portfolio: null }, submittedResume: { kind: 'base', versionId: resume.id } })
      .where(eq(applications.id, a))
      .run();
    expect(loadStatItems({}, NOW, db)).toHaveLength(3);
    expect(loadStatItems({ site: 'wanted' }, NOW, db)).toHaveLength(2);
    expect(loadStatItems({ from: '2026-10-01', to: '2026-10-31' }, NOW, db).map((i) => i.appliedAt).sort()).toEqual(['2026-10-01', '2026-10-31']);
    const item = loadStatItems({ site: 'wanted', to: '2026-10-01' }, NOW, db)[0];
    expect(item.baseVersionNo).toBe(1);
    expect(item.docs.resume).toBe('이력서_20261002.pdf');
  });

  test('passed then withdrawn is passed; reverted to applied is not passed', () => {
    const { db } = db0();
    const a = add(db, { c: 'A', at: '2026-11-25' });
    const b = add(db, { c: 'B', at: '2026-09-01' });
    changeStatus(a, 'document_passed', {}, db);
    changeStatus(a, 'withdrawn', {}, db);
    changeStatus(b, 'document_passed', {}, db);
    changeStatus(b, 'applied', {}, db);
    const items = loadStatItems({}, NOW, db);
    expect(items.find((i) => i.applicationId === a)!.outcome).toBe('passed');
    expect(items.find((i) => i.applicationId === b)!.outcome).toBe('no_response'); // 지원 후 30일 넘음
  });

  test('getStats: empty, filtered-empty, summary counts', () => {
    const { db } = db0();
    const params = { query: {}, unit: 'month' as const, doc: 'resume' as const };
    expect(getStats(params, NOW, db).isEmptyAll).toBe(true);
    const a = add(db, { c: 'A', at: '2026-10-01' });
    const b = add(db, { c: 'B', at: '2026-10-02' });
    add(db, { c: 'C', at: '2026-11-25' });
    changeStatus(a, 'document_passed', {}, db);
    changeStatus(a, 'assignment', {}, db);
    changeStatus(b, 'document_passed', {}, db);
    changeStatus(b, 'interview', { interviewRound: 1 }, db);
    const s = getStats(params, NOW, db);
    expect(s.isEmptyAll).toBe(false);
    expect(s.summary).toMatchObject({ total: 3, passed: 2, assignment: 1, interview: 1, final: 0, pending: 1 });
    expect(s.firstMonth).toBe('2026-10');
    expect(s.lastMonth).toBe('2026-11');
    const none = getStats({ ...params, query: { site: 'remember' } }, NOW, db);
    expect(none.isEmptyAll).toBe(false);
    expect(none.summary.total).toBe(0);
    expect(none.firstMonth).toBeNull();
    expect(s.weekdays).toHaveLength(7);
    expect(s.funnel).toHaveLength(5);
  });
});

describe('stats params (TC-STATS-12)', () => {
  test('invalid values fall back to defaults', () => {
    expect(parseStatsParams({ unit: 'week', mode: 'x', doc: 'cv', site: 'nope', period: 'month' })).toEqual({
      period: 'all', from: undefined, to: undefined, site: undefined, unit: 'month', mode: 'count', doc: 'resume',
    });
  });
  test('from/to only for custom', () => {
    expect(parseStatsParams({ period: '1y', from: '2026-01-01' }).from).toBeUndefined();
    const p = parseStatsParams({ period: 'custom', from: '2026-01-01', to: '2026-02-30' });
    expect(p.from).toBe('2026-01-01');
    expect(p.to).toBeUndefined();
  });
  test('statsHref omits defaults', () => {
    expect(statsHref({})).toBe('/stats');
    expect(statsHref({ period: 'all', unit: 'month', mode: 'count', doc: 'resume' })).toBe('/stats');
    expect(statsHref({ period: '1y', site: 'wanted', unit: 'year', mode: 'ratio', doc: 'career' })).toBe(
      '/stats?period=1y&site=wanted&unit=year&mode=ratio&doc=career',
    );
    expect(statsHref({ period: 'custom', from: '2026-01-01', to: '2026-02-01' })).toBe('/stats?period=custom&from=2026-01-01&to=2026-02-01');
  });
  test('toStatsQuery matches periodRange', () => {
    const now = new Date(2026, 10, 19);
    const p = parseStatsParams({ period: '3m', site: 'wanted' });
    expect(toStatsQuery(p, now)).toEqual({ site: 'wanted', ...periodRange({ period: '3m' }, now) });
  });
});

describe('chart scale (TC-STATS-13)', () => {
  test('niceMax', () => {
    expect([0, 7, 13, 46, 329, 1, 2, 5, 10].map(niceMax)).toEqual([1, 10, 20, 50, 500, 1, 2, 5, 10]);
  });
  test('ticks', () => {
    expect(ticks(20)).toEqual([0, 5, 10, 15, 20]);
  });
});

describe('byDocVersion with none (TC-PAST-75)', () => {
  const docs = (career: string | null) => ({ resume: null, career, portfolio: null });
  const items = [
    mk({ docs: docs('경력기술서_20261017.pdf'), appliedAt: '2026-10-20' }),
    mk({ docs: docs('경력기술서_20261102.pdf'), appliedAt: '2026-11-05' }),
    mk({ docs: docs('none'), appliedAt: '2026-08-01' }),
    mk({ docs: docs('none'), appliedAt: '2026-08-02' }),
    mk({ docs: docs(null), appliedAt: '2026-12-01' }),
  ];
  test('career order: files desc, none, unknown; none is never a file bucket', () => {
    const b = byDocVersion(items, 'career');
    expect(b.map((x) => x.label)).toEqual(['경력기술서 2026-11-02', '경력기술서 2026-10-17', '없음', '모름']);
    expect(b[2]).toMatchObject({ key: 'absent', absent: true, unknown: false });
    expect(b[2].tally.total).toBe(2);
    expect(b[3]).toMatchObject({ unknown: true, absent: false });
    expect(b.slice(0, 2).every((x) => !x.absent)).toBe(true);
  });
  test('resume order is unchanged and has no absent bucket', () => {
    const b = byDocVersion([mk({ baseVersionNo: 1 }), mk({ docs: { resume: '이력서_20261102.pdf', career: null, portfolio: null } }), mk()], 'resume');
    expect(b.map((x) => x.label)).toEqual(['기본 v1', '이력서 2026-11-02', '모름']);
    expect(b.some((x) => x.absent)).toBe(false);
  });
});

// ---- 맞춤 이력서 효과 (D-24, D-29) ----

const tl = (over: Partial<StatItem> = {}) =>
  mk({ tailored: true, profile: { id: 'B3', name: '정합성' }, ...over });
const kitItem = (over: Partial<StatItem> = {}) =>
  mk({ kitTrack: '백엔드', profile: { id: 'B1', name: '범용' }, ...over });

describe('byDocVersion with tailored and base documents (TC-STATS-15)', () => {
  const items = [
    mk({ baseVersionNo: 2, appliedAt: '2026-02-01' }),
    kitItem({ appliedAt: '2026-11-01' }),
    kitItem({ kitTrack: '데이터', profile: { id: 'D1', name: '범용' }, appliedAt: '2026-11-02' }),
    kitItem({ appliedAt: '2026-11-03' }),
    tl({ appliedAt: '2026-11-04' }),
    tl({ appliedAt: '2026-11-06', docs: { resume: null, career: '경력기술서_20261102.pdf', portfolio: null } }),
    mk({ docs: { resume: '이력서_20261102.pdf', career: null, portfolio: null }, appliedAt: '2026-10-05' }),
    mk({ appliedAt: '2026-07-01' }),
  ];
  test('resume order: tailored, base documents by track, base v, files, unknown', () => {
    const b = byDocVersion(items, 'resume');
    expect(b.map((x) => [x.key, x.label])).toEqual([
      ['tailored', '맞춤 이력서'],
      ['kit:데이터', '기본 서류 데이터'],
      ['kit:백엔드', '기본 서류 백엔드'],
      ['v2', '기본 v2'],
      ['doc:이력서_20261102.pdf', '이력서 2026-11-02'],
      ['none', '모름'],
    ]);
    expect(b[0]).toMatchObject({ unknown: false, firstApplied: '2026-11-04', lastApplied: '2026-11-06' });
    expect(b[0].tally.total).toBe(2);
    expect(b[2].tally.total).toBe(2);
    expect(b[5].tally.total).toBe(1); // 맞춤·기본 서류 기록은 모름에 섞이지 않는다
  });
  test('career counts tailored and base-document records by their file value', () => {
    const b = byDocVersion(items, 'career');
    expect(b.map((x) => x.label)).toEqual(['경력기술서 2026-11-02', '모름']);
    expect(b[0].tally.total).toBe(1);
    expect(b[1].tally.total).toBe(7);
  });
});

describe('tailoredCompare (TC-STATS-16)', () => {
  test('null when no tailored record', () => {
    expect(tailoredCompare([mk(), kitItem()])).toBeNull();
    expect(tailoredCompare([])).toBeNull();
  });
  test('compares from the first tailored day, same-day records included, base documents count as plain', () => {
    const items = [
      mk({ appliedAt: '2026-11-20', outcome: 'rejected' }), // 그 전: 빠짐
      tl({ appliedAt: '2026-11-21', outcome: 'passed' }),
      tl({ appliedAt: '2026-11-25', outcome: 'rejected' }),
      mk({ appliedAt: '2026-11-21', outcome: 'rejected' }), // 같은 날: 들어감
      kitItem({ appliedAt: '2026-11-23', outcome: 'passed' }),
      mk({ appliedAt: '2026-12-01', outcome: 'pending' }),
    ];
    const c = tailoredCompare(items)!;
    expect(c.since).toBe('2026-11-21');
    expect(c.tailored).toMatchObject({ total: 2, passed: 1, rejected: 1 });
    expect(c.plain).toMatchObject({ total: 3, passed: 1, rejected: 1, pending: 1 });
  });
  test('no tailored record left after a filter gives null', () => {
    expect(tailoredCompare([kitItem()])).toBeNull();
  });
});

describe('byProfile (TC-STATS-17)', () => {
  test('counts tailored and base-document records by profile; records without a profile are left out; id order', () => {
    const items = [
      tl({ appliedAt: '2026-11-01', outcome: 'passed' }),
      tl({ appliedAt: '2026-11-02', outcome: 'rejected' }),
      kitItem({ appliedAt: '2026-11-03', outcome: 'rejected' }),
      kitItem({ appliedAt: '2026-11-04', outcome: 'pending' }),
      kitItem({ profile: { id: 'B3', name: '정합성' }, appliedAt: '2026-11-05', outcome: 'rejected' }),
      mk({ appliedAt: '2026-11-06' }), // 프로필 없음(파일·모름)
      mk({ baseVersionNo: 1 }),
      tl({ profile: { id: 'A1', name: '범용' }, appliedAt: '2026-11-07', outcome: 'passed' }),
    ];
    const rows = byProfile(items);
    expect(rows.map((r) => r.id)).toEqual(['A1', 'B1', 'B3']);
    const b3 = rows.find((r) => r.id === 'B3')!;
    expect(b3.name).toBe('정합성');
    expect(b3.all).toMatchObject({ total: 3, passed: 1, rejected: 2 });
    expect(b3.tailored.total).toBe(2);
    expect(b3.plain.total).toBe(1);
    expect(rows.find((r) => r.id === 'B1')!.all.total).toBe(2);
    expect(rows.find((r) => r.id === 'B1')!.tailored.total).toBe(0);
    expect(byProfile([mk(), mk({ baseVersionNo: 2 })])).toEqual([]);
  });
});
