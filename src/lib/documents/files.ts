import { validDate } from '@/lib/domain/dates';

// 클라이언트 컴포넌트에서도 쓴다. 파일 시스템·DB에 닿는 모듈을 import하지 않는다.

export const DOC_KINDS = ['resume', 'career', 'portfolio'] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export const DOC_KIND_LABELS: Record<DocKind, string> = {
  resume: '이력서',
  career: '경력기술서',
  portfolio: '포트폴리오',
};

/** 값은 파일 이름(예 `이력서_20261102.pdf`) 또는 null(모름) */
export type SubmittedDocs = Partial<Record<DocKind, string | null>>;
/** date는 YYYY-MM-DD */
export type DocFile = { kind: DocKind; date: string; fileName: string };

const NAME_RE = /^(이력서|경력기술서|포트폴리오)_(\d{8})\.pdf$/;
const KIND_BY_LABEL = Object.fromEntries(DOC_KINDS.map((k) => [DOC_KIND_LABELS[k], k])) as Record<string, DocKind>;

export function docFileName(kind: DocKind, date: string): string {
  return `${DOC_KIND_LABELS[kind]}_${date.replaceAll('-', '')}.pdf`;
}

/** 이름 규칙에 맞고 실제 있는 날짜일 때만 DocFile. 아니면 null. */
export function parseDocFileName(name: string): DocFile | null {
  const m = NAME_RE.exec(name);
  if (!m) return null;
  const d = m[2];
  const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  if (!validDate(date)) return null;
  return { kind: KIND_BY_LABEL[m[1]], date, fileName: name };
}

/** `이력서 2026-11-02`. 규칙에 안 맞으면 이름 그대로. */
export function docLabel(fileName: string): string {
  const f = parseDocFileName(fileName);
  return f ? `${DOC_KIND_LABELS[f.kind]} ${f.date}` : fileName;
}

/** 그 종류 중 지원일과 같거나 앞선 가장 늦은 파일 이름. 없거나 지원일이 잘못되면 null. */
export function pickDocFile(kind: DocKind, appliedAt: string, files: DocFile[]): string | null {
  if (!validDate(appliedAt)) return null;
  let best: DocFile | null = null;
  for (const f of files) {
    if (f.kind !== kind || f.date > appliedAt) continue;
    if (!best || f.date > best.date) best = f;
  }
  return best?.fileName ?? null;
}

export function pickDocs(appliedAt: string, files: DocFile[]): Record<DocKind, string | null> {
  return {
    resume: pickDocFile('resume', appliedAt, files),
    career: pickDocFile('career', appliedAt, files),
    portfolio: pickDocFile('portfolio', appliedAt, files),
  };
}

export function isDocsForKind(kind: DocKind, fileName: string): boolean {
  return parseDocFileName(fileName)?.kind === kind;
}
