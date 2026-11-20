export type SiteId = 'remember' | 'wanted' | 'groupby' | 'jobkorea' | 'homepage' | 'other';
export const SITE_IDS: SiteId[] = ['remember', 'wanted', 'groupby', 'jobkorea', 'homepage', 'other'];
export const SITE_LABELS: Record<SiteId, string> = {
  remember: '리멤버',
  wanted: '원티드',
  groupby: '그룹바이',
  jobkorea: '잡코리아',
  homepage: '홈페이지 지원',
  other: '기타',
};

export type ApplicationStatus =
  | 'applied'
  | 'document_passed'
  | 'assignment'
  | 'interview'
  | 'final_passed'
  | 'rejected'
  | 'withdrawn';
export const APPLICATION_STATUSES: ApplicationStatus[] = [
  'applied', 'document_passed', 'assignment', 'interview', 'final_passed', 'rejected', 'withdrawn',
];
export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: '지원',
  document_passed: '서류합격',
  assignment: '과제·코딩테스트',
  interview: '면접',
  final_passed: '최종합격',
  rejected: '불합격',
  withdrawn: '지원취소',
};

export type JobType = 'analyze_posting' | 'import_resume' | 'import_applications';
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
export type AiErrorKind =
  | 'auth'
  | 'usage_limit'
  | 'timeout'
  | 'schema'
  | 'cli'
  | 'extract_failed'
  | 'interrupted';
