import { fence } from '@/lib/ai/fence';
import type { KitWarning } from '@/lib/kit/types';

// 이력서 작업 공간에 "이 공고용 이력서"를 요청하는 요청문과 권유 기준(D-26 추가, D-30 a). 순수 함수다.
// 틀(문장)만 여기에 있고 개인 내용은 부르는 쪽이 DB·키트에서 읽어 넣는다.

export type HandoffReason = 'low_fit' | 'warnings' | 'pending_adjustments' | 'ai_suggested';

export const LOW_FIT_PERCENT = 60;

/** 알림 종류(할 일이 없는 것). "확인 필요"로 세지 않는다 */
export const NOTICE_KINDS: ReadonlySet<KitWarning['kind']> = new Set(['new_fact_from_master', 'intro_restored']);

/** 요청을 권할 이유. 비어 있으면 권하지 않는다(버튼은 늘 있다) */
export function handoffReasons(i: {
  topFitPercent: number | null;
  warnings: KitWarning[];
  pending: string[];
  needsWorkspace: boolean;
}): HandoffReason[] {
  const out: HandoffReason[] = [];
  if (i.topFitPercent != null && i.topFitPercent < LOW_FIT_PERCENT) out.push('low_fit');
  if (i.warnings.some((w) => !NOTICE_KINDS.has(w.kind))) out.push('warnings');
  if (i.pending.length > 0) out.push('pending_adjustments');
  if (i.needsWorkspace) out.push('ai_suggested');
  return out;
}

const list = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join('\n') : '- (없음)');
const DOC = { resume: '이력서', career: '경력기술서' } as const;

/** 작업 공간에 붙여 넣을 요청문(md). 조립 결과 md 전문은 넣지 않는다(작업 공간에 기본 서류가 있다). 길이 제한 없음 */
export function buildHandoffRequest(i: {
  company: string;
  position: string;
  site: string;
  url: string | null;
  deadline: string | null;
  postingText: string;
  topWords: string[];
  recipe: { track: string; profileId: string; profileName: string; adjustments: string[] };
  profileRanking: { id: string; name: string; fitPercent: number }[] | null;
  recipeSummary: string[];
  pending: string[];
  warnings: KitWarning[];
  userNote: string;
  kitLabel: string;
  /** 사용자 지원 폴더 이름 제안: {지원 예정일}_{회사}_{직무} */
  folderName: string;
}): string {
  const out: string[] = ['# 공고 특화 이력서 요청', ''];
  const section = (title: string, ...body: string[]) => out.push(`## ${title}`, '', ...body, '');

  section('지원 폴더 이름 제안', `\`${i.folderName}\``);
  section(
    '공고 정보',
    `- 회사: ${i.company}`,
    `- 포지션: ${i.position}`,
    `- 사이트: ${i.site}`,
    `- 링크: ${i.url ?? '없음'}`,
    `- 마감: ${i.deadline ?? '없음'}`,
  );
  section('공고에서 많이 나온 단어', i.topWords.length ? i.topWords.join(', ') : '(없음)');

  const chosen = [
    `- 직무: ${i.recipe.track}`,
    `- 프로필: ${i.recipe.profileId} ${i.recipe.profileName} (키트 ${i.kitLabel})`,
    '- 추가 조정:',
    ...(i.recipe.adjustments.length ? i.recipe.adjustments.map((a) => `  - ${a}`) : ['  - (없음)']),
  ];
  if (i.profileRanking && i.profileRanking.length > 0) {
    chosen.push('', '프로필 추천도 (공고 분석의 AI 추천):', ...i.profileRanking.map((p) => `- ${p.id} ${p.name} ${p.fitPercent}%`));
  }
  section('앱이 고른 직무·프로필·추가 조정', ...chosen);

  section('앱 조립 요약과 남은 추가 조정', '조립 요약:', list(i.recipeSummary), '', '남은 추가 조정:', list(i.pending));
  section('앱 자동 검사에서 걸린 것', list(i.warnings.map((w) => `(${DOC[w.doc]}) ${w.detail}`)));
  section('메모', i.userNote.trim() || '(없음)');
  section('공고 본문', fence(i.postingText));
  section(
    '요청',
    '위 공고에 맞춘 이력서와 경력기술서를 만들어 주세요. 작업 공간의 가이드·작성 규칙·마스터스토리를 따라 이력서.md·경력기술서.md를 만들어 주세요. 마스터스토리 밖의 사실·숫자는 쓰지 않습니다.',
  );
  return out.join('\n').trimEnd() + '\n';
}
