import { makeTmpDir } from './helpers/tmp';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';

const DIR = join(process.cwd(), 'tests', 'fixtures', 'kit');

describe('POST /api/kit (TC-KIT-09)', () => {
  let post: (req: Request) => Promise<Response>;
  let latestKitId: () => number | null;

  beforeAll(async () => {
    process.env.CAREER_FLOW_DATA_DIR = makeTmpDir('cf-kit-route-');
    const { getDb, runMigrations } = await import('@/lib/db/client');
    runMigrations(getDb());
    const { getLatestKit } = await import('@/lib/kit/repo');
    latestKitId = () => getLatestKit()?.id ?? null;
    post = (await import('@/app/api/kit/route')).POST as never;
  });

  const request = (files: { name: string; data: Buffer | string }[], headers: Record<string, string> = {}) => {
    const form = new FormData();
    for (const f of files) form.append('files', new File([new Uint8Array(typeof f.data === 'string' ? Buffer.from(f.data) : f.data)], f.name));
    return new Request('http://127.0.0.1:3939/api/kit', { method: 'POST', body: form, headers: { host: '127.0.0.1:3939', ...headers } });
  };
  const fixtures = () => readdirSync(DIR).map((name) => ({ name, data: readFileSync(join(DIR, name)) }));

  test('rejects an empty upload and a request from another origin', async () => {
    const empty = await post(new Request('http://127.0.0.1:3939/api/kit', { method: 'POST', body: new FormData(), headers: { host: '127.0.0.1:3939' } }));
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({ ok: false, error: '올릴 파일을 고르세요' });
    const cross = await post(request(fixtures(), { origin: 'http://evil.example' }));
    expect(cross.status).toBe(403);
    expect(latestKitId()).toBeNull();
  });

  test('saves a new kit, then says nothing changed for the same files, then saves again after a change', async () => {
    const first = await post(request(fixtures(), { origin: 'http://127.0.0.1:3939' }));
    expect(first.status).toBe(200);
    const a = (await first.json()) as { ok: true; unchanged: boolean; kitId: number; errorCount: number };
    expect(a).toMatchObject({ ok: true, unchanged: false, errorCount: 0 });
    expect(latestKitId()).toBe(a.kitId);

    const again = (await (await post(request(fixtures()))).json()) as { unchanged: boolean };
    expect(again.unchanged).toBe(true);
    expect(latestKitId()).toBe(a.kitId);

    const changed = fixtures().map((f) => (f.name === '마스터스토리.md' ? { ...f, data: Buffer.concat([f.data, Buffer.from('\n추가')]) } : f));
    const b = (await (await post(request(changed))).json()) as { unchanged: boolean; kitId: number };
    expect(b.unchanged).toBe(false);
    expect(b.kitId).toBeGreaterThan(a.kitId);
  });

  test('reports the count of read errors and the Korean limit message', async () => {
    const bad = await post(request([{ name: '가이드.md', data: '# 아무것도 없음' }]));
    const body = (await bad.json()) as { ok: true; errorCount: number };
    expect(body.ok).toBe(true);
    expect(body.errorCount).toBeGreaterThan(0);

    const tooMany = await post(request(Array.from({ length: 11 }, (_, i) => ({ name: `파일${i}.md`, data: 'x' }))));
    expect(tooMany.status).toBe(400);
    expect(((await tooMany.json()) as { error: string }).error).toContain('10개');
  });
});

describe('POST /api/kit size guard (TC-KIT-09b)', () => {
  test('a declared body far over the limit is refused with 413 before reading it', async () => {
    process.env.CAREER_FLOW_DATA_DIR = makeTmpDir('cf-kit-route2-');
    const { POST } = await import('@/app/api/kit/route');
    const res = await POST(new Request('http://127.0.0.1:3939/api/kit', { method: 'POST', body: new FormData(), headers: { host: '127.0.0.1:3939', 'content-length': String(20 * 1024 * 1024) } }));
    expect(res.status).toBe(413);
  });
});
