function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 로컬 시간대 기준 YYYY-MM-DD */
export function todayLocal(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 로컬 날짜 기준 months개월 전의 YYYY-MM-DD. 그 달에 없는 날이면 말일로 맞춘다(8/31의 6개월 전은 2/28). */
export function monthsAgoLocal(now: Date, months: number): string {
  const total = now.getFullYear() * 12 + now.getMonth() - months;
  const y = Math.floor(total / 12);
  const m = total % 12;
  const last = new Date(y, m + 1, 0).getDate();
  return `${y}-${pad(m + 1)}-${pad(Math.min(now.getDate(), last))}`;
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

const KST_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** 한국 시간(+09:00) 고정 모양 ISO: YYYY-MM-DDTHH:mm:ss.SSS+09:00. PC 시간대와 무관. 문자열 비교로 정렬할 수 있다. */
export function toKstIso(d: Date): string {
  const p = Object.fromEntries(KST_PARTS.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.${String(d.getUTCMilliseconds()).padStart(3, '0')}+09:00`;
}

/** 같은 지원일 안의 순서만 나타내는 정렬용 값. rank 0이 가장 최근: 12:00:00에서 rank초를 뺀다(0~43199). 실제 시각이 아니다. */
export function syntheticKstIso(appliedAt: string, rank: number): string {
  const total = 12 * 3600 - Math.min(Math.max(Math.floor(rank), 0), 43199);
  return `${appliedAt}T${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}.000+09:00`;
}

function utcDay(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** to − from 일수. 둘 다 YYYY-MM-DD. Date.UTC로 계산해 시간대 영향이 없다. */
export function daysBetween(from: string, to: string): number {
  return Math.round((utcDay(to) - utcDay(from)) / 86_400_000);
}

/** YYYY-MM-DD의 요일. 0=월 … 6=일 */
export function weekdayMon0(date: string): number {
  return (new Date(utcDay(date)).getUTCDay() + 6) % 7;
}
