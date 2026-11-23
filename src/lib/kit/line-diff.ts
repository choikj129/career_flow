// 줄 단위 비교(LCS). 순수 함수라 클라이언트에서도 쓴다.

export type DiffLine = { text: string; op: 'same' | 'del' | 'ins' };

/** 앞뒤 공통 줄을 뺀 가운데의 줄 수 곱(LCS 표 칸 수) 상한. 넘으면 가운데는 통째로 지움+넣음으로 보인다 */
export const LINE_DIFF_MAX_CELLS = 250_000;

export function lineDiff(a: string, b: string): DiffLine[] {
  const A = a === '' ? [] : a.split('\n');
  const B = b === '' ? [] : b.split('\n');

  // 앞뒤 공통 줄은 비교 없이 같은 줄로 둔다(큰 문서에서도 바뀐 곳만 비교한다)
  let head = 0;
  while (head < A.length && head < B.length && A[head] === B[head]) head++;
  let tail = 0;
  while (tail < A.length - head && tail < B.length - head && A[A.length - 1 - tail] === B[B.length - 1 - tail]) tail++;

  const out: DiffLine[] = A.slice(0, head).map((text) => ({ text, op: 'same' as const }));
  out.push(...middleDiff(A.slice(head, A.length - tail), B.slice(head, B.length - tail)));
  out.push(...A.slice(A.length - tail).map((text) => ({ text, op: 'same' as const })));
  return out;
}

function middleDiff(A: string[], B: string[]): DiffLine[] {
  const n = A.length;
  const m = B.length;
  if (n * m > LINE_DIFF_MAX_CELLS) {
    return [...A.map((text) => ({ text, op: 'del' as const })), ...B.map((text) => ({ text, op: 'ins' as const }))];
  }
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
