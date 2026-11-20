import {
  chapterBlocks,
  findSection,
  listItems,
  parseMdDoc,
  projectBlocks,
  projectMatches,
  renderMdDoc,
  type MdBlock,
} from './md-doc';
import type { KitGuide } from './types';

// 1단계 조립: 기본 서류 md에 프로필 레시피를 코드로 적용한다. 새 문장이 생기지 않고 호출도 없다. 순수·결정적이다.

export type Recipe = { track: string; profileId: string; adjustmentIds: string[] };
export type Assembled = { resumeMd: string; careerMd: string; applied: string[]; pending: string[] };

const RECIPE_ACH_MOVE = /주요\s*성과\s*(\d+)\s*(?:을|를)?\s*(\d+)\s*번째로/;
const RECIPE_SECTION_MOVE = /^(.+?)(?:을|를)\s*(.+?)\s*바로\s*위로$/;

/** 앞뒤 빈 줄은 두고 가운데 본문 줄만 바꾼다. */
function replaceBody(lines: string[], body: string[]): string[] {
  let a = 0;
  while (a < lines.length && lines[a].trim() === '') a++;
  let b = lines.length;
  while (b > a && lines[b - 1].trim() === '') b--;
  return [...lines.slice(0, a), ...body, ...lines.slice(b)];
}

/** 번호 목록 항목의 첫 줄 번호를 k로 바꾼다. */
const renumber = (item: string[], k: number): string[] => [item[0].replace(/^\d+([.)])/, `${k}$1`), ...item.slice(1)];

/** 개인 프로젝트 구획에서 프로필의 프로젝트만 그 순서로 남긴다. */
function selectProjects(doc: MdBlock, names: string[]): void {
  const proj = projectBlocks(doc);
  if (!proj) return;
  const picked: MdBlock[] = [];
  for (const name of names) {
    const hit = proj.blocks.filter((b) => projectMatches(name, b.title));
    if (hit.length === 1) picked.push(hit[0]);
  }
  proj.section.children = picked;
}

export function assemble(kit: KitGuide, base: { resumeMd: string; careerMd: string }, recipe: Recipe): Assembled {
  const track = kit.tracks.find((t) => t.name === recipe.track);
  if (!track) throw new Error(`키트에 직무 "${recipe.track}"가 없습니다`);
  const profile = kit.profiles.find((p) => p.track === track.name && p.id === recipe.profileId);
  if (!profile) throw new Error(`키트에 프로필 "${recipe.profileId}"가 없습니다`);
  const intro = kit.intros[profile.introId];
  if (intro == null) throw new Error(`키트에 자기소개 후보 "${profile.introId}"가 없습니다`);

  const applied: string[] = [];
  const pending: string[] = [];

  // ---- 이력서 ----
  const resume = parseMdDoc(base.resumeMd);
  const introSec = findSection(resume, (t) => t.includes('자기소개'));
  if (introSec) {
    introSec.lines = replaceBody(introSec.lines, intro.split('\n'));
    applied.push(`자기소개: ${profile.introId} 후보`);
  }

  const comp = findSection(resume, (t) => t.includes('핵심 역량'));
  if (comp) {
    const { items, before, after } = listItems(comp.lines, 'bullet');
    comp.lines = [...before, ...profile.competencyOrder.map((i) => items[i] ?? []).flat(), ...after];
    applied.push(`핵심 역량 순서: ${profile.competencyOrder.map((i) => i + 1).join(' ')}`);
  }

  // 주요 성과: 원래 번호(origIdx)를 따라다니게 해서 추가 조정이 "원래 번호 N"을 찾을 수 있게 한다.
  const achSec = findSection(resume, (t) => t.includes('주요 성과'));
  const achOrder = [...profile.achievementOrder];
  const moves: { n: number; k: number; label: string }[] = [];
  const sectionMoves: { what: string; target: string; label: string }[] = [];
  for (const id of recipe.adjustmentIds) {
    const adj = kit.adjustments.find((a) => a.id === id);
    if (!adj) continue;
    const sentence = adj.instruction.trim();
    const m1 = RECIPE_ACH_MOVE.exec(sentence);
    const m2 = RECIPE_SECTION_MOVE.exec(sentence);
    if (m1 && m1[0] === sentence) moves.push({ n: Number(m1[1]), k: Number(m1[2]), label: adj.label });
    else if (m2) sectionMoves.push({ what: m2[1].trim(), target: m2[2].trim(), label: adj.label });
    else pending.push(sentence);
  }
  if (achSec) {
    const { items, before, after } = listItems(achSec.lines, 'ordered');
    for (const mv of moves) {
      const from = achOrder.indexOf(mv.n - 1);
      if (from < 0 || mv.k < 1 || mv.k > achOrder.length) {
        pending.push(`${mv.label} (적용할 수 없어 직접 확인이 필요합니다)`);
        continue;
      }
      const [x] = achOrder.splice(from, 1);
      achOrder.splice(mv.k - 1, 0, x);
      applied.push(`추가 조정: ${mv.label}`);
    }
    achSec.lines = [...before, ...achOrder.map((i, pos) => renumber(items[i] ?? [], pos + 1)).flat(), ...after];
    applied.push(`주요 성과 순서: ${achOrder.map((i) => i + 1).join(' ')}`);
  } else {
    for (const mv of moves) pending.push(mv.label);
  }

  selectProjects(resume, profile.projects);
  if (profile.projects.length > 0) applied.push(`개인 프로젝트: ${profile.projects.join(', ')}`);

  for (const mv of sectionMoves) {
    const parent = (function find(b: MdBlock): MdBlock | null {
      for (const c of b.children) {
        if (c.level === 2 && c.title.includes(mv.target)) return b;
        const deep = find(c);
        if (deep) return deep;
      }
      return null;
    })(resume);
    const what = parent?.children.find((c) => c.level === 2 && c.title.includes(mv.what));
    const target = parent?.children.find((c) => c.level === 2 && c.title.includes(mv.target));
    if (!parent || !what || !target || what === target) {
      pending.push(`${mv.label} (적용할 수 없어 직접 확인이 필요합니다)`);
      continue;
    }
    parent.children = parent.children.filter((c) => c !== what);
    parent.children.splice(parent.children.indexOf(target), 0, what);
    applied.push(`추가 조정: ${mv.label}`);
  }

  // ---- 경력기술서 ----
  const career = parseMdDoc(base.careerMd);
  const chapters = chapterBlocks(career);
  if (chapters.length > 0) {
    const parent = (function find(b: MdBlock): MdBlock | null {
      for (const c of b.children) {
        if (c === chapters[0]) return b;
        const deep = find(c);
        if (deep) return deep;
      }
      return null;
    })(career)!;
    const slots = parent.children.map((c, i) => (chapters.includes(c) ? i : -1)).filter((i) => i >= 0);
    const ordered = profile.chapterOrder.map((i) => chapters[i]).filter(Boolean);
    ordered.forEach((ch, k) => {
      const n = k + 1;
      ch.title = ch.title.replace(/^\d+\./, `${n}.`);
      for (const sub of ch.children) sub.title = sub.title.replace(/^\d+-(\d+)\./, `${n}-$1.`);
      parent.children[slots[k]] = ch;
    });
    applied.push(`경력기술서 장 순서: ${profile.chapterOrder.map((i) => i + 1).join(' ')}`);
  }
  selectProjects(career, profile.projects);

  return { resumeMd: renderMdDoc(resume), careerMd: renderMdDoc(career), applied, pending };
}
