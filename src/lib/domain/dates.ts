function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 로컬 시간대 기준 YYYY-MM-DD */
export function todayLocal(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 로컬 시간대 기준 YYYY-MM */
export function monthLocal(now: Date = new Date()): string {
  return todayLocal(now).slice(0, 7);
}

/** 저장된 ISO 시각을 로컬 "M월 D일 HH:mm"으로. 없거나 잘못되면 빈 문자열. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 상태 이력의 시각을 로컬 날짜(YYYY-MM-DD)로. 날짜만 저장된 값은 그대로. */
export function eventDate(at: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(at) ? at : todayLocal(new Date(at));
}

/** 밀리초를 "m:ss"로 */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

/** 마감일(YYYY-MM-DD)이 오늘보다 앞이면 true. 마감일 없음(상시)은 false. */
export function isPastDeadline(deadline: string | null | undefined, today: string): boolean {
  return !!deadline && deadline < today;
}

/** YYYY-MM-DD 형식이면서 실제로 있는 날짜인지(2026-13-45, 2026-02-30 은 false). 공용 검사 함수. */
export function validDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}
