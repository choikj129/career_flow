// 순수 함수. 프롬프트·요청문에 넣는 외부 텍스트(공고 본문, 서류)를 울타리로 감싼다.

/** 본문 안의 ``` 보다 긴 울타리로 감싸 본문이 프롬프트 구조(제목·규칙)를 깨지 못하게 한다 */
export function fence(text: string): string {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  const bar = '`'.repeat(longest + 1);
  return `${bar}\n${text}\n${bar}`;
}
