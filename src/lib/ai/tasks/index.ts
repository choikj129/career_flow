import type { JobHandler } from '@/lib/ai/queue';
import type { JobType } from '@/lib/domain/types';
import { analyzePosting } from './analyze-posting';
import { importApplications } from './import-applications';
import { importResume } from './import-resume';

export const handlers: Record<JobType, JobHandler> = {
  analyze_posting: analyzePosting,
  import_resume: importResume,
  import_applications: importApplications,
};
