import { eventDate } from '@/lib/domain/dates';

// 클라이언트 컴포넌트에서도 쓸 수 있는 순수 함수(DB를 읽지 않는다).

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 상태 이력을 오래된 것부터 정렬한다. 현재 상태를 정하는 기준과 같다(실효 날짜, 같은 날이면 id).
 * 처음 만들 때 자동으로 들어간 이력(시각이 날짜만이 아닌 값)은 기록한 시각(오늘)이 아니라 지원일에 일어난 일로 본다.
 * 직접 고친 날짜(날짜만 저장)는 그대로 쓴다.
 */
export function sortEventsAscending<T extends { id: number; at: string }>(events: T[], appliedAt: string): T[] {
  if (events.length === 0) return [];
  const firstId = Math.min(...events.map((e) => e.id));
  const when = (e: T) => {
    const d = eventDate(e.at);
    return e.id === firstId && !DATE_ONLY.test(e.at) && appliedAt < d ? appliedAt : d;
  };
  return [...events].sort((a, b) => {
    const da = when(a);
    const db = when(b);
    return da < db ? -1 : da > db ? 1 : a.id - b.id;
  });
}
