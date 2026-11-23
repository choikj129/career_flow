import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { makeTestDb } from './helpers/db';
import { makeTmpDir } from './helpers/tmp';
import { saveKit } from '@/lib/kit/repo';

const DIR = join(process.cwd(), 'tests', 'fixtures', 'kit');

describe('가이드 파일 고르기 (TC-KIT-38)', () => {
  test('작성 규칙에 "번호표"·"자기소개 후보" 글자가 있어도, 이름에 "가이드"가 든 파일을 가이드로 고른다', () => {
    const files = readdirSync(DIR).map((name) => {
      const data = readFileSync(join(DIR, name));
      if (name !== '작성_규칙.md') return { name, data };
      // 규칙 문서가 가이드의 구획 이름을 언급하는 경우
      return { name, data: Buffer.concat([data, Buffer.from('\n- 번호표와 자기소개 후보는 가이드를 따른다.\n')]) };
    });
    const { errors } = saveKit(files, makeTestDb(), makeTmpDir('cf-kit-'));
    expect(errors).toEqual([]);
  });

  test('이름에 "가이드"가 없으면 내용(번호표·자기소개 후보)으로 찾는다', () => {
    const files = readdirSync(DIR).map((name) => ({
      name: name === '서류_가이드.md' ? '공고맞춤_안내.md' : name,
      data: readFileSync(join(DIR, name)),
    }));
    const { errors } = saveKit(files, makeTestDb(), makeTmpDir('cf-kit-'));
    expect(errors).toEqual([]);
  });
});
