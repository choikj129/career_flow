import { desc, sql } from 'drizzle-orm';
import { applications } from '@/lib/db/schema';

/** 지원 기록 목록의 기본 정렬: 지원일 ↓ → 정렬용 일시 ↓(없으면 같은 날 맨 뒤) → id ↓. */
export const applicationOrder = [
  desc(applications.appliedAt),
  sql`${applications.appliedDatetime} IS NULL`,
  desc(applications.appliedDatetime),
  desc(applications.id),
];
