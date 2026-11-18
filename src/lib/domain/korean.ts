// 받침에 따라 달라지는 조사를 붙인다. 화면 문구에서 회사 이름 뒤에 쓴다.

const PAIRS = {
  와: ['과', '와'],
  를: ['을', '를'],
  은: ['은', '는'],
  이: ['이', '가'],
  로: ['으로', '로'],
} as const;

type Josa = keyof typeof PAIRS;

/** 마지막 글자의 받침. 한글이 아니면 받침 없음으로 본다(영문·숫자는 흔히 모음으로 끝나는 것처럼 읽는다). */
function finalConsonant(word: string): number {
  const ch = word.trim().slice(-1);
  if (!ch) return 0;
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return 0;
  return (code - 0xac00) % 28;
}

/** josa('토스', '와') → '토스와', josa('오렌지핀', '와') → '오렌지핀과' */
export function josa(word: string, kind: Josa): string {
  const [withFinal, withoutFinal] = PAIRS[kind];
  const jong = finalConsonant(word);
  // 으로/로는 받침이 ㄹ(8)일 때도 '로'
  const hasFinal = kind === '로' ? jong !== 0 && jong !== 8 : jong !== 0;
  return word + (hasFinal ? withFinal : withoutFinal);
}
