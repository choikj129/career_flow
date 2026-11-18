import { eq, inArray, like, sql } from 'drizzle-orm';
import { getDb, type Db } from '@/lib/db/client';
import { applications, companies, companyKeys, postings } from '@/lib/db/schema';
import { normalizeCompanyName } from '@/lib/domain/normalize';

export type Company = typeof companies.$inferSelect;

export function findOrCreateCompany(
  input: { displayName: string; legalName?: string | null },
  db: Db = getDb(),
): number {
  const displayName = input.displayName.trim();
  const legalName = input.legalName?.trim() || null;
  const displayKey = normalizeCompanyName(displayName);
  const legalKey = legalName ? normalizeCompanyName(legalName) : '';
  if (!displayKey && !legalKey) throw new Error('회사 이름이 비어 있습니다');

  const wanted: { key: string; kind: 'display' | 'legal' }[] = [];
  if (displayKey) wanted.push({ key: displayKey, kind: 'display' });
  if (legalKey && legalKey !== displayKey) wanted.push({ key: legalKey, kind: 'legal' });

  return db.transaction((tx) => {
    const found = tx
      .select()
      .from(companyKeys)
      .where(inArray(companyKeys.key, wanted.map((w) => w.key)))
      .all();
    let companyId: number;
    if (found.length > 0) {
      companyId = Math.min(...found.map((f) => f.companyId));
      if (legalName) {
        const c = tx.select().from(companies).where(eq(companies.id, companyId)).get();
        if (c && !c.legalName) {
          tx.update(companies).set({ legalName }).where(eq(companies.id, companyId)).run();
        }
      }
    } else {
      companyId = tx
        .insert(companies)
        .values({ displayName: displayName || legalName!, legalName, createdAt: new Date().toISOString() })
        .returning({ id: companies.id })
        .get().id;
    }
    const have = new Set(found.map((f) => f.key));
    for (const w of wanted) {
      if (have.has(w.key)) continue;
      tx.insert(companyKeys).values({ companyId, key: w.key, kind: w.kind }).onConflictDoNothing().run();
    }
    return companyId;
  });
}

export function searchCompanies(
  text: string,
  db: Db = getDb(),
): { id: number; displayName: string; legalName: string | null; applicationCount: number }[] {
  const key = normalizeCompanyName(text);
  if (!key) return [];
  const ids = db
    .selectDistinct({ id: companyKeys.companyId })
    .from(companyKeys)
    .where(like(companyKeys.key, `%${key}%`))
    .all()
    .map((r) => r.id);
  if (ids.length === 0) return [];
  const cs = db.select().from(companies).where(inArray(companies.id, ids)).all();
  const counts = db
    .select({ companyId: applications.companyId, n: sql<number>`count(*)` })
    .from(applications)
    .where(inArray(applications.companyId, ids))
    .groupBy(applications.companyId)
    .all();
  const countMap = new Map(counts.map((c) => [c.companyId, c.n]));
  return cs
    .sort((a, b) => a.id - b.id)
    .map((c) => ({
      id: c.id,
      displayName: c.displayName,
      legalName: c.legalName,
      applicationCount: countMap.get(c.id) ?? 0,
    }));
}

export function addCompanyAlias(companyId: number, alias: string, db: Db = getDb()): void {
  const key = normalizeCompanyName(alias);
  if (!key) throw new Error('별칭이 비어 있습니다');
  db.insert(companyKeys).values({ companyId, key, kind: 'alias' }).onConflictDoNothing().run();
}

/** removeId 회사의 공고·지원·키를 keepId로 옮기고 removeId 회사를 지운다. */
export function mergeCompanies(keepId: number, removeId: number, db: Db = getDb()): void {
  if (keepId === removeId) throw new Error('같은 회사끼리는 합칠 수 없습니다');
  db.transaction((tx) => {
    const keep = tx.select().from(companies).where(eq(companies.id, keepId)).get();
    const remove = tx.select().from(companies).where(eq(companies.id, removeId)).get();
    if (!keep || !remove) throw new Error('회사를 찾을 수 없습니다');
    tx.update(postings).set({ companyId: keepId }).where(eq(postings.companyId, removeId)).run();
    tx.update(applications).set({ companyId: keepId }).where(eq(applications.companyId, removeId)).run();
    tx.update(companyKeys).set({ companyId: keepId }).where(eq(companyKeys.companyId, removeId)).run();
    if (!keep.legalName && remove.legalName) {
      tx.update(companies).set({ legalName: remove.legalName }).where(eq(companies.id, keepId)).run();
    }
    tx.delete(companies).where(eq(companies.id, removeId)).run();
  });
}

/** 회사에 연결된 공고·지원 기록 수(합치기 확인 문구용) */
export function getCompanyUsage(
  companyId: number,
  db: Db = getDb(),
): { postings: number; applications: number } {
  const p = db.select({ n: sql<number>`count(*)` }).from(postings).where(eq(postings.companyId, companyId)).get();
  const a = db.select({ n: sql<number>`count(*)` }).from(applications).where(eq(applications.companyId, companyId)).get();
  return { postings: p?.n ?? 0, applications: a?.n ?? 0 };
}

export function getCompany(id: number, db: Db = getDb()): Company | undefined {
  return db.select().from(companies).where(eq(companies.id, id)).get();
}

export function listCompanyKeys(
  companyId: number,
  db: Db = getDb(),
): { key: string; kind: 'display' | 'legal' | 'alias' }[] {
  return db
    .select({ key: companyKeys.key, kind: companyKeys.kind })
    .from(companyKeys)
    .where(eq(companyKeys.companyId, companyId))
    .all();
}
