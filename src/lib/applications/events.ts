import { eq } from 'drizzle-orm';
import { getDb, type Db } from '@/lib/db/client';
import { applications, statusEvents } from '@/lib/db/schema';
import { eventDate } from '@/lib/domain/dates';
import type { ApplicationStatus } from '@/lib/domain/types';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** 현재 상태를 남은 이력 중 가장 늦은 항목(날짜, 같은 날이면 나중에 넣은 것)으로 맞춘다. */
function syncCurrent(tx: Tx, applicationId: number): void {
  const rows = tx.select().from(statusEvents).where(eq(statusEvents.applicationId, applicationId)).all();
  const app = tx.select().from(applications).where(eq(applications.id, applicationId)).get();
  if (rows.length === 0 || !app) return;
  // 처음 만들 때 자동으로 들어간 이력(시각이 날짜만이 아닌 값)은 기록한 시각(오늘)이 아니라 지원일에 일어난 일로 본다.
  // 가져온 기록이나 과거 날짜로 넣은 상태 이력이 이 항목 때문에 뒤집히지 않게 한다. 직접 고친 날짜(날짜만 저장)는 그대로 쓴다.
  const firstId = Math.min(...rows.map((r) => r.id));
  const when = (e: (typeof rows)[number]) => {
    const d = eventDate(e.at);
    return e.id === firstId && !/^\d{4}-\d{2}-\d{2}$/.test(e.at) && app.appliedAt < d ? app.appliedAt : d;
  };
  const latest = rows.reduce((a, b) => {
    const da = when(a);
    const dbb = when(b);
    return dbb > da || (dbb === da && b.id > a.id) ? b : a;
  });
  tx.update(applications)
    .set({ status: latest.status, interviewRound: latest.status === 'interview' ? latest.interviewRound : null })
    .where(eq(applications.id, applicationId))
    .run();
}

/** 상태 이력 항목의 상태·면접 차수·날짜·메모를 고친다. 지원 기록의 현재 상태도 다시 맞춘다. */
export function updateStatusEvent(
  eventId: number,
  input: { status: ApplicationStatus; interviewRound?: number | null; at: string; note?: string | null },
  db: Db = getDb(),
): void {
  if (input.status === 'interview' && !(Number.isInteger(input.interviewRound) && input.interviewRound! >= 1)) {
    throw new Error('면접은 차수(1 이상)를 함께 입력해야 합니다');
  }
  db.transaction((tx) => {
    const ev = tx.select().from(statusEvents).where(eq(statusEvents.id, eventId)).get();
    if (!ev) throw new Error('상태 이력을 찾을 수 없습니다');
    tx.update(statusEvents)
      .set({
        status: input.status,
        interviewRound: input.status === 'interview' ? input.interviewRound! : null,
        at: input.at,
        note: input.note?.trim() || null,
      })
      .where(eq(statusEvents.id, eventId))
      .run();
    syncCurrent(tx, ev.applicationId);
  });
}

/** 상태 이력 항목을 지운다. 마지막 하나는 지울 수 없다. */
export function deleteStatusEvent(eventId: number, db: Db = getDb()): void {
  db.transaction((tx) => {
    const ev = tx.select().from(statusEvents).where(eq(statusEvents.id, eventId)).get();
    if (!ev) throw new Error('상태 이력을 찾을 수 없습니다');
    const count = tx.select().from(statusEvents).where(eq(statusEvents.applicationId, ev.applicationId)).all().length;
    if (count <= 1) throw new Error('상태 이력이 하나만 남으면 지울 수 없습니다');
    tx.delete(statusEvents).where(eq(statusEvents.id, eventId)).run();
    syncCurrent(tx, ev.applicationId);
  });
}
