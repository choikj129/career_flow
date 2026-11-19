import type { ApplicationStatus } from '@/lib/domain/types';

// 클라이언트 컴포넌트에서도 쓸 수 있는 순수 함수.

export type ReachedStage = 'document_passed' | 'interview' | 'final_passed';
export const REACHED_STAGES: ReachedStage[] = ['document_passed', 'interview', 'final_passed'];

/** 이 상태에 도달했다면 거친 것으로 보는 단계(면접·최종합격은 서류합격을 거친 것으로 본다). */
const IMPLIES: Partial<Record<ApplicationStatus, ReachedStage[]>> = {
  document_passed: ['document_passed'],
  interview: ['document_passed', 'interview'],
  final_passed: ['document_passed', 'interview', 'final_passed'],
};

/**
 * 지금 상태와 상태 이력으로 거친 단계를 구한다.
 * 지금 상태가 지원이면 이력이 있어도 빈 집합(잘못 눌렀다 되돌린 경우).
 */
export function reachedStages(current: ApplicationStatus, history: ApplicationStatus[]): Set<ReachedStage> {
  const out = new Set<ReachedStage>();
  if (current === 'applied') return out;
  for (const s of [current, ...history]) for (const r of IMPLIES[s] ?? []) out.add(r);
  return out;
}

/** 서류합격·면접·최종합격 필터는 거친 단계, 나머지는 지금 상태. */
export function matchesStatusFilter(
  filter: ApplicationStatus,
  current: ApplicationStatus,
  reached: Set<ReachedStage>,
): boolean {
  if (filter === 'document_passed' || filter === 'interview' || filter === 'final_passed') return reached.has(filter);
  return current === filter;
}
