import { eq } from 'drizzle-orm';
import { getDb, type Db } from '@/lib/db/client';
import { settings } from '@/lib/db/schema';
import type { JobType } from '@/lib/domain/types';

// 판단이 필요한 작업은 opus, 옮겨 적는 작업은 sonnet (docs/decisions.md D-05).
// 작업 종류를 추가할 때 이 표에도 추가한다.
export const DEFAULT_MODELS: Record<JobType, 'opus' | 'sonnet' | 'haiku'> = {
  analyze_posting: 'opus',
  import_resume: 'sonnet',
  import_applications: 'sonnet',
};

export function getModelFor(type: JobType, db: Db = getDb()): string {
  const row = db.select().from(settings).where(eq(settings.key, `model.${type}`)).get();
  return row?.value ?? DEFAULT_MODELS[type];
}

export function setModelFor(type: JobType, model: string, db: Db = getDb()): void {
  db.insert(settings)
    .values({ key: `model.${type}`, value: model })
    .onConflictDoUpdate({ target: settings.key, set: { value: model } })
    .run();
}
