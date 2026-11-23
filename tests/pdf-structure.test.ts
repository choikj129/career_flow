import { describe, expect, test } from 'vitest';
import { mdToSectionHtml } from '@/lib/pdf/md-html';

// 사용자 PDF 도구(build_pdf.py)와 같은 HTML 구조여야 키트 CSS의 규칙(표 쪼개지 않기 등)이 그대로 걸린다.
const MD = [
  '# 가상 · 서버 개발자',
  '',
  '가상 메일 · 010-0000-0000',
  '',
  '---',
  '',
  '## 경력',
  '',
  '| | |',
  '|---|---|',
  '| 회사 | 가상상사 |',
  '',
  '| 처리량 | 응답 | 오류 |',
  '|---|---|---|',
  '| 2배 | 30% | 0건 |',
  '',
  '### 가상상사 · 2020 ~ 2024',
  '',
  '#### 주요 프로젝트',
  '',
  '| 기간 | 프로젝트 | 역할 | 기술 |',
  '|---|---|---|---|',
  '| 2021 ~ 2022 | 가상 시스템 | 개발 | Java |',
  '',
  '### 예시랩 · 2018 ~ 2020',
  '',
  '짧은 설명.',
  '',
  '## 기술 스택',
  '',
  '| 구분 | 기술 |',
  '|---|---|',
  '| 실무 | Java |',
].join('\n');

describe('PDF HTML 구조: 표 분류와 사례 묶음 (TC-PDF-09)', () => {
  const html = mdToSectionHtml(MD);

  test('"기간"으로 시작하는 4열 표는 proj (쪽에서 쪼개지지 않게 하는 CSS 대상)', () => {
    expect(html).toMatch(/<table class="proj">\s*<thead>[\s\S]*?기간/);
  });

  test('머리 칸이 모두 빈 표는 kv, 머리 줄을 없앤다', () => {
    const kv = /<table class="kv">([\s\S]*?)<\/table>/.exec(html);
    expect(kv).not.toBeNull();
    expect(kv![1]).not.toContain('<thead>');
    expect(kv![1]).toContain('가상상사');
  });

  test('한 줄짜리 3열 이상 표(기간·구분 없음)는 metrics', () => {
    expect(html).toMatch(/<table class="metrics">[\s\S]*?처리량/);
  });

  test('구분 표처럼 해당하지 않는 표는 class 없음', () => {
    expect(html).toMatch(/<table>\s*<thead>[\s\S]*?구분/);
  });

  test('h3마다 div.case로 묶고, h4가 있으면 case long', () => {
    expect(html).toMatch(/<div class="case long"><h3[^>]*>가상상사/);
    expect(html).toMatch(/<div class="case"><h3[^>]*>예시랩/);
    // 첫 h3 앞의 내용(kv·metrics 표)은 사례 밖에 남는다
    expect(html.indexOf('class="kv"')).toBeLessThan(html.indexOf('class="case'));
  });
});
