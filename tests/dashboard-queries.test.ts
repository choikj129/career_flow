import { expect, test } from 'vitest';
import { makeTestDb } from './helpers/db';
import { bulkCreateApplications, changeStatus, listRecordExtras, markApplied } from '@/lib/applications/repo';
import { loadDashboard } from '@/lib/search/dashboard';
import { registerPosting, setPostingCompany } from '@/lib/postings/repo';
import type { Db } from '@/lib/db/client';

function seed(n: number) {
  const db = makeTestDb();
  bulkCreateApplications(
    Array.from({ length: n }, (_, i) => ({
      companyName: `회사${i}`,
      positionTitle: `포지션${i}`,
      site: 'wanted' as const,
      appliedAt: '2026-11-05',
      status: 'applied' as const,
      notes: `메모${i}`,
    })),
    db,
  );
  return db;
}

/** drizzle가 쿼리마다 부르는 prepare 횟수를 센다. */
function countQueries(db: Db, fn: () => void): number {
  const client = db.$client;
  const orig = client.prepare.bind(client);
  let n = 0;
  client.prepare = ((sql: string) => {
    n += 1;
    return orig(sql);
  }) as typeof client.prepare;
  try {
    fn();
  } finally {
    client.prepare = orig as typeof client.prepare;
  }
  return n;
}

test('dashboard query count does not grow with the number of record-only rows', () => {
  const small = seed(5);
  const large = seed(60);
  const a = countQueries(small, () => loadDashboard({}, new Date(2026, 10, 16), small));
  const b = countQueries(large, () => loadDashboard({}, new Date(2026, 10, 16), large));
  expect(b).toBe(a);
  expect(b).toBeLessThanOrEqual(12);
  expect(loadDashboard({}, new Date(2026, 10, 16), large).extras.size).toBe(60);
});

test('listRecordExtras returns notes and ordered events', () => {
  const db = seed(2);
  const { rows } = loadDashboard({}, new Date(2026, 10, 16), db);
  const id = rows[0].applicationId;
  changeStatus(id, 'document_passed', {}, db);
  const x = listRecordExtras([id], db).get(id)!;
  expect(x.notes).toMatch(/^메모/);
  expect(x.events.map((e) => e.status)).toEqual(['applied', 'document_passed']);
  expect(listRecordExtras([], db).size).toBe(0);
});

test('rows with a posting also get extras, with a constant query count', () => {
  function seedWithPostings(n: number) {
    const db = seed(1);
    const companyId = loadDashboard({}, new Date(2026, 10, 16), db).rows[0].companyId;
    for (let i = 0; i < n; i++) {
      const reg = registerPosting({ pastedText: `공고 본문 ${i}`, companyName: '회사0', positionTitle: `공고포지션${i}` }, db);
      setPostingCompany(reg.postingId, companyId, db);
      markApplied({ postingId: reg.postingId, appliedAt: '2026-11-06', submitted: { resume: { kind: 'unknown' }, career: null, portfolio: null } }, db);
    }
    return db;
  }
  const small = seedWithPostings(3);
  const large = seedWithPostings(30);
  const a = countQueries(small, () => loadDashboard({}, new Date(2026, 10, 16), small));
  const b = countQueries(large, () => loadDashboard({}, new Date(2026, 10, 16), large));
  expect(b).toBe(a);
  const { rows, extras } = loadDashboard({}, new Date(2026, 10, 16), large);
  const withPosting = rows.filter((r) => r.postingId != null);
  expect(withPosting.length).toBe(30);
  for (const r of withPosting) expect(extras.get(r.applicationId)?.events.length).toBeGreaterThan(0);
});
