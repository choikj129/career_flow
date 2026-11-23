import type { KitGuide } from './types';

// 규칙 기반 대체 추천(D-28 b 뒤): AI 추천이 없을 때만 쓴다(키트 없이 한 분석, 키트를 분석 뒤에 올림, 옛 분석).
// 공고 글에서 가이드의 공고 단어를 세어 직무·프로필·추가 조정을 고른다. 호출 0, 결정적이다.

export type WordCount = { word: string; count: number };

export type Recommendation = {
  track: string;
  trackReason: string;
  /** 그 직무의 프로필, 점수 ↓ */
  profiles: { id: string; name: string; score: number; matched: WordCount[]; recommended: boolean }[];
  adjustments: { id: string; label: string; matched: WordCount[]; suggested: boolean }[];
  /** 모든 프로필·추가 조정 단어 중 많이 나온 3개 */
  topWords: WordCount[];
};

/** 대소문자 무시, 부분 일치로 센다. */
function countWord(text: string, word: string): number {
  const w = word.trim().toLowerCase();
  return w ? text.split(w).length - 1 : 0;
}

function countAll(text: string, words: string[]): WordCount[] {
  const seen = new Set<string>();
  const out: WordCount[] = [];
  for (const word of words) {
    const key = word.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const count = countWord(text, word);
    if (count > 0) out.push({ word, count });
  }
  return out;
}

const sum = (c: WordCount[]) => c.reduce((n, x) => n + x.count, 0);

/** opts.track: 직무를 정해 두고 그 직무의 프로필·추가 조정만 센다(화면에서 직무를 바꿨을 때) */
export function recommend(
  kit: KitGuide,
  posting: { title: string | null; text: string },
  opts: { track?: string } = {},
): Recommendation {
  const text = posting.text.toLowerCase();
  const title = (posting.title ?? '').toLowerCase();

  const trackScore = (name: string) =>
    sum(countAll(text, kit.profiles.filter((p) => p.track === name).flatMap((p) => p.keywords)));
  let track = kit.tracks[0];
  let trackReason = '';
  const forced = opts.track ? kit.tracks.find((t) => t.name === opts.track) : undefined;
  const byTitle = kit.tracks.find((t) => title.includes(t.name.toLowerCase()));
  if (forced) {
    track = forced;
    trackReason = '고른 직무';
  } else if (byTitle) {
    track = byTitle;
    trackReason = `포지션명에 '${byTitle.name}'`;
  } else {
    const scores = kit.tracks.map((t) => ({ t, s: trackScore(t.name) }));
    const best = scores.reduce((a, b) => (b.s > a.s ? b : a), scores[0]);
    track = best.t;
    const others = scores.filter((x) => x.t !== best.t).map((x) => x.s);
    trackReason = best.s === 0 ? '공고 단어가 없어 첫 직무' : `공고 단어 수 ${best.s} 대 ${Math.max(0, ...others)}`;
  }

  const mine = kit.profiles.filter((p) => p.track === track.name);
  const scored = mine.map((p) => {
    const matched = countAll(text, p.keywords);
    return { p, matched, score: sum(matched) };
  });
  const max = Math.max(0, ...scored.map((x) => x.score));
  const top = scored.filter((x) => x.score === max);
  const recommendedId = max > 0 && top.length === 1 ? top[0].p.id : (mine.find((p) => p.id === track.defaultProfileId) ?? mine[0])?.id;
  const profiles = scored
    .map((x) => ({ id: x.p.id, name: x.p.name, score: x.score, matched: x.matched, recommended: x.p.id === recommendedId }))
    .sort((a, b) => b.score - a.score);

  const adjustments = kit.adjustments
    .filter((a) => a.track === track.name || a.track === '')
    .map((a) => {
      const matched = countAll(text, a.triggers);
      return { id: a.id, label: a.label, matched, suggested: matched.length > 0 };
    });

  const all = countAll(text, [...kit.profiles.flatMap((p) => p.keywords), ...kit.adjustments.flatMap((a) => a.triggers)]);
  const topWords = all.sort((a, b) => b.count - a.count).slice(0, 3);

  return { track: track.name, trackReason, profiles, adjustments, topWords };
}
