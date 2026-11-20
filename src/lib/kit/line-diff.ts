// 줄 단위 비교(LCS). 순수 함수라 클라이언트에서도 쓴다.

export type DiffLine = { text: string; op: 'same' | 'del' | 'ins' };

export function lineDiff(a: string, b: string): DiffLine[] {
  const A = a === '' ? [] : a.split('\n');
  const B = b === '' ? [] : b.split('\n');
  const n = A.length;
  const m = B.length;
  // lcs[i][j] = A[i..]와 B[j..]의 가장 긴 공통 부분 수열 길이
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = A[i] === B[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      out.push({ text: A[i], op: 'same' });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ text: A[i++], op: 'del' });
    } else {
      out.push({ text: B[j++], op: 'ins' });
    }
  }
  while (i < n) out.push({ text: A[i++], op: 'del' });
  while (j < m) out.push({ text: B[j++], op: 'ins' });
  return out;
}
