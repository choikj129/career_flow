/**
 * 다듬기용 새 실행 프롬프트(D-11). 원래 작업의 입력(basePrompt)과 현재 결과, 사용자 요청을 모두 넣는다.
 * 이전 세션을 이어 붙이지 않는다(--resume 안 씀). 4단계 면접 준비 추가 요청도 이 함수를 쓴다.
 */
export function buildRevisionPrompt(input: { basePrompt: string; currentJson: unknown; request: string; extraRules?: string }): string {
  const parts = [
    input.basePrompt.trimEnd(),
    '## 현재 결과 (JSON)',
    '```json\n' + JSON.stringify(input.currentJson, null, 2) + '\n```',
    '## 사용자 요청',
    input.request.trim(),
  ];
  if (input.extraRules?.trim()) parts.push(input.extraRules.trim());
  return parts.join('\n\n') + '\n';
}
