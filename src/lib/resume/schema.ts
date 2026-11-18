import { z } from 'zod';

const yearMonth = z.string().regex(/^\d{4}-\d{2}$/, 'YYYY-MM 형식이어야 합니다');

export const ResumeContent = z.object({
  basics: z.object({
    name: z.string(),
    email: z.string().optional(),
    phone: z.string().optional(),
    links: z.array(z.object({ label: z.string(), url: z.string() })),
  }),
  summary: z.string(),
  experiences: z.array(
    z.object({
      id: z.string(),
      company: z.string(),
      role: z.string(),
      start: yearMonth,
      end: yearMonth.nullable(),
      description: z.string(),
      achievements: z.array(z.string()),
    }),
  ),
  projects: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      org: z.string().optional(),
      start: z.string().optional(),
      end: z.string().optional(),
      role: z.string(),
      techStack: z.array(z.string()),
      achievements: z.array(z.string()),
      link: z.string().optional(),
    }),
  ),
  skills: z.array(z.object({ category: z.string(), items: z.array(z.string()) })),
  education: z.array(
    z.object({
      school: z.string(),
      major: z.string().optional(),
      degree: z.string().optional(),
      start: z.string().optional(),
      end: z.string().optional(),
    }),
  ),
  certifications: z.array(
    z.object({ name: z.string(), issuer: z.string().optional(), date: z.string().optional() }),
  ),
  careerNarrative: z.string(),
  portfolio: z.array(
    z.object({
      title: z.string(),
      url: z.string().optional(),
      filePath: z.string().optional(),
      summary: z.string(),
    }),
  ),
});
export type ResumeContent = z.infer<typeof ResumeContent>;

export const Preferences = z.object({
  salaryMinManwon: z.number().optional(),
  salaryMaxManwon: z.number().optional(),
  locations: z.array(z.string()),
  workStyle: z.enum(['any', 'remote', 'hybrid', 'office']),
  companySizes: z.array(z.string()),
  preferredIndustries: z.array(z.string()),
  avoidIndustries: z.array(z.string()),
  notes: z.string().optional(),
});
export type Preferences = z.infer<typeof Preferences>;

export function emptyResume(): ResumeContent {
  return {
    basics: { name: '', links: [] },
    summary: '',
    experiences: [],
    projects: [],
    skills: [],
    education: [],
    certifications: [],
    careerNarrative: '',
    portfolio: [],
  };
}

export function defaultPreferences(): Preferences {
  return {
    locations: [],
    workStyle: 'any',
    companySizes: [],
    preferredIndustries: [],
    avoidIndustries: [],
  };
}
