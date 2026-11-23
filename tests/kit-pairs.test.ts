import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { parseGuide } from '@/lib/kit/parse-guide';
import { itemName, pairParts } from '@/lib/kit/pairs';

const DIR = join(process.cwd(), 'tests', 'fixtures', 'kit');
const read = (n: string) => readFileSync(join(DIR, n), 'utf8');
const track = parseGuide(read('서류_가이드.md')).guide!.tracks[0];

describe('pairParts (TC-KIT-34)', () => {
  test('itemName keeps only the name part', () => {
    expect(itemName('- **API 설계**: 서버 개발 경험과 설계 원칙')).toBe('API 설계');
    expect(itemName('2. 배치 안정화: 장애 3건 제거')).toBe('배치 안정화');
    expect(itemName('1. **아주 긴 이름 '.padEnd(80, '가') + '**: 설명')).toMatch(/…$/);
  });

  test('the fixture kit pairs every part of the backend track with a heading', () => {
    const rows = pairParts(track, read('이력서_백엔드_v1_20260101.md'), read('경력기술서_백엔드.md'));
    expect(rows.filter((r) => r.found == null)).toEqual([]);
    expect(rows.find((r) => r.part === '핵심 역량 ⓐ')).toMatchObject({ name: 'API 설계', found: 'API 설계' });
    expect(rows.find((r) => r.part === '주요 성과 1')).toMatchObject({ name: '주문 처리 개선', found: '주문 처리 개선' });
    expect(rows.find((r) => r.part === '경력기술서 1장')?.found).toContain('가상커머스');
    expect(rows.filter((r) => r.part === '개인 프로젝트' && r.doc === 'resume').map((r) => r.name)).toEqual(['가계부 앱', '독서 기록 서비스', '날씨 알림 봇']);
    // 문장·수치는 짝 표에 나오지 않는다
    expect(JSON.stringify(rows)).not.toContain('40%');
  });

  test('a part that is missing in the document has found = null', () => {
    const rows = pairParts(track, '# 가 · 나\n\n## 핵심 역량\n\n- **API 설계**: x', '# 가 · 나');
    expect(rows.find((r) => r.name === '데이터베이스')?.found).toBeNull();
    expect(rows.find((r) => r.part === '주요 성과 1')?.found).toBeNull();
    expect(rows.find((r) => r.part === '경력기술서 1장')?.found).toBeNull();
  });
});
