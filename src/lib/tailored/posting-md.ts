import { fence } from '@/lib/ai/fence';

// 공고 요약 md(사용자 지원 폴더의 "공고.md"와 같은 이름으로 받는다). 순수 함수.

export function buildPostingMd(i: {
  company: string;
  position: string;
  site: string;
  url: string | null;
  deadline: string | null;
  topWords: { word: string; count: number }[];
  track: string;
  profileId: string;
  profileName: string;
  adjustments: string[];
  postingText: string;
}): string {
  const top = i.topWords.slice(0, 3);
  return [
    `# ${i.company} · ${i.position}`,
    '',
    `- 회사: ${i.company}`,
    `- 포지션: ${i.position}`,
    `- 사이트: ${i.site}`,
    `- 링크: ${i.url ?? '없음'}`,
    `- 마감: ${i.deadline ?? '없음'}`,
    '',
    '## 공고에서 많이 나온 단어',
    '',
    top.length ? top.map((w) => `- ${w.word} (${w.count}회)`).join('\n') : '- (없음)',
    '',
    '## 고른 직무·프로필·추가 조정',
    '',
    `- 직무: ${i.track}`,
    `- 프로필: ${i.profileId} ${i.profileName}`,
    '- 추가 조정:',
    ...(i.adjustments.length ? i.adjustments.map((a) => `  - ${a}`) : ['  - (없음)']),
    '',
    '## 공고 본문',
    '',
    fence(i.postingText),
    '',
  ].join('\n');
}
