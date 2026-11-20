import { z } from 'zod';
import { APPLICATION_STATUSES, type ApplicationStatus } from '@/lib/domain/types';

export const AnalysisResult = z.object({
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
export type AnalysisResult = z.infer<typeof AnalysisResult>;

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
