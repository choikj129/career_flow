import { describe, expect, test } from 'vitest';
import { diffResume } from '@/lib/resume/diff';
import { emptyResume, type ResumeContent } from '@/lib/resume/schema';

const base = (): ResumeContent => ({
  ...emptyResume(),
  basics: { name: '가상인', email: 'a@example.com', links: [{ label: '블로그', url: 'https://example.com' }] },
  summary: '서버 개발자입니다.',
  experiences: [
    { id: 'e1', company: '가상커머스', role: '백엔드', start: '2020-01', end: null, description: '주문 서버', achievements: ['캐시 도입', '배치 개선'] },
  ],
  projects: [{ id: 'p1', name: '가상 프로젝트', role: '리드', techStack: ['Java', 'Kafka'], achievements: ['지연 단축'] }],
  skills: [{ category: '언어', items: ['Java', 'SQL'] }],
  careerNarrative: '경력 소개',
});

describe('diffResume (TC-RESUME-DIFF-01)', () => {
  test('same content gives no changes', () => {
    expect(diffResume(base(), base())).toEqual([]);
  });

  test('a changed sentence shows before and after with its section', () => {
    const next = base();
    next.summary = '서버와 데이터 개발자입니다.';
    expect(diffResume(base(), next)).toEqual([
      { section: '한 줄 소개', label: '한 줄 소개', before: '서버 개발자입니다.', after: '서버와 데이터 개발자입니다.' },
    ]);
  });

  test('list items added, removed and reordered', () => {
    const next = base();
    next.experiences[0].achievements = ['배치 개선', '신규 항목'];
    const c = diffResume(base(), next);
    expect(c).toContainEqual({ section: '경력', label: '가상커머스 · 성과', before: '캐시 도입', after: null });
    expect(c).toContainEqual({ section: '경력', label: '가상커머스 · 성과', before: null, after: '신규 항목' });

    const reordered = base();
    reordered.projects[0].techStack = ['Kafka', 'Java'];
    expect(diffResume(base(), reordered)).toEqual([
      { section: '프로젝트', label: '가상 프로젝트 · 기술 스택 순서', before: 'Java / Kafka', after: 'Kafka / Java' },
    ]);
  });

  test('entries added and removed by id, optional fields treated as empty', () => {
    const next = base();
    next.experiences.push({ id: 'e2', company: '신규회사', role: '리드', start: '2024-01', end: null, description: '', achievements: [] });
    next.projects = [];
    next.basics.email = undefined;
    const c = diffResume(base(), next);
    expect(c).toContainEqual({ section: '경력', label: '추가', before: null, after: '신규회사 · 리드' });
    expect(c).toContainEqual({ section: '프로젝트', label: '삭제', before: '가상 프로젝트 · 리드', after: null });
    expect(c).toContainEqual({ section: '기본 정보', label: '이메일', before: 'a@example.com', after: null });
  });

  test('skills by category and narrative', () => {
    const next = base();
    next.skills = [{ category: '언어', items: ['Java', 'Kotlin'] }];
    next.careerNarrative = '바뀐 경력 소개';
    const c = diffResume(base(), next);
    expect(c).toContainEqual({ section: '기술 스택', label: '언어', before: 'SQL', after: null });
    expect(c).toContainEqual({ section: '기술 스택', label: '언어', before: null, after: 'Kotlin' });
    expect(c).toContainEqual({ section: '경력기술서', label: '경력기술서', before: '경력 소개', after: '바뀐 경력 소개' });
  });
});
