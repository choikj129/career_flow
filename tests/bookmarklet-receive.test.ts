import { expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { aiJobs, postings } from '@/lib/db/schema';
import { getOrCreateBookmarkletToken } from '@/lib/bookmarklet/token';
import { receiveFromBookmarklet } from '@/lib/postings/receive';
import { receiveBookmarkletAction } from '@/app/_actions/bookmarklet';
import { registerPosting, setPostingText } from '@/lib/postings/repo';
import type { Db } from '@/lib/db/client';

const body = (n: number) => '가'.repeat(n);
const counts = (db: Db) => ({
  postings: db.select().from(postings).all().length,
  jobs: db.select().from(aiJobs).all().length,
});
const input = (db: Db, over: Partial<Parameters<typeof receiveFromBookmarklet>[0]> = {}) => ({
  token: getOrCreateBookmarkletToken(db).token,
  url: 'https://www.wanted.co.kr/wd/777001',
  title: '가상 백엔드 개발자 공고',
  text: body(400),
  cut: false,
  ...over,
});

test('TC-BM-05 new link is registered with bookmarklet text and one analysis job', () => {
  const db = makeTestDb();
  const r = receiveFromBookmarklet(input(db), db);
  expect(r.kind).toBe('registered');
  if (r.kind !== 'registered') return;
  expect(r.notice).toBe('북마크 버튼으로 가져온 본문으로 분석을 시작했습니다');
  const rows = db.select().from(postings).all();
  expect(rows).toHaveLength(1);
  expect(rows[0].id).toBe(r.postingId);
  expect(rows[0].rawTextSource).toBe('bookmarklet');
  expect(rows[0].site).toBe('wanted');
  expect(rows[0].siteNote).toBeNull();
  expect(rows[0].rawText).toContain('페이지 제목: 가상 백엔드 개발자 공고');
  expect(rows[0].fetchedAt).not.toBeNull();
  expect(db.select().from(aiJobs).where(eq(aiJobs.type, 'analyze_posting')).all()).toHaveLength(1);
});

test('TC-BM-06 other site gets host as site note', () => {
  const db = makeTestDb();
  const r = receiveFromBookmarklet(input(db, { url: 'https://www.careers.example.com/jobs/1' }), db);
  expect(r.kind).toBe('registered');
  const p = db.select().from(postings).all()[0];
  expect(p.site).toBe('other');
  expect(p.siteNote).toBe('careers.example.com');
});

test('TC-BM-07 wrong or empty token: confirm, nothing registered, token never echoed', () => {
  const db = makeTestDb();
  const real = getOrCreateBookmarkletToken(db).token;
  for (const token of ['x'.repeat(32), '']) {
    const r = receiveFromBookmarklet(input(db, { token }), db);
    expect(r.kind).toBe('confirm');
    if (r.kind !== 'confirm') return;
    expect(r.reason).toBe('token');
    expect(r.prefill.url).toBe('https://www.wanted.co.kr/wd/777001');
    expect(r.prefill.text).toContain('페이지 제목: 가상 백엔드 개발자 공고');
    expect(r.prefill.text).toContain(body(400));
    expect(JSON.stringify(r)).not.toContain(real);
    if (token) expect(JSON.stringify(r)).not.toContain(token);
  }
  expect(counts(db)).toEqual({ postings: 0, jobs: 0 });
  // 저장된 토큰이 없을 때도 언제나 확인으로 떨어진다
  const empty = makeTestDb();
  expect(
    receiveFromBookmarklet({ token: 'abc', url: 'https://example.com/a', title: '', text: body(400), cut: false }, empty).kind,
  ).toBe('confirm');
  expect(counts(empty)).toEqual({ postings: 0, jobs: 0 });
});

test('TC-BM-08 non-http url: confirm/url with empty link', () => {
  const db = makeTestDb();
  const r = receiveFromBookmarklet(input(db, { url: 'file:///C:/a.html' }), db);
  expect(r.kind).toBe('confirm');
  if (r.kind !== 'confirm') return;
  expect(r.reason).toBe('url');
  expect(r.prefill.url).toBe('');
  expect(r.prefill.text).toContain(body(400));
  expect(counts(db)).toEqual({ postings: 0, jobs: 0 });
});

test('TC-BM-09 short body: 299 confirm, 300 registers', () => {
  const db = makeTestDb();
  const short = receiveFromBookmarklet(input(db, { text: body(299) }), db);
  expect(short.kind).toBe('confirm');
  if (short.kind === 'confirm') expect(short.reason).toBe('short');
  expect(counts(db)).toEqual({ postings: 0, jobs: 0 });
  expect(receiveFromBookmarklet(input(db, { text: body(300) }), db).kind).toBe('registered');
});

test('TC-BM-10 same link with text: existing, untouched, even for a short body', () => {
  const db = makeTestDb();
  const first = registerPosting({ url: 'https://www.wanted.co.kr/wd/777002', pastedText: '원래 본문' }, db);
  const before = counts(db);
  const r = receiveFromBookmarklet(
    input(db, { url: 'https://www.wanted.co.kr/wd/777002?utm_source=x#frag', text: body(10) }),
    db,
  );
  expect(r.kind).toBe('existing');
  if (r.kind !== 'existing') return;
  expect(r.postingId).toBe(first.postingId);
  expect(r.notice).toContain('[본문 다시 붙여넣기]');
  expect(db.select().from(postings).all()[0].rawText).toBe('원래 본문');
  expect(counts(db)).toEqual(before);
});

test('TC-BM-11 same link without text: fill and analyze, or leave when a job is waiting', () => {
  const url = 'https://www.wanted.co.kr/wd/777003';

  // 링크만 등록(본문 없음). 등록 때 만든 대기 작업을 지워 "작업 없음" 상태로 만든다.
  const db = makeTestDb();
  const reg = registerPosting({ url }, db);
  db.delete(aiJobs).run();
  const r = receiveFromBookmarklet(input(db, { url }), db);
  expect(r.kind).toBe('existing');
  if (r.kind !== 'existing') return;
  expect(r.postingId).toBe(reg.postingId);
  expect(r.notice).toContain('본문이 없던 공고라');
  const p = db.select().from(postings).all()[0];
  expect(p.rawTextSource).toBe('bookmarklet');
  expect(p.rawText).toContain(body(400));
  expect(db.select().from(aiJobs).all()).toHaveLength(1);

  // 본문이 없고 분석 작업이 대기 중이면 바뀌지 않는다.
  const db2 = makeTestDb();
  registerPosting({ url }, db2); // 작업 1개(queued)
  const r2 = receiveFromBookmarklet(input(db2, { url }), db2);
  expect(r2.kind).toBe('existing');
  if (r2.kind !== 'existing') return;
  expect(r2.notice).toContain('분석이 진행 중입니다');
  expect(db2.select().from(postings).all()[0].rawText).toBeNull();
  expect(db2.select().from(aiJobs).all()).toHaveLength(1);

  // 본문이 공백뿐이고 작업이 끝난 뒤라면 다시 채운다.
  const db3 = makeTestDb();
  const reg3 = registerPosting({ url }, db3);
  db3.update(aiJobs).set({ status: 'failed' }).run();
  setPostingText(reg3.postingId, '   ', db3);
  expect(receiveFromBookmarklet(input(db3, { url }), db3).kind).toBe('existing');
  expect(db3.select().from(postings).all()[0].rawText).toContain(body(400));
  expect(db3.select().from(aiJobs).all()).toHaveLength(2);
});

test('TC-BM-12 cut notice for 60,000 chars', () => {
  const db = makeTestDb();
  const r = receiveFromBookmarklet(input(db, { title: '', text: 'a'.repeat(60_000) }), db);
  expect(r.kind).toBe('registered');
  if (r.kind !== 'registered') return;
  expect(r.notice.endsWith(' (본문이 길어 앞 5만 자만 저장했습니다)')).toBe(true);
  expect(db.select().from(postings).all()[0].rawText).toHaveLength(50_000);
});

test('TC-BM-13 action input check returns error and does not throw', async () => {
  const good = { token: 'abc', url: 'https://example.com/z', title: 't', text: body(400), cut: false };
  for (const bad of [
    { ...good, token: 123 },
    { token: 'abc', url: good.url, title: 't', cut: false },
    { ...good, text: 'a'.repeat(300_000) },
    null,
    'string',
  ]) {
    const r = await receiveBookmarkletAction(bad);
    expect(r.kind).toBe('error');
  }
});
