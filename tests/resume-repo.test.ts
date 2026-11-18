import { expect, test } from 'vitest';
import { makeTestDb } from './helpers/db';
import { emptyResume, defaultPreferences } from '@/lib/resume/schema';
import {
  saveResumeVersion,
  getLatestResume,
  listResumeVersions,
  getResumeVersion,
  getPreferences,
  savePreferences,
} from '@/lib/resume/repo';

test('saveResumeVersion increments versionNo and getLatestResume returns newest', () => {
  const db = makeTestDb();
  const a = saveResumeVersion({ ...emptyResume(), summary: 'v1' }, 'import', db);
  const b = saveResumeVersion({ ...emptyResume(), summary: 'v2' }, undefined, db);
  expect([a.versionNo, b.versionNo]).toEqual([1, 2]);
  expect(getLatestResume(db)!.content.summary).toBe('v2');
});

test('saveResumeVersion rejects invalid content', () => {
  expect(() => saveResumeVersion({ summary: 1 } as any, undefined, makeTestDb())).toThrow();
});

test('getLatestResume is null when empty; list is newest first; get by id', () => {
  const db = makeTestDb();
  expect(getLatestResume(db)).toBeNull();
  const a = saveResumeVersion(emptyResume(), 'first', db);
  saveResumeVersion(emptyResume(), undefined, db);
  const list = listResumeVersions(db);
  expect(list.map((v) => v.versionNo)).toEqual([2, 1]);
  expect(list[1].sourceNote).toBe('first');
  expect(getResumeVersion(a.id, db)!.versionNo).toBe(1);
  expect(getResumeVersion(999, db)).toBeNull();
});

test('getPreferences returns defaults then saved value', () => {
  const db = makeTestDb();
  expect(getPreferences(db).workStyle).toBe('any');
  savePreferences({ ...defaultPreferences(), locations: ['서울'] }, db);
  expect(getPreferences(db).locations).toEqual(['서울']);
  savePreferences({ ...defaultPreferences(), locations: ['부산'] }, db);
  expect(getPreferences(db).locations).toEqual(['부산']);
});

test('savePreferences rejects invalid workStyle', () => {
  expect(() => savePreferences({ ...defaultPreferences(), workStyle: 'x' } as any, makeTestDb())).toThrow();
});
