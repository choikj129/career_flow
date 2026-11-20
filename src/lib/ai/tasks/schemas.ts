import { z } from 'zod';
import { APPLICATION_STATUSES, type ApplicationStatus } from '@/lib/domain/types';

const AnalysisBase = z.object({
  posting: z.object({
    companyDisplayName: z.string().trim().min(1),
    companyLegalName: z.string().nullable(),
    positionTitle: z.string().trim().min(1),
    experienceRequirement: z.string().nullable(),
    employmentType: z.string().nullable(),
    location: z.string().nullable(),
    deadline: z.string().nullable(), // 'YYYY-MM-DD' 또는 null(상시)
    salary: z.string().nullable(),
    responsibilities: z.array(z.string()),
    requirements: z.array(z.string()),
    preferred: z.array(z.string()),
    techStack: z.array(z.string()),
  }),
  fit: z.object({
    score: z.number().int().min(0).max(100),
    breakdown: z.array(
      z.object({
        category: z.enum(['requirements', 'preferred', 'experience_years', 'tech_stack', 'domain', 'preferences']),
        score: z.number().int().min(0).max(100),
        reason: z.string(),
      }),
    ),
  }),
  strengths: z.array(z.object({ point: z.string(), evidence: z.string() })),
  gaps: z.array(
    z.object({ point: z.string(), kind: z.enum(['hidden', 'missing']), suggestion: z.string() }),
  ),
  preferenceMismatches: z.array(z.string()),
  tailoringAdvice: z.string(),
});

/** AI가 내는 프로필 추천(D-28 b). 서류 키트가 있을 때만 분석 출력에 넣는다. */
export const ProfileRecommendationOut = z.object({
  track: z.string(), // 키트 직무 이름 중 하나
  trackReason: z.string(),
  profiles: z.array(
    z.object({
      id: z.string(),
      fitPercent: z.number().int().min(0).max(100),
      keywords: z.array(z.string()), // 근거가 된 공고 단어(공고 본문에 있는 것만)
      reason: z.string(), // 한 줄
    }),
  ), // 그 직무의 프로필 전부
  adjustments: z.array(z.object({ id: z.string(), recommended: z.boolean(), keywords: z.array(z.string()) })),
});
export type ProfileRec = z.infer<typeof ProfileRecommendationOut> & { kitId: number };

/** 저장·화면용. 옛 분석 결과도 읽히도록 profileRecommendation은 선택이다. kitId는 코드가 붙인다. */
export const AnalysisResult = AnalysisBase.extend({
  profileRecommendation: ProfileRecommendationOut.extend({ kitId: z.number().int() }).nullable().optional(),
});
export type AnalysisResult = z.infer<typeof AnalysisResult>;

/** CLI용 출력 스키마: 키트가 있으면 profileRecommendation 칸 필수, 없으면 칸 자체를 뺀다. */
export function analysisOutputSchema(withProfiles: boolean): z.ZodType<Omit<AnalysisResult, 'profileRecommendation'> & { profileRecommendation?: z.infer<typeof ProfileRecommendationOut> }> {
  return (withProfiles ? AnalysisBase.extend({ profileRecommendation: ProfileRecommendationOut }) : AnalysisBase) as never;
}

export const ImportedApplications = z.object({
  rows: z.array(
    z.object({
      companyName: z.string(),
      positionTitle: z.string(),
      site: z.enum(['remember', 'wanted', 'groupby', 'jobkorea', 'homepage', 'other']).nullable(),
      appliedAt: z.string().nullable(),
      status: z.enum(APPLICATION_STATUSES as [ApplicationStatus, ...ApplicationStatus[]]).nullable(),
    }),
  ),
});
export type ImportedApplications = z.infer<typeof ImportedApplications>;
