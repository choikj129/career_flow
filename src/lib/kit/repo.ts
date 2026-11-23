import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { desc, eq } from 'drizzle-orm';
import { getDb, type Db } from '@/lib/db/client';
import { config } from '@/lib/config';
import { kits } from '@/lib/db/schema';
import { checkBaseDoc, normalizeNewlines, parseMdDoc } from './md-doc';
import { parseGuide } from './parse-guide';
import type { KitError, KitFile, KitParsed, KitRole } from './types';

// 서류 키트 올리기·보관. 파일은 data/kit/<키트 id>/ 아래에 두고 앱은 그 밖을 읽지 않는다(D-27 a).

export const KIT_MAX_MD = 10;
export const KIT_MAX_FILE_BYTES = 1024 * 1024;
export const KIT_MAX_TOTAL_BYTES = 5 * 1024 * 1024;

export type KitRow = {
  id: number;
  label: string;
  files: KitFile[];
  parsed: KitParsed | null;
  errors: KitError[];
  createdAt: string;
};

/** 경로 부분과 제어 문자를 버린 파일 이름 */
function safeName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  return base.replace(/[\u0000-\u001f]/g, '').trim();
}

/** build_pdf.py 같은 파일에서 `CSS = """…"""` 문자열만 글자로 꺼낸다. 실행하지 않는다. */
function cssFromPython(text: string): string | null {
  const m = /\bCSS\s*=\s*(?:r?"""([\s\S]*?)"""|r?'''([\s\S]*?)''')/.exec(text);
  return m ? (m[1] ?? m[2]).trim() : null;
}

type Incoming = { name: string; data: Buffer };

const FORBIDDEN_NAME_CHARS = /[<>:"|?*]/;
const RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Windows에서 파일로 만들 수 없는 이름이면 이유를 돌려준다. */
function badFileName(name: string): string | null {
  if (FORBIDDEN_NAME_CHARS.test(name)) return '파일 이름에 쓸 수 없는 글자(< > : " | ? *)가 있습니다';
  if (/[. ]$/.test(name)) return '파일 이름이 점이나 공백으로 끝날 수 없습니다';
  if (RESERVED_NAME.test(name.split('.')[0])) return 'Windows가 예약한 파일 이름입니다';
  return null;
}

export function saveKit(
  files: Incoming[],
  db: Db = getDb(),
  dir: string = config.kitDir,
): { kitId: number; errors: KitError[] } {
  const named = files.map((f) => ({ name: safeName(f.name), data: f.data })).filter((f) => f.name);
  const seen = new Set<string>();
  for (const f of named) {
    const why = badFileName(f.name);
    if (why) throw new Error(`${f.name}: ${why}`);
    const key = f.name.toLowerCase();
    if (seen.has(key)) throw new Error(`같은 이름의 파일이 둘 이상입니다: ${f.name}`);
    seen.add(key);
  }
  const mdFiles = named.filter((f) => f.name.toLowerCase().endsWith('.md'));
  if (mdFiles.length > KIT_MAX_MD) throw new Error(`마크다운 파일은 최대 ${KIT_MAX_MD}개까지 올릴 수 있습니다`);
  for (const f of named) {
    if (f.data.length > KIT_MAX_FILE_BYTES) throw new Error(`${f.name}: 파일당 1MB까지 올릴 수 있습니다`);
  }
  if (named.reduce((n, f) => n + f.data.length, 0) > KIT_MAX_TOTAL_BYTES) throw new Error('합계 5MB까지 올릴 수 있습니다');

  const errors: KitError[] = [];
  const text = (f: Incoming) => normalizeNewlines(f.data.toString('utf8'));
  const roles = new Map<string, { role: KitRole; track?: string }>();

  // 스타일: .css 또는 .py의 CSS 문자열 하나
  let styleCss: string | null = null;
  const styles = named.filter((f) => /\.(css|py)$/i.test(f.name));
  if (styles.length > 1) errors.push({ file: styles[1].name, where: '스타일', message: '스타일 파일은 1개만 올릴 수 있습니다' });
  if (styles[0]) {
    const s = styles[0];
    styleCss = /\.css$/i.test(s.name) ? text(s) : cssFromPython(text(s));
    if (styleCss == null) errors.push({ file: s.name, where: '스타일', message: '`CSS = """…"""` 문자열을 찾을 수 없습니다' });
    else roles.set(s.name, { role: 'style' });
  }
  for (const f of named) {
    if (!/\.(md|css|py)$/i.test(f.name)) errors.push({ file: f.name, where: '파일', message: '이 파일이 어디에 쓰이는지 모릅니다(.md, .css, .py만 올릴 수 있습니다)' });
  }

  // 역할: 가이드, 작성 규칙, 마스터스토리
  // 조건을 앞에서부터 하나씩 써 보고, 맞는 파일이 있는 첫 조건의 결과를 쓴다(이름으로 찾기 → 내용으로 찾기)
  const pick = (role: KitRole, matchers: Array<(f: Incoming) => boolean>, label: string) => {
    let hits: Incoming[] = [];
    for (const match of matchers) {
      hits = mdFiles.filter((f) => !roles.has(f.name) && match(f));
      if (hits.length) break;
    }
    if (hits.length === 0) errors.push({ file: '(없음)', where: label, message: `${label} 파일이 없습니다` });
    else {
      roles.set(hits[0].name, { role });
      for (const extra of hits.slice(1)) errors.push({ file: extra.name, where: label, message: `${label} 파일이 둘 이상입니다` });
    }
    return hits[0];
  };
  // 작성 규칙이 가이드 구획 이름을 언급할 수 있어서, 이름에 "가이드"가 든 파일을 먼저 찾는다
  const guideFile = pick(
    'guide',
    [(f) => f.name.includes('가이드'), (f) => text(f).includes('번호표') && text(f).includes('자기소개 후보')],
    '가이드',
  );
  pick('rules', [(f) => f.name.includes('규칙') || /rules/i.test(f.name)], '작성 규칙');
  pick('master', [(f) => f.name.includes('마스터') || /master/i.test(f.name)], '마스터스토리');

  // 가이드를 읽고 기본 서류를 짝짓는다
  let parsed: KitParsed | null = null;
  if (guideFile) {
    const { guide, errors: ge } = parseGuide(text(guideFile));
    errors.push(...ge.map((e) => ({ ...e, file: guideFile.name })));
    if (guide) {
      parsed = { ...guide, styleCss };
      for (const t of guide.tracks) {
        for (const kind of ['resume', 'career'] as const) {
          const name = kind === 'resume' ? t.resumeFile : t.careerFile;
          const f = mdFiles.find((x) => x.name === name);
          if (!f) {
            errors.push({ file: name, where: `기본 서류(${t.name})`, message: `가이드의 "기본 서류" 표에 적힌 파일 "${name}"이 올라오지 않았습니다` });
            continue;
          }
          roles.set(f.name, { role: kind, track: t.name });
          errors.push(...checkBaseDoc(parseMdDoc(text(f)), t, kind));
        }
      }
    }
  }
  for (const f of mdFiles) {
    if (!roles.has(f.name)) errors.push({ file: f.name, where: '파일', message: '이 파일이 어디에 쓰이는지 모릅니다' });
  }

  const label = (() => {
    for (const f of mdFiles) {
      const m = /_(v\d+_\d{8})/.exec(f.name);
      if (m && roles.get(f.name)?.role === 'resume') return m[1];
    }
    return null;
  })();

  // 역할이 있는 파일만 목록에 둔다(역할 없는 파일은 오류로 화면에 보이고, 이름을 고쳐 다시 올린다). 원본은 모두 폴더에 둔다.
  const stored: KitFile[] = named
    .filter((f) => roles.has(f.name))
    .map((f) => ({ ...roles.get(f.name)!, name: f.name, sha256: createHash('sha256').update(f.data).digest('hex'), bytes: f.data.length }));

  // 키트 번호가 폴더 이름이라 행을 먼저 만들되, 파일 쓰기가 실패하면 행을 되돌리고 만든 폴더도 지운다.
  const kitRoot = (n: number) => join(dir, String(n));
  let id = 0;
  try {
    id = db.transaction((tx) => {
      const newId = tx
        .insert(kits)
        .values({ label: label ?? '키트', files: stored, parsed, errors, createdAt: new Date().toISOString() })
        .returning({ id: kits.id })
        .get().id;
      if (!label) tx.update(kits).set({ label: `키트 ${newId}` }).where(eq(kits.id, newId)).run();
      mkdirSync(kitRoot(newId), { recursive: true });
      for (const f of named) writeFileSync(join(kitRoot(newId), f.name), f.data);
      return newId;
    });
  } catch (e) {
    const last = db.select({ id: kits.id }).from(kits).orderBy(desc(kits.id)).limit(1).get()?.id ?? 0;
    rmSync(kitRoot(last + 1), { recursive: true, force: true }); // 되돌려진 행 번호의 폴더
    throw e;
  }
  return { kitId: id, errors };
}

/**
 * 올릴 파일이 가장 최근 키트와 같은지(파일 이름과 내용이 모두 같다). 같으면 새 버전을 만들지 않는다(화면 문서 5.6).
 * 가장 최근 키트에 없는 파일이 하나라도 있거나 빠진 파일이 있으면 다르다.
 */
export function isSameAsLatestKit(files: Incoming[], db: Db = getDb()): boolean {
  const latest = getLatestKit(db);
  if (!latest) return false;
  const incoming = new Map(
    files
      .map((f) => ({ name: safeName(f.name), data: f.data }))
      .filter((f) => f.name)
      .map((f) => [f.name, createHash('sha256').update(f.data).digest('hex')] as const),
  );
  if (incoming.size !== latest.files.length) return false;
  return latest.files.every((f) => incoming.get(f.name) === f.sha256);
}

export function getKit(id: number, db: Db = getDb()): KitRow | null {
  return db.select().from(kits).where(eq(kits.id, id)).get() ?? null;
}

/** 가장 최근 키트(오류가 있어도). 화면에 오류를 보이려고 쓴다. */
export function getLatestKit(db: Db = getDb()): KitRow | null {
  return db.select().from(kits).orderBy(desc(kits.id)).limit(1).get() ?? null;
}

/** 키트 기록(최신순): 화면의 "키트 기록"이 쓴다. 파일 목록·읽은 내용은 읽지 않는다 */
export function listKitSummaries(db: Db = getDb()): { id: number; label: string; createdAt: string; errorCount: number }[] {
  return db
    .select({ id: kits.id, label: kits.label, createdAt: kits.createdAt, errors: kits.errors })
    .from(kits)
    .orderBy(desc(kits.id))
    .all()
    .map((k) => ({ id: k.id, label: k.label, createdAt: k.createdAt, errorCount: k.errors.length }));
}

/** 오류 없이 읽힌 가장 최근 키트. 맞춤 이력서는 이 키트로만 만든다. */
export function getUsableKit(db: Db = getDb()): (KitRow & { parsed: KitParsed }) | null {
  const rows = db.select().from(kits).orderBy(desc(kits.id)).all();
  const hit = rows.find((k) => k.parsed != null && k.errors.length === 0);
  return hit ? (hit as KitRow & { parsed: KitParsed }) : null;
}

function readKitFile(kitId: number, name: string, dir: string): string {
  return normalizeNewlines(readFileSync(join(dir, String(kitId), name), 'utf8'));
}

/** 기본 서류 md 원문 */
export function readKitDoc(
  kitId: number,
  track: string,
  doc: 'resume' | 'career',
  db: Db = getDb(),
  dir: string = config.kitDir,
): string {
  const kit = getKit(kitId, db);
  const f = kit?.files.find((x) => x.role === doc && x.track === track);
  if (!kit || !f) throw new Error(`키트에 ${track} ${doc === 'resume' ? '이력서' : '경력기술서'}가 없습니다`);
  return readKitFile(kitId, f.name, dir);
}

export function readKitText(
  kitId: number,
  role: 'guide' | 'rules' | 'master',
  db: Db = getDb(),
  dir: string = config.kitDir,
): string {
  const kit = getKit(kitId, db);
  const f = kit?.files.find((x) => x.role === role);
  if (!kit || !f) throw new Error('키트에 그 파일이 없습니다');
  return readKitFile(kitId, f.name, dir);
}
