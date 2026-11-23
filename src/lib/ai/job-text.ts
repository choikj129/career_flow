import type { JobType } from '@/lib/domain/types';

// 이 파일은 클라이언트 컴포넌트에서도 쓴다. 서버 전용 모듈(DB, 파일)을 import하지 않는다.

/** 실행 중 표시 문구 */
export function estimateText(type: JobType): string {
  switch (type) {
    case 'analyze_posting':
      return '분석 중… (보통 1~2분)';
    case 'import_resume':
      return '이력서를 읽는 중… (보통 1~2분)';
    case 'import_applications':
      return '지원 내역을 읽는 중… (보통 1~2분)';
    case 'tailor_resume':
      return '공고 용어 맞추는 중… (보통 1~3분)';
    case 'revise_tailored':
      return '맞춤 이력서 다듬는 중… (보통 1~3분)';
  }
}
