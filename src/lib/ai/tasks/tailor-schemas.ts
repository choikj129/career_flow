import { z } from 'zod';

/** 용어 맞추기·다듬기 결과. 추천도는 공고 분석이 정한다(D-28 b) */
export const KitTailorOutput = z.object({
  resumeMd: z.string(),
  careerMd: z.string(),
  changeReasons: z.array(z.object({ doc: z.enum(['resume', 'career']), after: z.string(), reason: z.string() })),
  notes: z.string(), // 다른 프로필이 더 맞아 보이면 한 줄
  needsWorkspace: z.boolean(), // 허용 범위 안에서는 공고에 잘 맞출 수 없다고 보면 true (Task 9 요청 제안 기준)
});
export type KitTailorOutput = z.infer<typeof KitTailorOutput>;
