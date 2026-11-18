import { describe, expect, test } from 'vitest';
import { makeTestDb } from './helpers/db';
import { assertHttpUrl, canonicalizeUrl, isHttpUrl } from '@/lib/domain/normalize';
import { registerPosting } from '@/lib/postings/repo';

describe('공고 주소 검사', () => {
  test('TC-NEW-12 http, https 만 허용한다', () => {
    expect(isHttpUrl('https://www.wanted.co.kr/wd/1')).toBe(true);
    expect(isHttpUrl(' http://example.com/a ')).toBe(true);
    for (const u of ['javascript:alert(1)', 'file:///C:/Windows/win.ini', 'ftp://a.com', 'data:text/html,x', 'not a url', '']) {
      expect(isHttpUrl(u), u).toBe(false);
      expect(() => assertHttpUrl(u), u).toThrow('올바른 공고 주소가 아닙니다');
    }
  });

  test('TC-NEW-12 registerPosting 은 http(s) 가 아닌 주소를 저장하지 않는다', () => {
    const db = makeTestDb();
    expect(() => registerPosting({ url: 'javascript:alert(1)' }, db)).toThrow('올바른 공고 주소가 아닙니다');
    expect(() => registerPosting({ url: 'file:///C:/x', pastedText: '본문' }, db)).toThrow('올바른 공고 주소가 아닙니다');
    expect(registerPosting({ url: 'https://example.com/job/1' }, db).existing).toBe(false);
  });

  test('TC-NEW-13 gclid, fbclid, mc_cid, mc_eid, igshid 도 추적 파라미터로 무시한다', () => {
    const base = 'https://example.com/job?id=7';
    for (const k of ['gclid', 'fbclid', 'mc_cid', 'mc_eid', 'igshid']) {
      expect(canonicalizeUrl(`${base}&${k}=abc`), k).toBe(base);
    }
  });
});

test('TC-NEW-TEXT-LIMIT 붙여넣은 본문도 5만 자를 넘으면 안내와 함께 거부한다', async () => {
  const { providePostingText } = await import('@/lib/postings/repo');
  const db = makeTestDb();
  expect(() => registerPosting({ pastedText: '가'.repeat(50_001) }, db)).toThrow('너무 깁니다');
  expect(registerPosting({ pastedText: '가'.repeat(50_000) }, db).existing).toBe(false);
  const { postingId } = registerPosting({ url: 'https://example.com/long' }, db);
  expect(() => providePostingText(postingId, '가'.repeat(50_001), db)).toThrow('너무 깁니다');
});
