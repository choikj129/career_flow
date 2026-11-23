import type { KitError, Track } from './types';

// 마크다운 문서를 제목 단위 블록으로 읽고 다시 쓴다. 순수 함수라 클라이언트에서도 쓴다.

export type MdBlock = { level: number; title: string; lines: string[]; children: MdBlock[] };

/** 줄바꿈을 \n으로 통일한다(Windows에서 저장된 파일은 \r\n일 수 있다). */
export const normalizeNewlines = (s: string): string => s.replace(/\r\n?/g, '\n');

const HEADING = /^(#{1,6})\s+(.*?)\s*$/;

/** level 0은 문서 머리(첫 제목 앞). 코드 블록(```) 안의 # 줄은 제목이 아니다. */
export function parseMdDoc(md: string): MdBlock {
  const root: MdBlock = { level: 0, title: '', lines: [], children: [] };
  const stack: MdBlock[] = [root];
  let fenced = false;
  for (const line of normalizeNewlines(md).split('\n')) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    const m = fenced ? null : HEADING.exec(line);
    if (m) {
      const block: MdBlock = { level: m[1].length, title: m[2], lines: [], children: [] };
      while (stack.length > 1 && stack[stack.length - 1].level >= block.level) stack.pop();
      stack[stack.length - 1].children.push(block);
      stack.push(block);
    } else {
      stack[stack.length - 1].lines.push(line);
    }
  }
  return root;
}

export function renderMdDoc(doc: MdBlock): string {
  const out: string[] = [];
  const walk = (b: MdBlock) => {
    if (b.level > 0) out.push(`${'#'.repeat(b.level)} ${b.title}`);
    out.push(...b.lines);
    for (const c of b.children) walk(c);
  };
  walk(doc);
  return out.join('\n');
}

/** 제목이 조건에 맞는 첫 블록(깊이 우선). */
export function findSection(doc: MdBlock, match: (title: string) => boolean): MdBlock | null {
  for (const c of doc.children) {
    if (match(c.title)) return c;
    const deep = findSection(c, match);
    if (deep) return deep;
  }
  return null;
}

/** 제목이 조건에 맞는 모든 블록(깊이 우선). */
export function findSections(doc: MdBlock, match: (title: string) => boolean): MdBlock[] {
  const out: MdBlock[] = [];
  const walk = (b: MdBlock) => {
    for (const c of b.children) {
      if (match(c.title)) out.push(c);
      walk(c);
    }
  };
  walk(doc);
  return out;
}

const BULLET = /^[-*+]\s/;
const ORDERED = /^\d+[.)]\s/;

/**
 * 첫 단계 목록 항목. 항목마다 그 항목의 줄과 들여쓴 하위 줄(사이의 빈 줄 포함)을 한 묶음으로 둔다.
 * before = 첫 항목 앞 줄, after = 마지막 항목 뒤에 이어진 줄(목록이 끝난 뒤의 내용·빈 줄).
 */
export function listItems(lines: string[], kind: 'bullet' | 'ordered'): { items: string[][]; before: string[]; after: string[] } {
  const isItem = (l: string) => (kind === 'bullet' ? BULLET.test(l) : ORDERED.test(l));
  const before: string[] = [];
  let i = 0;
  while (i < lines.length && !isItem(lines[i])) before.push(lines[i++]);
  const items: string[][] = [];
  let blanks: string[] = [];
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (isItem(l)) {
      if (items.length > 0) items[items.length - 1].push(...blanks);
      blanks = [];
      items.push([l]);
    } else if (l.trim() === '') {
      blanks.push(l);
    } else if (/^\s/.test(l) && items.length > 0) {
      items[items.length - 1].push(...blanks, l);
      blanks = [];
    } else {
      break; // 목록이 끝났다
    }
  }
  return { items, before, after: [...blanks, ...lines.slice(i)] };
}

const norm = (s: string) => s.replace(/\s+/g, '');

/** 개인 프로젝트 이름과 제목이 맞는지: 공백을 뺀 글자가 들어 있거나 이름의 낱말이 모두 들어 있다. */
export function projectMatches(name: string, title: string): boolean {
  if (norm(title).includes(norm(name))) return true;
  const words = name.split(/\s+/).filter(Boolean);
  return words.length > 0 && words.every((w) => title.includes(w));
}

/** 개인 프로젝트 구획(제목이 "개인 프로젝트"로 시작)의 3단계 제목 블록들. */
export function projectBlocks(doc: MdBlock): { section: MdBlock; blocks: MdBlock[] } | null {
  const section = findSection(doc, (t) => t.trim().startsWith('개인 프로젝트'));
  return section ? { section, blocks: section.children.filter((c) => c.level === section.level + 1) } : null;
}

/** 경력기술서의 `## N. …` 장 블록들 */
export function chapterBlocks(doc: MdBlock): MdBlock[] {
  return findSections(doc, (t) => /^\d+\./.test(t.trim())).filter((c) => c.level === 2);
}

/** 번호표 개수와 기본 서류 md에서 찾은 개수를 비교하고, 개인 프로젝트 이름을 제목과 짝짓는다. */
export function checkBaseDoc(doc: MdBlock, track: Track, kind: 'resume' | 'career'): KitError[] {
  const errors: KitError[] = [];
  const file = kind === 'resume' ? track.resumeFile : track.careerFile;
  const label = kind === 'resume' ? '이력서' : '경력기술서';
  const add = (where: string, message: string) => errors.push({ file, where: `${label} ${where}`, message });

  if (kind === 'resume') {
    const comp = findSection(doc, (t) => t.includes('핵심 역량'));
    if (!comp) add('"핵심 역량" 구획', '구획을 찾을 수 없습니다');
    else {
      const n = listItems(comp.lines, 'bullet').items.length;
      if (n !== track.parts.competencies.length) add('"핵심 역량" 구획', `항목이 ${n}개인데 번호표에는 ${track.parts.competencies.length}개입니다`);
    }
    const ach = findSection(doc, (t) => t.includes('주요 성과'));
    if (!ach) add('"주요 성과" 구획', '구획을 찾을 수 없습니다');
    else {
      const n = listItems(ach.lines, 'ordered').items.length;
      if (n !== track.parts.achievements.length) add('"주요 성과" 구획', `항목이 ${n}개인데 번호표에는 ${track.parts.achievements.length}개입니다`);
    }
  } else {
    const n = chapterBlocks(doc).length;
    if (n !== track.parts.chapters.length) add('"## N." 장', `장이 ${n}개인데 번호표에는 ${track.parts.chapters.length}개입니다`);
  }

  const proj = projectBlocks(doc);
  if (proj) {
    for (const name of track.parts.projects) {
      const hits = proj.blocks.filter((b) => projectMatches(name, b.title)).length;
      if (hits !== 1) add('"개인 프로젝트" 구획', `개인 프로젝트 "${name}"에 맞는 제목이 ${hits}개입니다(1개여야 합니다)`);
    }
  } else if (kind === 'resume' && track.parts.projects.length > 0) {
    add('"개인 프로젝트" 구획', '구획을 찾을 수 없습니다');
  }
  return errors;
}
