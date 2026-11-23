import { afterAll } from 'vitest';
import { cleanupTmpDirs } from './tmp';

afterAll(() => cleanupTmpDirs());
