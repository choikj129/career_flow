import { ResumeContent } from './schema';

/** 두 이력서 내용이 같은지. 스키마로 한 번 읽어 키 순서·빈 선택 항목 차이를 없앤 뒤 JSON으로 비교한다. */
export function sameResume(a: ResumeContent, b: ResumeContent): boolean {
  return JSON.stringify(ResumeContent.parse(a)) === JSON.stringify(ResumeContent.parse(b));
}

/**
 * 편집기에서 "저장하지 않은 변경"이 있는지. 저장을 마쳤으면 항상 false,
 * 아직 저장된 적 없는 초안(draft)이면 항상 true, 아니면 처음 내용과 달라졌는지로 판단한다.
 */
export function isResumeDirty(opts: { draft?: boolean; done: boolean; current: unknown; baselineJson: string }): boolean {
  if (opts.done) return false;
  return !!opts.draft || JSON.stringify(opts.current) !== opts.baselineJson;
}
