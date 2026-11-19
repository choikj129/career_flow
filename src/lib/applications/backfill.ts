import { and, asc, eq, isNull } from 'drizzle-orm';
import { getDb, type Db } from '@/lib/db/client';
import { applications, companies } from '@/lib/db/schema';
import { syntheticKstIso, toKstIso, validDate } from '@/lib/domain/dates';
import { normalizeCompanyName, normalizePosition } from '@/lib/domain/normalize';
import type { SiteId } from '@/lib/domain/types';

// 일회성 채우기(화면 없음). 이미 들어간 지난 기록의 정렬용 일시(applied_datetime)를 채운다.
// 값은 정렬 전용이다. 메일은 수신 시각, 그룹바이는 사용자가 쓴 표 순서로 만든 값(실제 시각 아님).

export type BackfillEntry = {
  site: SiteId;
  companyName: string;
  positionTitle: string;
  appliedAt: string;
  appliedDatetime: string;
};

/**
 * 줄마다 `UTC시각|회사|포지션`. 시각은 ISO(`2026-03-03T16:30:00Z`), `2026-03-03 16:30:00`, 초 없는 `2026-11-06T05:44`(초는 :00) 모두 UTC로 본다.
 * 모양이 다른 줄은 던지지 않고 건너뛰며 그 줄 번호(1부터)를 skipped에 담는다. 빈 줄은 무시한다.
 */
export function parseMailTimeLinesDetailed(
  site: SiteId,
  text: string,
): { entries: BackfillEntry[]; skipped: number[] } {
  const entries: BackfillEntry[] = [];
  const skipped: number[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const parts = line.split('|');
    if (parts.length < 3) {
      skipped.push(i + 1);
      return;
    }
    const [time, company, ...rest] = parts.map((x) => x.trim());
    const position = rest.join('|').trim();
    const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(:\d{2}(?:\.\d+)?)?(Z|\+00:00)?$/.exec(time);
    const d = m ? new Date(`${m[1]}T${m[2]}${m[3] ?? ':00'}Z`) : null;
    if (!d || Number.isNaN(d.getTime()) || !company || !position) {
      skipped.push(i + 1);
      return;
    }
    const kst = toKstIso(d);
    entries.push({ site, companyName: company, positionTitle: position, appliedAt: kst.slice(0, 10), appliedDatetime: kst });
  });
  return { entries, skipped };
}

export function parseMailTimeLines(site: SiteId, text: string): BackfillEntry[] {
  return parseMailTimeLinesDetailed(site, text).entries;
}

/**
 * 마크다운 표(열: 회사 | 포지션 | 날짜 YYYYMMDD)를 위에서부터 읽는다. 표는 최신이 위다.
 * 같은 날짜 안에서 나온 순서대로 rank 0, 1…을 주어 syntheticKstIso로 만든다.
 */
export function parseGroupbyTable(md: string): BackfillEntry[] {
  const out: BackfillEntry[] = [];
  const rankByDay = new Map<string, number>();
  for (const line of md.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    const cells = t.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    if (cells.length < 3) continue;
    const m = /^(\d{4})[-.]?(\d{2})[-.]?(\d{2})$/.exec(cells[2]);
    if (!m) continue; // 머리·구분 줄
    const appliedAt = `${m[1]}-${m[2]}-${m[3]}`;
    if (!validDate(appliedAt) || !cells[0] || !cells[1]) continue;
    const rank = rankByDay.get(appliedAt) ?? 0;
    rankByDay.set(appliedAt, rank + 1);
    out.push({
      site: 'groupby',
      companyName: cells[0],
      positionTitle: cells[1],
      appliedAt,
      appliedDatetime: syntheticKstIso(appliedAt, rank),
    });
  }
  return out;
}

/**
 * 항목을 기록에 맞춰 appliedDatetime을 채운다. 대상은 appliedDatetime이 NULL인 기록만(덮어쓰지 않음).
 * 키: 사이트 + 회사(정규화) + 포지션(정규화) + 지원일. 같은 키가 여럿이면 id 오름차순 기록 ↔ 시각 오름차순 항목.
 * dryRun이면 저장하지 않고 개수만 센다. 항목이 더 많으면 남는 항목은 ambiguous, 기록이 하나도 없으면 unmatched. 한 트랜잭션.
 */
export function backfillAppliedDatetime(
  entries: BackfillEntry[],
  db: Db = getDb(),
  opts: { dryRun?: boolean } = {},
): { updated: number; unmatched: BackfillEntry[]; ambiguous: BackfillEntry[] } {
  const keyOf = (site: string, company: string, position: string, day: string) =>
    [site, normalizeCompanyName(company), normalizePosition(position), day].join('\u0000');

  const groups = new Map<string, BackfillEntry[]>();
  for (const e of entries) {
    const k = keyOf(e.site, e.companyName, e.positionTitle, e.appliedAt);
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }

  const unmatched: BackfillEntry[] = [];
  const ambiguous: BackfillEntry[] = [];
  let updated = 0;
  db.transaction((tx) => {
    const records = new Map<string, number[]>();
    for (const r of tx
      .select({
        id: applications.id,
        site: applications.site,
        position: applications.positionTitle,
        day: applications.appliedAt,
        company: companies.displayName,
      })
      .from(applications)
      .innerJoin(companies, eq(applications.companyId, companies.id))
      .where(isNull(applications.appliedDatetime))
      .orderBy(asc(applications.id))
      .all()) {
      const k = keyOf(r.site, r.company, r.position, r.day);
      records.set(k, [...(records.get(k) ?? []), r.id]);
    }

    for (const [k, list] of groups) {
      const ids = records.get(k) ?? [];
      const sorted = [...list].sort((a, b) => (a.appliedDatetime < b.appliedDatetime ? -1 : a.appliedDatetime > b.appliedDatetime ? 1 : 0));
      if (ids.length === 0) {
        unmatched.push(...sorted);
        continue;
      }
      sorted.forEach((e, i) => {
        if (i >= ids.length) {
          ambiguous.push(e);
          return;
        }
        if (!opts.dryRun) {
          tx.update(applications)
            .set({ appliedDatetime: e.appliedDatetime })
            .where(and(eq(applications.id, ids[i]), isNull(applications.appliedDatetime)))
            .run();
        }
        updated += 1;
      });
    }
  });
  return { updated, unmatched, ambiguous };
}
