import { findSection, findSections, parseMdDoc, type MdBlock } from './md-doc';
import type { Adjustment, KitError, KitGuide, Profile, TermRule, Track } from './types';

// 가이드 md를 구조로 읽는다. 구획은 제목 글자로 찾고, 형식이 맞지 않으면 어느 구획·어느 줄인지 오류로 돌려준다.

const GUIDE_FILE = '가이드';

type Table = { header: string[]; rows: { cells: string[]; rowNo: number }[] };

/** 칸 글자에서 **굵게**·`코드` 표시를 벗긴다(사람이 읽기 좋게 꾸민 가이드도 그대로 읽는다). */
const plain = (s: string): string => s.replace(/\*\*/g, '').replace(/`/g, '').trim();

function splitRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(plain);
}

/** 블록과 그 아래 모든 하위 제목의 줄(문서 순서). */
const allLines = (b: MdBlock): string[] => [...b.lines, ...b.children.flatMap(allLines)];

/** 줄들에서 첫 표를 읽는다(머리, 구분 줄, 데이터 줄). 표가 없으면 null. */
function readTable(lines: string[]): Table | null {
  const start = lines.findIndex((l) => l.trim().startsWith('|'));
  if (start < 0) return null;
  const rows: string[][] = [];
  for (let i = start; i < lines.length && lines[i].trim().startsWith('|'); i++) rows.push(splitRow(lines[i]));
  if (rows.length < 2) return null;
  const [header, , ...data] = rows;
  return { header, rows: data.map((cells, i) => ({ cells, rowNo: i + 1 })) };
}

const col = (header: string[], text: string): number => header.findIndex((h) => h.includes(text));

const CIRCLED_A = 'ⓐ'.codePointAt(0)!;
const splitWords = (s: string): string[] => s.split(/[,、/]/).map((x) => x.trim()).filter(Boolean);

/** 순서 칸: ⓐⓑⓒ(핵심 역량) 또는 숫자(성과·장)를 0부터 센 위치로. 읽을 수 없으면 null. */
function parseOrder(cell: string): number[] | null {
  const raw = cell.split(/[\s,→>·]+/).filter(Boolean);
  // 붙여 쓴 순서: ⓐⓑⓒ는 글자마다, 칸 전체가 숫자 한 덩어리(1234567)면 숫자마다 나눈다(9개까지)
  const tokens = raw.flatMap((t) =>
    /^[ⓐ-ⓩ]{2,}$/u.test(t) ? [...t] : raw.length === 1 && /^[1-9]{2,}$/.test(t) ? [...t] : [t],
  );
  const out: number[] = [];
  for (const t of tokens) {
    const cp = t.codePointAt(0)!;
    if (t.length === 1 && cp >= CIRCLED_A && cp <= CIRCLED_A + 25) out.push(cp - CIRCLED_A);
    else if (/^\d+$/.test(t) && Number(t) >= 1) out.push(Number(t) - 1);
    else return null;
  }
  return out.length > 0 ? out : null;
}

/**
 * 프로필 표의 개인 프로젝트 이름을 번호표 이름으로 맞춘다. 같으면 그대로, 줄여 쓴 이름("AI 도구")은
 * 낱말이 모두 들어 있는 번호표 이름("AI 취업 활동 도구")이 하나뿐일 때만 그것으로. 아니면 null.
 */
function resolveProject(name: string, known: string[]): string | null {
  if (known.includes(name)) return name;
  const words = name.split(/\s+/).filter(Boolean);
  const hits = known.filter((k) => words.every((w) => k.includes(w)));
  return hits.length === 1 ? hits[0] : null;
}

function isPermutation(order: number[], n: number): boolean {
  return order.length === n && new Set(order).size === n && order.every((x) => x >= 0 && x < n);
}

export function parseGuide(md: string): { guide: KitGuide | null; errors: KitError[] } {
  const errors: KitError[] = [];
  const err = (where: string, message: string) => errors.push({ file: GUIDE_FILE, where, message });
  const doc = parseMdDoc(md);

  // 1. 기본 서류 표
  const baseSec = findSection(doc, (t) => t.includes('기본 서류'));
  const baseTable = baseSec ? readTable(baseSec.lines) : null;
  const trackRows: { name: string; resumeFile: string; careerFile: string; defaultProfileId: string }[] = [];
  if (!baseSec) err('"기본 서류" 구획', '구획을 찾을 수 없습니다(제목에 "기본 서류"가 있어야 합니다)');
  else if (!baseTable) err('"기본 서류" 구획', '표를 찾을 수 없습니다(열: 직무 / 이력서 / 경력기술서 / 기본 프로필)');
  else {
    const c = { n: col(baseTable.header, '직무'), r: col(baseTable.header, '이력서'), c: col(baseTable.header, '경력기술서'), p: col(baseTable.header, '기본 프로필') };
    if (Object.values(c).some((x) => x < 0)) err('"기본 서류" 표', '열이 직무 / 이력서 / 경력기술서 / 기본 프로필이어야 합니다');
    else
      for (const row of baseTable.rows) {
        if (row.cells.length !== baseTable.header.length) {
          err(`"기본 서류" 표 ${row.rowNo}번째 줄`, `열 개수가 맞지 않습니다(표 머리 ${baseTable.header.length}개, 이 줄 ${row.cells.length}개)`);
          continue;
        }
        trackRows.push({ name: row.cells[c.n], resumeFile: row.cells[c.r], careerFile: row.cells[c.c], defaultProfileId: row.cells[c.p] });
      }
  }

  if (baseSec && baseTable && trackRows.length === 0) err('"기본 서류" 표', '직무가 하나도 없습니다(직무 줄이 1개 이상 있어야 합니다)');

  // 3. 번호표
  const partsByTrack = new Map<string, Track['parts']>();
  const numSec = findSection(doc, (t) => t.includes('번호표'));
  if (!numSec) err('"번호표" 구획', '구획을 찾을 수 없습니다(제목에 "번호표"가 있어야 합니다)');
  else {
    let cur: Track['parts'] | null = null;
    for (const line of numSec.lines) {
      const head = /^\*\*(.+?)\s*이력서\*\*\s*$/.exec(line.trim());
      if (head) {
        cur = { competencies: [], achievements: [], chapters: [], projects: [] };
        partsByTrack.set(head[1].trim(), cur);
        continue;
      }
      const item = /^-\s*(핵심 역량|주요 성과|경력기술서|개인 프로젝트)\s*[:：]\s*(.*)$/.exec(line.trim());
      if (!item || !cur) continue;
      const [, kind, rest] = item;
      if (kind === '핵심 역량') cur.competencies = rest.split(/[ⓐ-ⓩ]/).map((x) => x.trim()).filter(Boolean);
      else if (kind === '개인 프로젝트') cur.projects = rest.split('·').map((x) => x.trim()).filter(Boolean);
      else {
        // 항목은 "· 숫자 " 앞에서만 나눈다(이름 안의 ·는 그대로: "분할·재개")
        const names = rest.split(/\s*·\s*(?=\d+\s)/).map((x) => /^\d+\s+(.*)$/.exec(x.trim())?.[1]?.trim() ?? '');
        if (names.some((n) => !n)) err(`"번호표" 구획(${kind})`, `"1 이름 · 2 이름" 모양이 아닙니다: ${rest}`);
        else if (kind === '주요 성과') cur.achievements = names;
        else cur.chapters = names;
      }
    }
  }

  const tracks: Track[] = [];
  for (const t of trackRows) {
    const parts = partsByTrack.get(t.name);
    if (!parts) {
      if (numSec) err('"번호표" 구획', `직무 "${t.name}"의 "**${t.name} 이력서**" 줄을 찾을 수 없습니다`);
      continue;
    }
    tracks.push({ ...t, parts });
  }

  // 4. 프로필 표(직무마다 제목에 직무 이름이 있는 블록 안의 표)
  const profiles: Profile[] = [];
  for (const track of tracks) {
    const blocks = findSections(doc, (t) => t.includes(track.name));
    let found = false;
    for (const b of blocks) {
      const table = readTable(b.lines);
      if (!table || col(table.header, '공고 단어') < 0) continue;
      found = true;
      const h = table.header;
      const idx = {
        p: col(h, '프로필'), k: col(h, '공고 단어'), i: col(h, '자기소개'), c: col(h, '핵심 역량'),
        a: col(h, '주요 성과'), ch: col(h, '경력기술서'), pr: col(h, '개인 프로젝트'),
      };
      if (Object.values(idx).some((x) => x < 0)) {
        err(`프로필 표(${track.name})`, '열이 프로필 / 공고 단어 / 자기소개 / 핵심 역량 / 주요 성과 / 경력기술서 / 개인 프로젝트여야 합니다');
        continue;
      }
      for (const row of table.rows) {
        const where = `프로필 표(${track.name}) ${row.rowNo}번째 줄`;
        if (row.cells.length !== h.length) {
          err(where, `열 개수가 맞지 않습니다(표 머리 ${h.length}개, 이 줄 ${row.cells.length}개)`);
          continue;
        }
        const m = /^(\S+)\s*(.*)$/.exec(row.cells[idx.p]);
        if (!m) {
          err(where, '프로필 칸이 비어 있습니다');
          continue;
        }
        const flagged = /\(기본\)/.test(m[2]);
        const name = m[2].replace(/\(기본\)/, '').trim() || m[1];
        const orders = {
          comp: parseOrder(row.cells[idx.c]), ach: parseOrder(row.cells[idx.a]), ch: parseOrder(row.cells[idx.ch]),
        };
        if (!orders.comp || !orders.ach || !orders.ch) {
          err(where, '핵심 역량·주요 성과·경력기술서 순서를 읽을 수 없습니다(ⓐ ⓑ… 또는 1 2…)');
          continue;
        }
        if (!isPermutation(orders.comp, track.parts.competencies.length)) err(where, `핵심 역량 순서가 번호표(${track.parts.competencies.length}개)와 맞지 않습니다`);
        if (!isPermutation(orders.ach, track.parts.achievements.length)) err(where, `주요 성과 순서가 번호표(${track.parts.achievements.length}개)와 맞지 않습니다`);
        if (!isPermutation(orders.ch, track.parts.chapters.length)) err(where, `경력기술서 순서가 번호표(${track.parts.chapters.length}개)와 맞지 않습니다`);
        const projects: string[] = [];
        for (const p of splitWords(row.cells[idx.pr])) {
          const name = resolveProject(p, track.parts.projects);
          if (name) projects.push(name);
          else err(where, `개인 프로젝트 "${p}"가 번호표에 없습니다(없거나 둘 이상과 맞습니다)`);
        }
        profiles.push({
          id: m[1], name, track: track.name, isDefault: flagged || m[1] === track.defaultProfileId,
          keywords: splitWords(row.cells[idx.k]), introId: row.cells[idx.i].trim(),
          competencyOrder: orders.comp, achievementOrder: orders.ach, chapterOrder: orders.ch, projects,
        });
      }
    }
    if (!found) err(`프로필 표(${track.name})`, `제목에 "${track.name}"이 있고 "공고 단어" 열이 있는 표를 찾을 수 없습니다`);
    else if (!profiles.some((p) => p.track === track.name && p.id === track.defaultProfileId)) {
      err(`"기본 서류" 표(${track.name})`, `기본 프로필 "${track.defaultProfileId}"가 프로필 표에 없습니다`);
    }
  }

  // 5. 추가 조정(선택 구획)
  const adjustments: Adjustment[] = [];
  const adjCount = new Map<string, number>();
  const readLines = (lines: string[], trackName: string) => {
      for (const line of lines) {
        if (!/^[-*]\s/.test(line.trim())) continue;
        // "가 있으면", "가 필수로 있으면"처럼 조사와 "있으면" 사이 낱말 하나까지 허용
        const m = /^[-*]\s*공고에\s*\*\*(.+?)\*\*\s*(?:가|이|를|을)?\s*(?:[^\s:：]+\s+)?있으면\s*[:：]\s*(.+)$/.exec(line.trim());
        if (!m) {
          err(`"추가 조정" 구획(${trackName || '공통'})`, `"공고에 **단어, 단어**가 있으면: 할 일" 모양이 아닌 줄: ${line.trim()}`);
          continue;
        }
        const key = trackName || '공통';
        const n = (adjCount.get(key) ?? 0) + 1;
        adjCount.set(key, n);
        const triggers = splitWords(m[1]);
        const instruction = m[2].trim();
        adjustments.push({
          id: `${key}-${n}`, track: trackName, triggers, instruction,
          label: `${triggers.join('·')} → ${instruction.length > 32 ? `${instruction.slice(0, 32)}…` : instruction}`,
        });
      }
  };
  // (가) 제목이 "추가 조정"인 구획: 바로 아래 줄은 공통, 하위 제목은 그 직무
  const adjSec = findSection(doc, (t) => t.includes('추가 조정'));
  if (adjSec) {
    readLines(adjSec.lines, '');
    for (const c of adjSec.children) {
      const track = tracks.find((t) => c.title.includes(t.name));
      if (track) readLines(c.lines, track.name);
    }
  }
  // (나) 직무 블록 안의 굵은 줄 "**추가 조정 …**" 바로 아래 목록
  for (const track of tracks) {
    for (const b of findSections(doc, (t) => t.includes(track.name))) {
      const start = b.lines.findIndex((l) => /^\*\*[^*]*추가 조정[^*]*\*\*\s*$/.test(l.trim()));
      if (start < 0) continue;
      const list: string[] = [];
      for (const l of b.lines.slice(start + 1)) {
        if (!l.trim()) {
          if (list.length) break;
          continue;
        }
        if (!/^[-*]\s/.test(l.trim())) break;
        list.push(l);
      }
      readLines(list, track.name);
    }
  }

  // 6. 자기소개 후보
  const intros: Record<string, string> = {};
  const introSec = findSection(doc, (t) => t.includes('자기소개 후보'));
  if (!introSec) err('"자기소개 후보" 구획', '구획을 찾을 수 없습니다(제목에 "자기소개 후보"가 있어야 합니다)');
  else {
    let curId: string | null = null;
    // 직무별 하위 제목(### 백엔드 …) 아래에 둔 후보도 읽는다
    for (const line of allLines(introSec)) {
      const head = /^\*\*(\S+)(?:\s+.*)?\*\*\s*$/.exec(line.trim());
      if (head) {
        curId = head[1];
        intros[curId] = '';
        continue;
      }
      const q = /^>\s?(.*)$/.exec(line);
      if (q && curId && !q[1].trim().startsWith('※')) intros[curId] = intros[curId] ? `${intros[curId]}\n${q[1].trim()}` : q[1].trim();
    }
    for (const id of Object.keys(intros)) intros[id] = intros[id].trim();
    if (Object.keys(intros).length === 0) err('"자기소개 후보" 구획', '"**B1 이름**" 줄과 그 아래 "> 본문"을 찾을 수 없습니다');
    for (const [id, body] of Object.entries(intros)) if (!body) err('"자기소개 후보" 구획', `후보 "${id}"의 본문("> …")이 비어 있습니다`);
  }
  for (const p of profiles) if (introSec && !(p.introId in intros)) err(`프로필 표(${p.track})`, `프로필 ${p.id}의 자기소개 후보 "${p.introId}"가 "자기소개 후보" 구획에 없습니다`);

  // 7. 허용 범위 표
  const terms: TermRule[] = [];
  const termSec = findSection(doc, (t) => t.includes('허용 범위'));
  const termTable = termSec ? readTable(termSec.lines) : null;
  if (!termSec) err('"허용 범위" 구획', '구획을 찾을 수 없습니다(제목에 "허용 범위"가 있어야 합니다)');
  else if (!termTable) err('"허용 범위" 구획', '표를 찾을 수 없습니다(열: 원래 표현 / 바꿔도 되는 표현 / 쓰면 안 되는 표현)');
  else {
    const c = { o: col(termTable.header, '원래'), a: col(termTable.header, '바꿔도'), f: col(termTable.header, '쓰면 안') };
    if (Object.values(c).some((x) => x < 0)) err('"허용 범위" 표', '열이 원래 표현 / 바꿔도 되는 표현 / 쓰면 안 되는 표현이어야 합니다');
    else
      for (const row of termTable.rows) {
        if (row.cells.length !== termTable.header.length) {
          err(`"허용 범위" 표 ${row.rowNo}번째 줄`, `열 개수가 맞지 않습니다(표 머리 ${termTable.header.length}개, 이 줄 ${row.cells.length}개)`);
          continue;
        }
        terms.push({ original: row.cells[c.o], allowed: splitWords(row.cells[c.a]), forbidden: splitWords(row.cells[c.f]) });
      }
  }

  // 8. 체크리스트
  const checkSec = findSection(doc, (t) => t.includes('체크리스트'));
  const checklist = checkSec
    ? checkSec.lines.map((l) => /^-\s*\[[ xX]\]\s*(.+)$/.exec(l.trim())?.[1]?.trim()).filter((x): x is string => !!x)
    : [];
  if (!checkSec) err('"체크리스트" 구획', '구획을 찾을 수 없습니다(제목에 "체크리스트"가 있어야 합니다)');
  else if (checklist.length === 0) err('"체크리스트" 구획', '"- [ ] 할 일" 줄을 찾을 수 없습니다');

  if (errors.length > 0) return { guide: null, errors };
  return { guide: { tracks, profiles, adjustments, intros, terms, checklist }, errors };
}
