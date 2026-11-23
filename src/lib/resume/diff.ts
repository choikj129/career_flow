import type { ResumeContent } from './schema';

// 기본 이력서(앱 JSON) 두 버전의 차이. 버전 기록의 "직전 버전과 비교"가 쓴다(화면 문서 5.3). 순수 함수라 클라이언트에서도 쓴다.

export type ResumeChange = { section: string; label: string; before: string | null; after: string | null };

const text = (v: string | null | undefined) => (v ?? '').trim();

function scalar(out: ResumeChange[], section: string, label: string, a: string | null | undefined, b: string | null | undefined) {
  if (text(a) === text(b)) return;
  out.push({ section, label, before: text(a) || null, after: text(b) || null });
}

/** 글 목록: 빠진 항목, 새 항목, (둘 다 없고 순서만 다르면) 순서 변경 */
function list(out: ResumeChange[], section: string, label: string, a: string[], b: string[]) {
  const removed = a.filter((x) => !b.includes(x));
  const added = b.filter((x) => !a.includes(x));
  for (const x of removed) out.push({ section, label, before: x, after: null });
  for (const x of added) out.push({ section, label, before: null, after: x });
  if (removed.length === 0 && added.length === 0 && a.join('\n') !== b.join('\n')) {
    out.push({ section, label: `${label} 순서`, before: a.join(' / '), after: b.join(' / ') });
  }
}

/** 항목 목록(id나 이름이 같은 것끼리 짝). 추가·삭제와 짝의 변경 */
function entries<T>(
  out: ResumeChange[],
  section: string,
  a: T[],
  b: T[],
  key: (x: T) => string,
  title: (x: T) => string,
  compare: (out: ResumeChange[], title: string, x: T, y: T) => void,
) {
  for (const x of a) {
    const y = b.find((z) => key(z) === key(x));
    if (!y) out.push({ section, label: '삭제', before: title(x), after: null });
    else compare(out, title(y), x, y);
  }
  for (const y of b) if (!a.some((x) => key(x) === key(y))) out.push({ section, label: '추가', before: null, after: title(y) });
}

export function diffResume(prev: ResumeContent, next: ResumeContent): ResumeChange[] {
  const out: ResumeChange[] = [];

  const B = '기본 정보';
  scalar(out, B, '이름', prev.basics.name, next.basics.name);
  scalar(out, B, '이메일', prev.basics.email, next.basics.email);
  scalar(out, B, '전화', prev.basics.phone, next.basics.phone);
  list(out, B, '링크', prev.basics.links.map((l) => `${l.label} ${l.url}`), next.basics.links.map((l) => `${l.label} ${l.url}`));

  scalar(out, '한 줄 소개', '한 줄 소개', prev.summary, next.summary);

  entries(
    out,
    '경력',
    prev.experiences,
    next.experiences,
    (e) => e.id,
    (e) => `${e.company} · ${e.role}`,
    (o, t, x, y) => {
      scalar(o, '경력', `${t} · 회사`, x.company, y.company);
      scalar(o, '경력', `${t} · 직무`, x.role, y.role);
      scalar(o, '경력', `${t} · 시작`, x.start, y.start);
      scalar(o, '경력', `${t} · 종료`, x.end, y.end);
      scalar(o, '경력', `${t} · 설명`, x.description, y.description);
      list(o, '경력', `${y.company} · 성과`, x.achievements, y.achievements);
    },
  );

  entries(
    out,
    '프로젝트',
    prev.projects,
    next.projects,
    (p) => p.id,
    (p) => (p.role ? `${p.name} · ${p.role}` : p.name),
    (o, t, x, y) => {
      scalar(o, '프로젝트', `${y.name} · 이름`, x.name, y.name);
      scalar(o, '프로젝트', `${y.name} · 역할`, x.role, y.role);
      scalar(o, '프로젝트', `${y.name} · 조직`, x.org, y.org);
      list(o, '프로젝트', `${y.name} · 기술 스택`, x.techStack, y.techStack);
      list(o, '프로젝트', `${y.name} · 성과`, x.achievements, y.achievements);
      void t;
    },
  );

  entries(
    out,
    '기술 스택',
    prev.skills,
    next.skills,
    (s) => s.category,
    (s) => s.category,
    (o, _t, x, y) => list(o, '기술 스택', y.category, x.items, y.items),
  );

  const flat = <T,>(section: string, a: T[], b: T[], show: (x: T) => string) =>
    entries(out, section, a, b, show, show, () => undefined);
  flat('학력', prev.education, next.education, (e) => [e.school, e.major, e.degree, e.start, e.end].filter(Boolean).join(' · '));
  flat('자격증·수상·교육', prev.certifications, next.certifications, (c) => [c.name, c.issuer, c.date].filter(Boolean).join(' · '));
  flat('포트폴리오', prev.portfolio, next.portfolio, (p) => [p.title, p.url ?? p.filePath, p.summary].filter(Boolean).join(' · '));

  scalar(out, '경력기술서', '경력기술서', prev.careerNarrative, next.careerNarrative);
  return out;
}
