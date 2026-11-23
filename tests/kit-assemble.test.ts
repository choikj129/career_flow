import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGuide } from '@/lib/kit/parse-guide';
import { assemble } from '@/lib/kit/assemble';
import { findSection, listItems, parseMdDoc } from '@/lib/kit/md-doc';

const DIR = join(process.cwd(), 'tests', 'fixtures', 'kit');
// 체크아웃 줄바꿈(core.autocrlf)과 무관하게 LF로 읽는다. CRLF 입력은 kit-crlf 테스트가 따로 다룬다.
const read = (n: string) => readFileSync(join(DIR, n), 'utf8').replace(/\r\n/g, '\n');
const kit = parseGuide(read('서류_가이드.md')).guide!;
const base = { resumeMd: read('이력서_백엔드_v1_20260101.md'), careerMd: read('경력기술서_백엔드.md') };
const run = (profileId: string, adjustmentIds: string[] = []) => assemble(kit, base, { track: '백엔드', profileId, adjustmentIds });

const section = (md: string, title: string) => findSection(parseMdDoc(md), (t) => t.includes(title))!;
const items = (md: string, title: string, kind: 'bullet' | 'ordered') => listItems(section(md, title).lines, kind).items;

describe('assemble: intro and competencies (TC-KIT-10)', () => {
  test('default profile keeps the document except unselected personal projects', () => {
    const r = run('B1');
    expect(r.resumeMd.trimEnd()).toBe(base.resumeMd.replace('### 날씨 알림 봇\n\n날씨를 알려 주는 봇.\n\n', '').trimEnd());
    expect(r.careerMd.trimEnd()).toBe(base.careerMd.trimEnd());
  });
  test('intro replaced and competencies reordered', () => {
    const r = run('B2');
    expect(section(r.resumeMd, '자기소개').lines.join('\n')).toContain('성능과 안정성에 집중하는');
    expect(section(r.resumeMd, '자기소개').lines.join('\n')).not.toContain('범용 백엔드');
    expect(items(r.resumeMd, '핵심 역량', 'bullet').map((i) => i[0])).toEqual([
      '- **데이터베이스**: 쿼리 튜닝과 모델링',
      '- **API 설계**: 서버 개발 경험과 설계 원칙',
      '- **클라우드 운영**: 배포 자동화',
    ]);
  });
});

describe('assemble: achievements (TC-KIT-11)', () => {
  test('reordered, sub lines move together, numbers restart', () => {
    const it = items(assemble(kit, base, { track: '백엔드', profileId: 'B2', adjustmentIds: [] }).resumeMd, '주요 성과', 'ordered');
    expect(it.map((i) => i[0])).toEqual([
      '1. **캐시 도입**: 응답 시간 120ms 달성',
      '2. **주문 처리 개선**: 처리 시간을 40% 줄임',
      '3. **배치 안정화**: 장애 3건 제거',
    ]);
    expect(it[1].slice(1)).toEqual(['   - 병목 구간을 찾아 개선', '   - 모니터링 추가']);
  });
});

describe('assemble: career chapters (TC-KIT-12)', () => {
  test('chapters reordered and numbers (including N-k) renumbered', () => {
    const md = run('B2').careerMd;
    const titles = parseMdDoc(md)
      .children[0].children.map((c) => c.title);
    expect(titles.slice(0, 3)).toEqual(['1. 예시소프트 (2020 – 2022)', '2. 가상커머스 (2022 – 2024)', '3. 샘플랩 (2018 – 2020)']);
    const first = parseMdDoc(md).children[0].children[0];
    expect(first.children.map((c) => c.title)).toEqual(['1-1. 결제']);
    const second = parseMdDoc(md).children[0].children[1];
    expect(second.children.map((c) => c.title)).toEqual(['2-1. 주문 시스템', '2-2. 배치']);
    expect(md).toContain('## 기술 스택'); // 장이 아닌 구획은 그대로
  });
});

describe('assemble: personal projects (TC-KIT-13)', () => {
  const titles = (md: string) => section(md, '개인 프로젝트').children.map((c) => c.title);
  test('only the profile projects, in profile order', () => {
    expect(titles(run('B2').resumeMd)).toEqual(['날씨 알림 봇']);
    expect(titles(run('B1').resumeMd)).toEqual(['가계부 앱', '독서 기록 서비스']);
  });
  test('data track keeps profile order', () => {
    const r = assemble(kit, { resumeMd: read('이력서_데이터.md'), careerMd: read('경력기술서_데이터.md') }, { track: '데이터', profileId: 'D2', adjustmentIds: [] });
    expect(titles(r.resumeMd)).toEqual(['뉴스 요약기', '공공데이터 대시보드']);
  });
});

describe('assemble: additional adjustments (TC-KIT-14)', () => {
  const adj = (n: number) => `백엔드-${n}`;
  test('"주요 성과 N을 K번째로" is applied by code', () => {
    const r = run('B1', [adj(1)]);
    expect(items(r.resumeMd, '주요 성과', 'ordered').map((i) => i[0])).toEqual([
      '1. **캐시 도입**: 응답 시간 120ms 달성',
      '2. **주문 처리 개선**: 처리 시간을 40% 줄임',
      '3. **배치 안정화**: 장애 3건 제거',
    ]);
    expect(r.applied.some((a) => a.includes('추가 조정'))).toBe(true);
    expect(r.pending).toEqual([]);
  });
  test('"구획을 구획 바로 위로" moves a section', () => {
    const r = run('B1', [adj(3)]);
    const titles = parseMdDoc(r.resumeMd).children[0].children.map((c) => c.title);
    expect(titles.indexOf('개인 프로젝트')).toBe(titles.indexOf('기술 스택') - 1);
  });
  test('other instructions stay as pending', () => {
    const r = run('B1', [adj(2)]);
    expect(r.pending).toEqual(['주요 성과 2를 보강하는 문장을 직접 추가한다']);
    expect(r.resumeMd).toBe(run('B1').resumeMd); // 코드가 옮기지 못한 조정은 문서를 바꾸지 않는다
  });
});

describe('assemble: determinism and errors (TC-KIT-15)', () => {
  test('same input gives the same output', () => {
    expect(run('B2', [`백엔드-1`])).toEqual(run('B2', [`백엔드-1`]));
  });
  test('unknown profile or track throws', () => {
    expect(() => run('ZZ')).toThrow();
    expect(() => assemble(kit, base, { track: '없는직무', profileId: 'B1', adjustmentIds: [] })).toThrow();
  });
  test('applied summary mentions intro, orders and projects', () => {
    const a = run('B2').applied.join('\n');
    expect(a).toContain('자기소개: B2');
    expect(a).toContain('주요 성과 순서: 3 1 2');
    expect(a).toContain('경력기술서 장 순서: 2 1 3');
    expect(a).toContain('개인 프로젝트: 날씨 알림 봇');
  });
});
