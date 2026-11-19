/** 1·2·5×10^k 중 n 이상인 가장 작은 값. n ≤ 0이면 1 */
export function niceMax(n: number): number {
  if (!(n > 0)) return 1;
  const exp = Math.floor(Math.log10(n));
  const base = 10 ** exp;
  for (const m of [1, 2, 5, 10]) if (m * base >= n) return m * base;
  return 10 * base;
}

/** 0부터 max까지 count칸 눈금(기본 4) */
export function ticks(max: number, count = 4): number[] {
  return Array.from({ length: count + 1 }, (_, i) => (max / count) * i);
}
