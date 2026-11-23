import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGuide } from '@/lib/kit/parse-guide';
import { recommend } from '@/lib/kit/recommend';

const kit = parseGuide(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'kit', '서류_가이드.md'), 'utf8')).guide!;

describe('recommend (TC-KIT-16)', () => {
  test('profile by word count, track by word count', () => {
    const r = recommend(kit, {
      title: '서버 개발자',
      text: '대규모 트래픽을 처리하는 백엔드 서버. 성능 개선과 캐시 설계, 캐시 무효화. 레디스 경험 우대.',
    });
    expect(r.track).toBe('백엔드');
    expect(r.trackReason).toContain('공고 단어 수');
    expect(r.profiles[0]).toMatchObject({ id: 'B2', recommended: true });
    expect(r.profiles[0].matched).toEqual(expect.arrayContaining([{ word: '캐시', count: 2 }, { word: '트래픽', count: 1 }]));
    expect(r.profiles.map((p) => p.id)).toEqual(['B2', 'B1']);
    expect(r.profiles[0].score).toBeGreaterThan(r.profiles[1].score);
  });
  test('zero or tied counts recommend the default profile', () => {
    const none = recommend(kit, { title: '개발자', text: '아무 단어도 없는 공고' });
    expect(none.profiles.find((p) => p.recommended)!.id).toBe(none.track === '백엔드' ? 'B1' : 'D1');
    const tie = recommend(kit, { title: '백엔드 개발자', text: '성능 API' });
    expect(tie.profiles.find((p) => p.recommended)!.id).toBe('B1');
  });
  test('track from the position title', () => {
    const r = recommend(kit, { title: '데이터 엔지니어', text: '백엔드 백엔드 API API 성능 캐시' });
    expect(r.track).toBe('데이터');
    expect(r.trackReason).toContain('포지션명');
  });
  test('adjustments suggested when a trigger word appears; top words', () => {
    const r = recommend(kit, { title: '백엔드', text: '캐시 캐시 캐시 성능 성능 정산' });
    const byId = Object.fromEntries(r.adjustments.map((a) => [a.id, a]));
    expect(byId['백엔드-1']).toMatchObject({ suggested: true, matched: [{ word: '캐시', count: 3 }] });
    expect(byId['백엔드-2'].suggested).toBe(true);
    expect(byId['백엔드-3'].suggested).toBe(false);
    expect(r.topWords).toHaveLength(3);
    expect(r.topWords[0]).toEqual({ word: '캐시', count: 3 });
  });
  test('case-insensitive english words', () => {
    const k2 = { ...kit, profiles: kit.profiles.map((p) => (p.id === 'B2' ? { ...p, keywords: ['Redis'] } : p)) };
    const r = recommend(k2, { title: '백엔드', text: 'we use REDIS and redis' });
    expect(r.profiles[0]).toMatchObject({ id: 'B2', recommended: true });
    expect(r.profiles[0].matched).toEqual([{ word: 'Redis', count: 2 }]);
  });
});

describe('recommend with a chosen track (TC-KIT-16)', () => {
  test('counts only the chosen track even when the title or words point to another', () => {
    const r = recommend(kit, { title: '백엔드 개발자', text: '백엔드 API 성능 캐시 분석 모델링 데이터' }, { track: '데이터' });
    expect(r.track).toBe('데이터');
    expect(r.trackReason).toBe('고른 직무');
    expect(r.profiles.map((p) => p.id).sort()).toEqual(['D1', 'D2']);
    expect(r.profiles.find((p) => p.recommended)!.id).toBe('D2'); // 분석·모델링이 D2의 공고 단어
    expect(recommend(kit, { title: null, text: '캐시' }, { track: '없는직무' }).track).toBe('백엔드');
  });
});
