import { and, eq, inArray } from 'drizzle-orm';
import { getDb, type Db } from '@/lib/db/client';
import { applications, companyKeys } from '@/lib/db/schema';
import { normalizeCompanyName, normalizePosition } from '@/lib/domain/normalize';

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

export type ExistingMatch = 'same' | 'same_day' | 'none';

/**
 * 같은 회사 + 같은 지원일 기록을 찾는다. 포지션(정규화)이 같거나 기존 포지션이 `(포지션 미상)`이면 same,
 * 기록은 있는데 포지션이 다르면 same_day, 없으면 none.
 */
export function findExistingMatches(
  rows: { companyName: string; positionTitle: string; appliedAt: string }[],
  db: Db = getDb(),
): ExistingMatch[] {
  return rows.map((r) => {
    const key = normalizeCompanyName(r.companyName);
    const date = r.appliedAt.trim();
    if (!key || !date) return 'none';
    const ids = db
      .select({ id: companyKeys.companyId })
      .from(companyKeys)
      .where(eq(companyKeys.key, key))
      .all()
      .map((x) => x.id);
    if (ids.length === 0) return 'none';
    const hits = db
      .select({ positionTitle: applications.positionTitle })
      .from(applications)
      .where(and(inArray(applications.companyId, ids), eq(applications.appliedAt, date)))
      .all();
    if (hits.length === 0) return 'none';
    const pos = normalizePosition(r.positionTitle);
    const same = hits.some((h) => h.positionTitle === '(포지션 미상)' || (pos !== '' && normalizePosition(h.positionTitle) === pos));
    return same ? 'same' : 'same_day';
  });
}
