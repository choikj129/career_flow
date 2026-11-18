import { and, eq, inArray } from 'drizzle-orm';
import { getDb, type Db } from '@/lib/db/client';
import { applications, companyKeys } from '@/lib/db/schema';
import { normalizeCompanyName } from '@/lib/domain/normalize';

/** 같은 회사(정규화한 이름·별칭 기준) + 같은 지원일 기록이 이미 있는 행이면 true. */
export function markExistingRows(
  rows: { companyName: string; appliedAt: string }[],
  db: Db = getDb(),
): boolean[] {
  return rows.map((r) => {
    const key = normalizeCompanyName(r.companyName);
    const date = r.appliedAt.trim();
    if (!key || !date) return false;
    const ids = db
      .select({ id: companyKeys.companyId })
      .from(companyKeys)
      .where(eq(companyKeys.key, key))
      .all()
      .map((x) => x.id);
    if (ids.length === 0) return false;
    const hit = db
      .select({ id: applications.id })
      .from(applications)
      .where(and(inArray(applications.companyId, ids), eq(applications.appliedAt, date)))
      .limit(1)
      .get();
    return hit != null;
  });
}
