import { daysBetween } from '@/lib/domain/dates';
import type { ApplicationStatus } from '@/lib/domain/types';
import type { ReachedStage } from '@/lib/applications/stages';

// 순수 함수. 대시보드와 통계 화면이 같은 분류를 쓴다(D-18).

export const NO_RESPONSE_DAYS = 30;

export type Outcome = 'passed' | 'rejected' | 'no_response' | 'pending' | 'withdrawn';
export const OUTCOMES: Outcome[] = ['passed', 'rejected', 'no_response', 'pending', 'withdrawn'];
export const OUTCOME_LABELS: Record<Outcome, string> = {
  passed: '서류 통과',
  rejected: '불합격',
  no_response: '무응답',
  pending: '대기',
  withdrawn: '지원취소',
};

/**
 * 위에서부터 처음 맞는 것: 서류합격을 거침 → passed, 지원취소 → withdrawn, 불합격 → rejected,
 * 지원이고 지원 후 noResponseDays일 안 됨 → pending, 그 밖의 지원 → no_response.
 */
export function classifyOutcome(
  a: { status: ApplicationStatus; appliedAt: string; reached: readonly ReachedStage[] },
  today: string,
  noResponseDays: number = NO_RESPONSE_DAYS,
): Outcome {
  if (a.reached.includes('document_passed')) return 'passed';
  if (a.status === 'withdrawn') return 'withdrawn';
  if (a.status === 'rejected') return 'rejected';
  return daysBetween(a.appliedAt, today) < noResponseDays ? 'pending' : 'no_response';
}
