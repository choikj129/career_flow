import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGuide } from '@/lib/kit/parse-guide';
import { checkTailored } from '@/lib/kit/checks';
import { lineDiff } from '@/lib/kit/line-diff';
import { assemble } from '@/lib/kit/assemble';

const DIR = join(process.cwd(), 'tests', 'fixtures', 'kit');
const read = (n: string) => readFileSync(join(DIR, n), 'utf8');
const kit = parseGuide(read('서류_가이드.md')).guide!;
const base = { resumeMd: read('이력서_백엔드_v1_20260101.md'), careerMd: read('경력기술서_백엔드.md') };
const masterMd = read('마스터스토리.md');
const stage1 = assemble(kit, base, { track: '백엔드', profileId: 'B2', adjustmentIds: [] });

const check = (final: { resumeMd: string; careerMd: string }, otherCompanyNames: string[] = []) =>
  checkTailored({ kit, stage1, final, base, masterMd, otherCompanyNames });
const kinds = (r: ReturnType<typeof check>) => r.warnings.map((w) => w.kind);

describe('checkTailored: numbers (TC-KIT-20)', () => {
  test('same document has no warnings', () => {
    const r = check(stage1);
    expect(r.warnings).toEqual([]);
    expect(r.final).toEqual({ resumeMd: stage1.resumeMd, careerMd: stage1.careerMd });
  });
  test('new number in the master story vs not in it', () => {
    const final = {
      ...stage1,
      resumeMd: stage1.resumeMd.replace('장애 3건 제거', '장애 3건 제거, 동시 접속 2만 명 검증').replace('처리 시간을 40% 줄임', '처리 시간을 75% 줄임'),
    };
    const r = check(final);
    const fromMaster = r.warnings.find((w) => w.kind === 'new_fact_from_master')!;
    expect(fromMaster.detail).toContain('2만');
    expect(fromMaster.detail).toContain('마스터스토리에 있는 수치');
    const unknown = r.warnings.find((w) => w.kind === 'new_number')!;
    expect(unknown.detail).toContain('75%');
    expect(unknown.detail).toContain('기본 서류와 마스터스토리에 없는');
    expect(unknown.doc).toBe('resume');
  });
});

describe('checkTailored: intro, structure, stack (TC-KIT-21, 22)', () => {
  test('changed intro is restored to the assembled one', () => {
    const final = { ...stage1, resumeMd: stage1.resumeMd.replace('성능과 안정성에 집중하는 백엔드 개발자입니다.', '세계 최고의 개발자입니다.') };
    const r = check(final);
    expect(kinds(r)).toContain('intro_restored');
    expect(r.final.resumeMd).toContain('성능과 안정성에 집중하는');
    expect(r.final.resumeMd).not.toContain('세계 최고');
  });
  test('structure changes: heading removed, achievement count, chapter order', () => {
    const noHeading = { ...stage1, resumeMd: stage1.resumeMd.replace('## 핵심 역량', '## 역량') };
    expect(kinds(check(noHeading))).toContain('structure_changed');
    const fewer = { ...stage1, resumeMd: stage1.resumeMd.replace(/3\. \*\*배치 안정화\*\*: 장애 3건 제거\n/, '') };
    expect(check(fewer).warnings.some((w) => w.kind === 'structure_changed' && w.detail.includes('주요 성과'))).toBe(true);
    const swapped = {
      ...stage1,
      careerMd: stage1.careerMd.replace('## 1. 예시소프트', '## 1. TMP').replace('## 2. 가상커머스', '## 2. 예시소프트').replace('## 1. TMP', '## 1. 가상커머스'),
    };
    expect(check(swapped).warnings.some((w) => w.kind === 'structure_changed' && w.doc === 'career')).toBe(true);
  });
  test('tech stack line change', () => {
    const final = { ...stage1, resumeMd: stage1.resumeMd.replace('- 언어: Java, Kotlin', '- 언어: Java, Kotlin, Go') };
    const r = check(final);
    expect(r.warnings.find((w) => w.kind === 'stack_changed')).toMatchObject({ doc: 'resume' });
  });
  test('stack line order does not matter', () => {
    const final = { ...stage1, resumeMd: stage1.resumeMd.replace('- 언어: Java, Kotlin\n- 인프라: AWS, Docker', '- 인프라: AWS, Docker\n- 언어: Java, Kotlin') };
    expect(kinds(check(final))).not.toContain('stack_changed');
  });
});

describe('checkTailored: forbidden terms and other companies (TC-KIT-23, 24)', () => {
  test('forbidden term newly added warns; one already in the base does not', () => {
    const added = { ...stage1, resumeMd: stage1.resumeMd.replace('쿼리 튜닝과 모델링', '쿼리 튜닝과 모델링, 업계 최고 수준') };
    expect(check(added).warnings.find((w) => w.kind === 'forbidden_term')!.detail).toContain('업계 최고');
    const baseWith = { ...base, resumeMd: base.resumeMd.replace('쿼리 튜닝과 모델링', '풀스택 전문가') };
    const stage = assemble(kit, baseWith, { track: '백엔드', profileId: 'B2', adjustmentIds: [] });
    const r = checkTailored({ kit, stage1: stage, final: stage, base: baseWith, masterMd, otherCompanyNames: [] });
    expect(r.warnings.map((w) => w.kind)).not.toContain('forbidden_term');
  });
  test('other company name', () => {
    const final = { ...stage1, careerMd: stage1.careerMd.replace('결제 모듈을 연동했다.', '결제 모듈을 연동했다. 가나다상사 사례를 참고했다.') };
    const r = check(final, ['가나다상사', '예시소프트', 'A']);
    const w = r.warnings.filter((x) => x.kind === 'other_company');
    expect(w).toHaveLength(1);
    expect(w[0].detail).toContain('가나다상사');
  });
});

describe('lineDiff (TC-KIT-25)', () => {
  test('marks same, deleted and inserted lines', () => {
    expect(lineDiff('a\nb\nc', 'a\nx\nc')).toEqual([
      { text: 'a', op: 'same' },
      { text: 'b', op: 'del' },
      { text: 'x', op: 'ins' },
      { text: 'c', op: 'same' },
    ]);
    expect(lineDiff('', '')).toEqual([]);
    expect(lineDiff('a', 'a\nb')).toEqual([
      { text: 'a', op: 'same' },
      { text: 'b', op: 'ins' },
    ]);
  });
});
