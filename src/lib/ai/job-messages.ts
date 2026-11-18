import type { AiErrorKind, JobType } from '@/lib/domain/types';
import { JOB_TIMEOUT_MS } from './queue';

export type JobFailure = {
  kind: AiErrorKind | 'unknown';
  message: string;
  /** 접어서 보여 줄 원문(결과 형식 오류 등) */
  detail?: string;
  /** 본문 붙여넣기 입력창을 보여 줄지 */
  canPaste: boolean;
  /** 설정 링크를 붙일지(시간 초과) */
  settingsLink: boolean;
};

/** 실패한 작업을 화면 문구로 바꾼다. 기준: docs/spec/screens.md 0.4 */
export function describeJobFailure(
  job: { errorKind: AiErrorKind | null; errorMessage: string | null },
  type: JobType,
): JobFailure {
  const kind = job.errorKind ?? 'unknown';
  const base = { kind, canPaste: false, settingsLink: false } as const;
  switch (job.errorKind) {
    case 'extract_failed':
      return {
        ...base,
        canPaste: true,
        message: '공고 본문을 읽지 못했습니다. 공고 페이지 내용을 복사해 붙여넣어 주세요.',
        detail: job.errorMessage ?? undefined,
      };
    case 'auth':
      return {
        ...base,
        message: 'Claude Code 로그인이 필요합니다. 터미널에서 `claude`를 실행해 로그인한 뒤 다시 시도하세요.',
      };
    case 'usage_limit':
      return { ...base, message: job.errorMessage || '사용 한도에 도달했습니다.' };
    case 'timeout':
      return {
        ...base,
        settingsLink: true,
        message: `시간 제한(${Math.round(JOB_TIMEOUT_MS[type] / 60_000)}분)을 넘었습니다. 설정에서 시간 제한을 늘릴 수 있습니다.`,
      };
    case 'schema':
      return { ...base, message: '결과를 읽지 못했습니다.', detail: job.errorMessage ?? undefined };
    case 'interrupted':
      return { ...base, message: '앱이 종료되어 작업이 중단되었습니다.' };
    default:
      return { ...base, message: job.errorMessage || '작업이 실패했습니다.' };
  }
}

export { estimateText } from './job-text';
