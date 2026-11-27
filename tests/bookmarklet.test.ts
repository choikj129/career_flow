import { expect, test } from 'vitest';
import { makeTestDb } from './helpers/db';
import {
  checkBookmarkletToken,
  getOrCreateBookmarkletToken,
  regenerateBookmarkletToken,
} from '@/lib/bookmarklet/token';
import { buildBookmarkletCode } from '@/lib/bookmarklet/code';
import { parseBookmarkletHash } from '@/lib/bookmarklet/payload';
import { normalizeReceivedText, receiveFromBookmarklet } from '@/lib/postings/receive';

test('TC-BM-01 token: create once, regenerate, check', async () => {
  const db = makeTestDb();
  expect(checkBookmarkletToken('anything', db)).toBe(false); // 저장 없음
  const a = getOrCreateBookmarkletToken(db);
  const b = getOrCreateBookmarkletToken(db);
  expect(b).toEqual(a);
  expect(a.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
  expect(Number.isNaN(Date.parse(a.createdAt))).toBe(false);

  expect(checkBookmarkletToken(a.token, db)).toBe(true);
  expect(checkBookmarkletToken('', db)).toBe(false);
  expect(checkBookmarkletToken(a.token + 'x', db)).toBe(false);
  expect(checkBookmarkletToken(a.token.slice(1), db)).toBe(false);
  expect(checkBookmarkletToken('x'.repeat(32), db)).toBe(false);
  expect(checkBookmarkletToken(12345, db)).toBe(false);
  expect(checkBookmarkletToken(null, db)).toBe(false);

  await new Promise((r) => setTimeout(r, 5));
  const c = regenerateBookmarkletToken(db);
  expect(c.token).not.toBe(a.token);
  expect(c.createdAt).not.toBe(a.createdAt);
  expect(checkBookmarkletToken(a.token, db)).toBe(false);
  expect(checkBookmarkletToken(c.token, db)).toBe(true);
  expect(getOrCreateBookmarkletToken(db)).toEqual(c);
});

test('TC-BM-02 buildBookmarkletCode makes a valid one-line javascript: url', () => {
  const token = 'tok_en-ABC123';
  const appOrigin = 'http://127.0.0.1:3939';
  const code = buildBookmarkletCode({ token, appOrigin });
  expect(code.startsWith('javascript:')).toBe(true);
  expect(code).not.toMatch(/[\r\n]/);
  expect(code.length).toBeLessThanOrEqual(6000);
  const source = decodeURIComponent(code.slice('javascript:'.length));
  expect(() => new Function(source)).not.toThrow();
  expect(source).toContain(JSON.stringify(token));
  expect(source).toContain(JSON.stringify(appOrigin));
  expect(source).not.toContain('__TOKEN__');
  expect(source).not.toContain('__APP__');
});

test('TC-BM-03 parseBookmarkletHash', () => {
  const p = { v: 1, k: 'tok', u: 'https://example.com/a', t: '제목', x: '본문\n둘째 줄 %20 #', c: false };
  const hash = '#cf=' + encodeURIComponent(JSON.stringify(p));
  expect(parseBookmarkletHash(hash)).toEqual(p);
  expect(parseBookmarkletHash('')).toBeNull();
  expect(parseBookmarkletHash('#x=' + encodeURIComponent(JSON.stringify(p)))).toBeNull();
  expect(parseBookmarkletHash('#cf=' + encodeURIComponent('{broken'))).toBeNull();
  expect(parseBookmarkletHash('#cf=%E0%A4%A')).toBeNull(); // 잘못된 % 인코딩
  expect(parseBookmarkletHash('#cf=' + encodeURIComponent(JSON.stringify({ ...p, v: 2 })))).toBeNull();
  const { x, ...noText } = p;
  void x;
  expect(parseBookmarkletHash('#cf=' + encodeURIComponent(JSON.stringify(noText)))).toBeNull();
  expect(parseBookmarkletHash('#cf=' + encodeURIComponent(JSON.stringify({ ...p, k: 1 })))).toBeNull();
  expect(parseBookmarkletHash('#cf=' + encodeURIComponent(JSON.stringify({ ...p, c: 'no' })))).toBeNull();
  expect(parseBookmarkletHash('#cf=' + encodeURIComponent('[1,2]'))).toBeNull();
});

test('TC-BM-04 normalizeReceivedText', () => {
  const messy = '앞줄   \r\n\r\n\r\n\r\n\r\n\r\n뒷줄\t \r\n  ';
  const n = normalizeReceivedText('  가상 공고 제목  ', messy, false);
  expect(n.text).toBe('페이지 제목: 가상 공고 제목\n\n앞줄\n\n\n뒷줄');
  expect(n.cut).toBe(false);
  expect(n.bodyLength).toBe('앞줄\n\n\n뒷줄'.length);

  const noTitle = normalizeReceivedText('', ' 본문만 ', false);
  expect(noTitle.text).toBe('본문만');

  const long = normalizeReceivedText('', 'a'.repeat(50_001), false);
  expect(long.text.length).toBe(50_000);
  expect(long.cut).toBe(true);
  expect(long.bodyLength).toBe(50_001);

  // 북마크 버튼이 이미 잘랐으면 cut 유지
  expect(normalizeReceivedText('', 'abc', true).cut).toBe(true);
  // 제목은 300자로 자른다
  expect(
    normalizeReceivedText('가'.repeat(400), 'abc', false).text.startsWith('페이지 제목: ' + '가'.repeat(300) + '\n\n'),
  ).toBe(true);
});

// ───────── 북마크 버튼 코드를 가짜 화면(document·window)에서 실행해 본다 ─────────
import { BOOKMARKLET_SOURCE } from '@/lib/bookmarklet/code';

function runBookmarklet(page: { text: string; title: string; href: string }) {
  const opened: string[] = [];
  const alerts: string[] = [];
  const body = { innerText: page.text, querySelectorAll: () => [] as unknown[] };
  const doc = {
    title: page.title,
    body,
    querySelector: () => null,
    querySelectorAll: () => [] as unknown[],
  };
  const source = BOOKMARKLET_SOURCE.replace(/\n\s*/g, '')
    .replace('__APP__', JSON.stringify('http://127.0.0.1:3939'))
    .replace('__TOKEN__', JSON.stringify('tok'));
  new Function('location', 'document', 'window', 'alert', 'setTimeout', source)(
    { origin: 'https://jobs.example.com', href: page.href },
    doc,
    { open: (u: string) => opened.push(u) },
    (m: string) => alerts.push(m),
    (fn: () => void) => fn(),
  );
  const hash = opened[0]?.split('#cf=')[1];
  return { alerts, payload: hash ? (JSON.parse(decodeURIComponent(hash)) as Record<string, unknown>) : null };
}

test('TC-BM-02b surrogate pairs are not split and lone surrogates do not break sending', () => {
  // 50,000자 경계에 이모지(서로게이트 쌍)가 걸린다: 49,999자 + 😀(2자) + 나머지
  const cutAtPair = 'a'.repeat(49_999) + '😀' + 'b'.repeat(10);
  const r1 = runBookmarklet({ text: cutAtPair, title: '제목', href: 'https://jobs.example.com/1' });
  expect(r1.alerts).toEqual([]);
  expect(r1.payload!.c).toBe(true);
  expect((r1.payload!.x as string).length).toBe(49_999);
  expect(() => encodeURIComponent(r1.payload!.x as string)).not.toThrow();

  // 짝 없는 서로게이트는 대체 문자로 바꾼다
  const r2 = runBookmarklet({ text: '가'.repeat(400) + '\uD83D 끝\uDE00', title: '제\uD83D목', href: 'https://jobs.example.com/2' });
  expect(r2.alerts).toEqual([]);
  expect(r2.payload!.x).toContain('�');
  expect(r2.payload!.t).toBe('제�목');
});

test('TC-BM-02c long title is cut to 300 and the server accepts long urls', async () => {
  const longUrl = 'https://jobs.example.com/1?' + 'utm_x=' + 'a'.repeat(4000);
  const r = runBookmarklet({ text: '가'.repeat(400), title: '긴'.repeat(2000), href: longUrl });
  expect((r.payload!.t as string).length).toBe(300);
  expect(r.payload!.u).toBe(longUrl);
  const { receiveBookmarkletAction } = await import('@/app/_actions/bookmarklet');
  // 긴 주소는 서버 검사를 통과해 등록된다(저장은 canonicalizeUrl 기준)
  const db = makeTestDb();
  const reg = receiveFromBookmarklet(
    { token: getOrCreateBookmarkletToken(db).token, url: longUrl, title: r.payload!.t as string, text: '가'.repeat(400), cut: false },
    db,
  );
  expect(reg.kind).toBe('registered');
  const bad = await receiveBookmarkletAction({ token: 'x', url: 'https://a.com/' + 'a'.repeat(9000), title: 't', text: 'x', cut: false });
  expect(bad.kind).toBe('error');
  if (bad.kind === 'error') expect(bad.message).toContain('url');
});

test('TC-BM-04b server cut is surrogate safe', () => {
  const n = normalizeReceivedText('', 'a'.repeat(49_999) + '😀' + 'b', false);
  expect(n.cut).toBe(true);
  expect(n.text.length).toBe(49_999);
});
