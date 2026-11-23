import { beforeAll, describe, expect, test } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTmpDir } from './helpers/tmp';

type Handler = (req: Request, ctx: { params: Promise<{ name: string }> }) => Promise<Response>;
let GET: Handler;

beforeAll(async () => {
  const dir = makeTmpDir('cf-route-');
  mkdirSync(join(dir, 'documents', 'resume'), { recursive: true });
  writeFileSync(join(dir, 'documents', 'resume', '이력서_20260905.pdf'), '%PDF-1.4 fake');
  writeFileSync(join(dir, 'career-flow.db'), 'secret');
  process.env.CAREER_FLOW_DATA_DIR = dir;
  GET = (await import('@/app/api/documents/[name]/route')).GET as unknown as Handler;
});

const call = (name: string) =>
  GET(new Request('http://127.0.0.1:3939/api/documents/x'), { params: Promise.resolve({ name }) });

describe('GET /api/documents/[name] (TC-PAST-30)', () => {
  test('200 pdf inline', async () => {
    const res = await call('이력서_20260905.pdf');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toMatch(/^inline; filename\*=UTF-8''/);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).toBe('%PDF-1.4 fake');
  });
  test('encoded name is accepted too', async () => {
    expect((await call(encodeURIComponent('이력서_20260905.pdf'))).status).toBe(200);
  });
  test('400 for traversal and non-rule names', async () => {
    for (const n of ['..%2F..%2Fcareer-flow.db', '이력서_20260905.pdf%00.txt', 'career-flow.db', '../career-flow.db']) {
      expect((await call(n)).status, n).toBe(400);
    }
  });
  test('404 for missing file', async () => {
    expect((await call('이력서_20260101.pdf')).status).toBe(404);
  });
});
