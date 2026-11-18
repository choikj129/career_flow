import { describe, expect, test } from 'vitest';
import { getModelFor, getSetting, setModelFor, setSetting } from '@/lib/settings';
import { makeTestDb } from './helpers/db';

describe('settings key-value', () => {
  test('get returns undefined then the saved value, and overwrites', () => {
    const db = makeTestDb();
    expect(getSetting('x', db)).toBeUndefined();
    setSetting('x', '1', db);
    setSetting('x', '2', db);
    expect(getSetting('x', db)).toBe('2');
  });
  test('model per job type defaults and can change', () => {
    const db = makeTestDb();
    expect(getModelFor('import_resume', db)).toBe('sonnet');
    setModelFor('import_resume', 'haiku', db);
    expect(getModelFor('import_resume', db)).toBe('haiku');
  });
});
