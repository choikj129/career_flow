import type { z } from 'zod';
import type { ProfileRec, ProfileRecommendationOut } from '@/lib/ai/tasks/schemas';
import type { KitGuide, Profile, Track } from './types';

// 순수 함수. 공고 분석 프롬프트에 넣을 프로필 표와 AI 추천 정리(D-28 b).

/** 분석 프롬프트용 표: 직무, 프로필 id·이름·기본 여부·공고 단어, 추가 조정 id·트리거 단어. 자기소개·서류 내용은 넣지 않는다. */
export function profileTableMd(kit: KitGuide): string {
  const out: string[] = [];
  for (const t of kit.tracks) {
    out.push(`### 직무: ${t.name}`, '', '| 프로필 id | 이름 | 기본 | 공고 단어 |', '|---|---|---|---|');
    for (const p of kit.profiles.filter((x) => x.track === t.name)) {
      out.push(`| ${p.id} | ${p.name} | ${p.isDefault ? '(기본)' : ''} | ${p.keywords.join(', ')} |`);
    }
    const adj = kit.adjustments.filter((a) => a.track === t.name || a.track === '');
    if (adj.length > 0) {
      out.push('', '추가 조정(공고에 트리거 단어가 있으면 고려):');
      for (const a of adj) out.push(`- ${a.id}: ${a.triggers.join(', ')}`);
    }
    out.push('');
  }
  return out.join('\n').trimEnd();
}

type Out = z.infer<typeof ProfileRecommendationOut>;

/**
 * AI 결과 정리: 모르는 직무 → 첫 직무, 모르는 id 버림, 빠진 프로필 0%·근거 없음, 추천도 ↓(같으면 기본 프로필 먼저),
 * 공고 본문에 없는 키워드 제거. 추가 조정은 그 직무의 것을 키트 순서로 두고 AI가 안 낸 것은 추천 안 함.
 */
export function normalizeProfileRec(out: Out, kit: KitGuide, postingText: string, kitId: number): ProfileRec {
  const track = kit.tracks.find((t) => t.name === out.track) ?? kit.tracks[0];
  const text = postingText.toLowerCase();
  const inPosting = (words: string[]) => [...new Set(words.map((w) => w.trim()).filter((w) => w && text.includes(w.toLowerCase())))];

  const mine = kit.profiles.filter((p) => p.track === track.name);
  const profiles = mine
    .map((p, order) => {
      const hit = out.profiles.find((x) => x.id === p.id);
      return {
        id: p.id,
        fitPercent: hit ? Math.min(100, Math.max(0, Math.round(hit.fitPercent))) : 0,
        keywords: hit ? inPosting(hit.keywords) : [],
        reason: hit?.reason ?? '',
        isDefault: p.id === track.defaultProfileId || p.isDefault,
        order,
      };
    })
    .sort((a, b) => b.fitPercent - a.fitPercent || Number(b.isDefault) - Number(a.isDefault) || a.order - b.order)
    .map(({ id, fitPercent, keywords, reason }) => ({ id, fitPercent, keywords, reason }));

  const adjustments = kit.adjustments
    .filter((a) => a.track === track.name || a.track === '')
    .map((a) => {
      const hit = out.adjustments.find((x) => x.id === a.id);
      return { id: a.id, recommended: hit?.recommended ?? false, keywords: hit ? inPosting(hit.keywords) : [] };
    });

  const tailorRec = out.tailorRec
    ? { percent: Math.min(100, Math.max(0, Math.round(out.tailorRec.percent))), reason: out.tailorRec.reason.trim().slice(0, 120) }
    : undefined;
  return { track: track.name, trackReason: out.trackReason, profiles, adjustments, kitId, ...(tailorRec ? { tailorRec } : {}) };
}

/** order(0부터)의 index대로 제목을 고른다. 범위 밖·정수 아닌 값은 건너뛴다. */
export function orderedTitles(titles: string[], order: number[]): string[] {
  return order.filter((i) => Number.isInteger(i) && i >= 0 && i < titles.length).map((i) => titles[i]);
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/** 이 프로필이 기본 프로필과 어떻게 다른지 한 줄(D-32) */
export function emphasisLine(p: Profile, def: Profile | undefined, track: Track, intros: Record<string, string>): string {
  if (!def || p.id === track.defaultProfileId || p.isDefault) return '(기본 프로필)';
  const parts: [string, string[], number[], number[]][] = [
    ['역량', track.parts.competencies, p.competencyOrder, def.competencyOrder],
    ['성과', track.parts.achievements, p.achievementOrder, def.achievementOrder],
    ['장', track.parts.chapters, p.chapterOrder, def.chapterOrder],
  ];
  const changed: string[] = [];
  for (const [label, titles, mine, base] of parts) {
    const a = orderedTitles(titles, mine)[0];
    const b = orderedTitles(titles, base)[0];
    if (a !== b) changed.push(`${label} 맨 앞: ${a ?? '(없음)'} (기본: ${b ?? '(없음)'})`);
  }
  if (changed.length > 0) return changed.join('; ');
  const same = (x: number[], y: number[]) => x.length === y.length && x.every((v, i) => v === y[i]);
  if (!same(p.competencyOrder, def.competencyOrder) || !same(p.achievementOrder, def.achievementOrder) || !same(p.chapterOrder, def.chapterOrder)) {
    return '순서 일부 다름(맨 앞은 기본과 같음)';
  }
  if (oneLine(intros[p.introId] ?? '') !== oneLine(intros[def.introId] ?? '')) return '순서는 기본과 같음, 자기소개만 다름';
  return '기본과 같음';
}

/** 분석 프롬프트용 프로필별 뼈대: 자기소개 전문과 역량·성과·장 제목을 그 프로필 순서대로(D-32). 본문 문장은 넣지 않는다. */
export function profileSkeletonMd(kit: KitGuide): string {
  const out: string[] = [];
  const numbered = (titles: string[], order: number[]) => orderedTitles(titles, order).map((t, i) => `${i + 1}) ${t}`).join(' ');
  for (const t of kit.tracks) {
    const mine = kit.profiles.filter((x) => x.track === t.name);
    const def = mine.find((x) => x.id === t.defaultProfileId) ?? mine.find((x) => x.isDefault);
    out.push(`### 직무: ${t.name}`);
    if (def && def.projects.length > 0) out.push(`개인 프로젝트(이 직무 공통): ${def.projects.join(', ')}`);
    out.push('');
    for (const p of mine) {
      const isDef = p.id === t.defaultProfileId || p.isDefault;
      out.push(`#### ${p.id} ${p.name}${isDef ? ' (기본)' : ''}`);
      out.push(`- 자기소개: ${kit.intros[p.introId] != null ? oneLine(kit.intros[p.introId]) : '(자기소개 없음)'}`);
      out.push(`- 핵심 역량: ${numbered(t.parts.competencies, p.competencyOrder)}`);
      out.push(`- 주요 성과: ${numbered(t.parts.achievements, p.achievementOrder)}`);
      out.push(`- 경력 장: ${numbered(t.parts.chapters, p.chapterOrder)}`);
      if (def && !isDef && p.projects.join('\n') !== def.projects.join('\n')) out.push(`- 개인 프로젝트: ${p.projects.join(', ')}`);
      out.push(`- 기본 대비: ${emphasisLine(p, def, t, kit.intros)}`);
      out.push('');
    }
  }
  return out.join('\n').trimEnd();
}
