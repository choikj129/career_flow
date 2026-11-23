import { chapterBlocks, findSection, listItems, parseMdDoc, projectBlocks, projectMatches } from './md-doc';
import type { Track } from './types';

// 서류 키트 화면의 "부품 짝" 표: 번호표 이름이 기본 서류에서 어느 제목·항목과 짝지어졌는지. 순수 함수다.
// 서류 내용(문장·수치)은 보이지 않게 이름 부분만 꺼낸다.

export type PairRow = { doc: 'resume' | 'career'; part: string; name: string; found: string | null };

/** 항목 첫 줄에서 이름만: 앞의 `- `·`1.`·굵은 표시를 벗기고 `**이름**` 또는 `:` 앞까지, 길면 자른다 */
export function itemName(firstLine: string): string {
  const t = firstLine.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').trim();
  const bold = /^\*\*(.+?)\*\*/.exec(t);
  const raw = bold ? bold[1] : t.split(/[:：]/)[0];
  const s = raw.replace(/[*_`]/g, '').trim();
  return s.length > 40 ? `${s.slice(0, 40)}…` : s;
}

export function pairParts(track: Track, resumeMd: string, careerMd: string): PairRow[] {
  const out: PairRow[] = [];
  const resume = parseMdDoc(resumeMd);
  const career = parseMdDoc(careerMd);

  const comp = findSection(resume, (t) => t.includes('핵심 역량'));
  const compItems = comp ? listItems(comp.lines, 'bullet').items : [];
  track.parts.competencies.forEach((name, i) => {
    out.push({ doc: 'resume', part: `핵심 역량 ${'ⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛ'[i] ?? i + 1}`, name, found: compItems[i] ? itemName(compItems[i][0]) : null });
  });
  const ach = findSection(resume, (t) => t.includes('주요 성과'));
  const achItems = ach ? listItems(ach.lines, 'ordered').items : [];
  track.parts.achievements.forEach((name, i) => {
    out.push({ doc: 'resume', part: `주요 성과 ${i + 1}`, name, found: achItems[i] ? itemName(achItems[i][0]) : null });
  });
  const chapters = chapterBlocks(career);
  track.parts.chapters.forEach((name, i) => {
    out.push({ doc: 'career', part: `경력기술서 ${i + 1}장`, name, found: chapters[i] ? chapters[i].title.trim() : null });
  });
  for (const [doc, md] of [['resume', resume], ['career', career]] as const) {
    const proj = projectBlocks(md);
    if (!proj && doc === 'career') continue;
    for (const name of track.parts.projects) {
      const hit = proj?.blocks.filter((b) => projectMatches(name, b.title)) ?? [];
      out.push({ doc, part: '개인 프로젝트', name, found: hit.length === 1 ? hit[0].title.trim() : null });
    }
  }
  return out;
}
