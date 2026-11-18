import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type AppName = 'seeded' | 'empty';
export const PORTS: Record<AppName, number> = { seeded: 3940, empty: 3941 };
export const FIXTURE_PORT = 3942;
export const FIXTURE_ORIGIN = `http://127.0.0.1:${FIXTURE_PORT}`;

/** 실행기(start-app.mjs)와 테스트가 같은 임시 폴더를 쓴다. */
export function appRoot(name: AppName): string {
  return join(tmpdir(), 'career-flow-e2e', name);
}
export const dataDir = (name: AppName) => join(appRoot(name), `data-e2e-${name}`);
export const controlFile = (name: AppName) => join(appRoot(name), 'fake-control.json');
export const logFile = (name: AppName) => join(appRoot(name), 'fake-calls.log');
