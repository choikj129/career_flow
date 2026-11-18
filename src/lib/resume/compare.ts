import { ResumeContent } from './schema';

/** 두 이력서 내용이 같은지. 스키마로 한 번 읽어 키 순서·빈 선택 항목 차이를 없앤 뒤 JSON으로 비교한다. */
export function sameResume(a: ResumeContent, b: ResumeContent): boolean {
  return JSON.stringify(ResumeContent.parse(a)) === JSON.stringify(ResumeContent.parse(b));
}
