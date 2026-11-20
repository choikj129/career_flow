import type { JobHandler } from '@/lib/ai/queue';
import type { JobType } from '@/lib/domain/types';
import { analyzePosting } from './analyze-posting';
import { importApplications } from './import-applications';
import { importResume } from './import-resume';

export const handlers: Record<JobType, JobHandler> = {
  analyze_posting: analyzePosting,
  import_resume: importResume,
  import_applications: importApplications,
  // Task 4에서 실제 처리기로 바뀐다.
  tailor_resume: async () => {
    throw new Error('아직 구현되지 않은 작업입니다');
  },
  revise_tailored: async () => {
    throw new Error('아직 구현되지 않은 작업입니다');
  },
};
