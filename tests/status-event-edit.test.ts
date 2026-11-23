import { expect, test } from 'vitest';
import { makeTestDb } from './helpers/db';
import { applications } from '@/lib/db/schema';
import { saveResumeVersion } from '@/lib/resume/repo';
import { emptyResume } from '@/lib/resume/schema';
import { bulkCreateApplications, changeStatus, getApplication, listReachedHistory, listStatusEvents } from '@/lib/applications/repo';
import { sortEventsAscending } from '@/lib/applications/event-order';
import { deleteStatusEvent, updateStatusEvent } from '@/lib/applications/events';

function setup() {
  const db = makeTestDb();
  saveResumeVersion(emptyResume(), undefined, db);
  bulkCreateApplications(
    [{ companyName: '가상컴퍼니', positionTitle: '서버', site: 'wanted', appliedAt: '2026-11-01', status: 'applied' }] as never,
    db,
  );
  return db;
}
const appId = (db: ReturnType<typeof makeTestDb>) => db.select().from(applications).get()!.id;

test('수정: 날짜·메모·상태를 고치고 현재 상태는 가장 늦은 이력으로 맞춘다', () => {
  const db = setup();
  const id = appId(db);
  changeStatus(id, 'rejected', { at: '2026-11-19', note: '일괄 불합격 처리' }, db);
  const [, rej] = listStatusEvents(id, db);
  updateStatusEvent(rej.id, { status: 'rejected', at: '2026-11-10', note: '서류 탈락' }, db);
  const evs = listStatusEvents(id, db);
  expect(evs[1]).toMatchObject({ at: '2026-11-10', note: '서류 탈락', status: 'rejected' });
  expect(getApplication(id, db)!.status).toBe('rejected');
});

test('수정으로 상태를 바꾸면 현재 상태가 따라가고, 면접은 차수가 필요하다', () => {
  const db = setup();
  const id = appId(db);
  changeStatus(id, 'rejected', { at: '2026-11-19' }, db);
  const [, rej] = listStatusEvents(id, db);
  expect(() => updateStatusEvent(rej.id, { status: 'interview', at: '2026-11-19' }, db)).toThrow('차수');
  updateStatusEvent(rej.id, { status: 'interview', interviewRound: 2, at: '2026-11-19' }, db);
  const a = getApplication(id, db)!;
  expect(a.status).toBe('interview');
  expect(a.interviewRound).toBe(2);
  expect(listReachedHistory(db).get(id)).toContain('interview');
});

test('날짜를 앞당기면 더 늦은 항목이 현재 상태가 된다(같은 날이면 나중에 넣은 것)', () => {
  const db = setup();
  const id = appId(db);
  changeStatus(id, 'document_passed', { at: '2026-11-05' }, db);
  changeStatus(id, 'rejected', { at: '2026-11-05' }, db);
  expect(getApplication(id, db)!.status).toBe('rejected'); // 같은 날: id 큰 쪽
  const evs = listStatusEvents(id, db);
  updateStatusEvent(evs[2].id, { status: 'rejected', at: '2026-11-03' }, db);
  expect(getApplication(id, db)!.status).toBe('document_passed');
});

test('삭제: 현재 상태가 남은 이력으로 돌아가고 서류합격 이력도 사라진다. 하나 남으면 삭제 불가', () => {
  const db = setup();
  const id = appId(db);
  changeStatus(id, 'document_passed', { at: '2026-11-05' }, db);
  changeStatus(id, 'rejected', { at: '2026-11-06' }, db);
  let evs = listStatusEvents(id, db);
  deleteStatusEvent(evs[2].id, db);
  expect(getApplication(id, db)!.status).toBe('document_passed');
  evs = listStatusEvents(id, db);
  deleteStatusEvent(evs[1].id, db);
  expect(getApplication(id, db)!.status).toBe('applied');
  expect(listReachedHistory(db).get(id)).toBeUndefined();
  expect(() => deleteStatusEvent(listStatusEvents(id, db)[0].id, db)).toThrow('하나');
});

test('없는 항목은 오류', () => {
  const db = setup();
  expect(() => updateStatusEvent(999, { status: 'applied', at: '2026-11-01' }, db)).toThrow('찾을 수 없');
  expect(() => deleteStatusEvent(999, db)).toThrow('찾을 수 없');
});

test('가져온 기록(처음 이력이 지금 시각)도 나중에 넣은 이력을 고친 뒤 뒤집히지 않는다', () => {
  const db = makeTestDb();
  saveResumeVersion(emptyResume(), undefined, db);
  bulkCreateApplications(
    [{ companyName: '가상둘', positionTitle: '서버', site: 'wanted', appliedAt: '2026-01-10', status: 'document_passed' }] as never,
    db,
  );
  const id = appId(db);
  changeStatus(id, 'rejected', { at: '2026-11-19', note: '일괄' }, db);
  const [, rej] = listStatusEvents(id, db);
  updateStatusEvent(rej.id, { status: 'rejected', at: '2026-03-05', note: '수정' }, db);
  expect(getApplication(id, db)!.status).toBe('rejected');
});

test('정렬: 날짜를 고친 뒤에도 실효 날짜순(자동 첫 이력은 지원일), 같은 날은 id순', () => {
  const db = setup();
  const id = appId(db);
  changeStatus(id, 'document_passed', { at: '2026-11-23' }, db);
  changeStatus(id, 'rejected', { at: '2026-11-23' }, db);
  const evs = listStatusEvents(id, db);
  updateStatusEvent(evs[2].id, { status: 'rejected', at: '2026-11-05' }, db);
  const sorted = sortEventsAscending(listStatusEvents(id, db), '2026-11-01');
  expect(sorted.map((e) => e.status)).toEqual(['applied', 'rejected', 'document_passed']);
  expect(sorted.map((e) => e.id)).toEqual([evs[0].id, evs[2].id, evs[1].id]);
});
