import type { z } from 'zod';
import type { ProfileRec, ProfileRecommendationOut } from '@/lib/ai/tasks/schemas';
import type { KitGuide } from './types';

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

  return { track: track.name, trackReason: out.trackReason, profiles, adjustments, kitId };
}
