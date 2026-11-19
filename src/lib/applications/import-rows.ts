import { z } from 'zod';
import { validDate } from '@/lib/domain/dates';
import { DOC_KINDS, isDocsForKind, type DocKind, type SubmittedDocs } from '@/lib/documents/files';
import { APPLICATION_STATUSES, SITE_IDS, type ApplicationStatus, type SiteId } from '@/lib/domain/types';

// 클라이언트 컴포넌트에서도 쓴다. DB·파일에 닿는 모듈을 import하지 않는다.

export type ReviewRow = {
  companyName: string;
  positionTitle: string;
  site: SiteId;
  siteNote: string;
  appliedAt: string;
  status: ApplicationStatus;
  notes: string;
  docs: Record<DocKind, string | null>;
};
export type CheckedRow = ReviewRow & { checked: boolean };
export type RowField = 'companyName' | 'positionTitle' | 'appliedAt';

/** 비어 있거나 잘못된 필수 칸. 출처 이름(기타)은 선택이다. */
export function missingFields(r: ReviewRow): RowField[] {
  const out: RowField[] = [];
  if (!r.companyName.trim()) out.push('companyName');
  if (!r.positionTitle.trim()) out.push('positionTitle');
  if (!validDate(r.appliedAt)) out.push('appliedAt');
  return out;
}

export function emptyRow(site: SiteId = 'other', appliedAt = ''): ReviewRow {
  return { companyName: '', positionTitle: '', site, siteNote: '', appliedAt, status: 'applied', notes: '', docs: { resume: null, career: null, portfolio: null } };
}

/** 체크된 행만 등록용으로 바꾼다. 빈 칸이 있으면 던진다. */
export function rowsToRegister(rows: CheckedRow[]) {
  return rows
    .filter((r) => r.checked)
    .map((r) => {
      if (missingFields(r).length) throw new Error('비어 있는 칸을 채워 주세요.');
      const notes = r.notes.trim();
      const submittedDocs: SubmittedDocs | undefined = DOC_KINDS.some((k) => r.docs[k])
        ? { resume: r.docs.resume, career: r.docs.career, portfolio: r.docs.portfolio }
        : undefined;
      return {
        companyName: r.companyName.trim(),
        positionTitle: r.positionTitle.trim(),
        site: r.site,
        siteNote: r.site === 'other' && r.siteNote.trim() ? r.siteNote.trim() : undefined,
        appliedAt: r.appliedAt.trim(),
        status: r.status,
        ...(notes ? { notes } : {}),
        ...(submittedDocs ? { submittedDocs } : {}),
      };
    });
}

export const MAX_IMPORT_ROWS = 500;

/** 서버 액션 입력 검증. site·status 는 enum, 날짜는 실제 있는 날짜, 문자열은 길이 제한. */
export const checkedRowsSchema = z
  .array(
    z.object({
      companyName: z.string().max(200),
      positionTitle: z.string().max(200),
      site: z.enum(SITE_IDS as [SiteId, ...SiteId[]]),
      siteNote: z.string().max(100),
      appliedAt: z.string().max(10),
      status: z.enum(APPLICATION_STATUSES as [ApplicationStatus, ...ApplicationStatus[]]),
      notes: z.string().max(2000),
      docs: z.object({
        resume: z.string().max(40).nullable(),
        career: z.string().max(40).nullable(),
        portfolio: z.string().max(40).nullable(),
      }),
      checked: z.boolean(),
    })
      // 체크하지 않은 행은 빈 칸이어도 되므로 날짜는 체크된 행만 검사한다.
      .refine((r) => !r.checked || validDate(r.appliedAt), { path: ['appliedAt'], message: '날짜 형식이 올바르지 않습니다' })
      .refine((r) => DOC_KINDS.every((k) => r.docs[k] == null || isDocsForKind(k, r.docs[k]!)), {
        path: ['docs'],
        message: '서류 파일 이름이 올바르지 않습니다',
      }),
  )
  .max(MAX_IMPORT_ROWS);

/** "이미 있음" 판단용. 날짜는 입력 중일 수 있어 형식만 느슨하게 보고(길이 제한), 잘못된 날짜는 "없음"으로 처리된다. */
export const existingRowsSchema = z
  .array(z.object({ companyName: z.string().max(200), appliedAt: z.string().max(10) }))
  .max(MAX_IMPORT_ROWS);

/** 직접 입력 검토 표의 "이미 있음" 판단용(포지션까지 본다). */
export const existingMatchRowsSchema = z
  .array(z.object({ companyName: z.string().max(200), positionTitle: z.string().max(200), appliedAt: z.string().max(10) }))
  .max(MAX_IMPORT_ROWS);
