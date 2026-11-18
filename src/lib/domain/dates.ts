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
