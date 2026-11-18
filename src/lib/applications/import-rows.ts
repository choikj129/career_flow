import type { ApplicationStatus, SiteId } from '@/lib/domain/types';

// 클라이언트 컴포넌트에서도 쓴다. DB·파일에 닿는 모듈을 import하지 않는다.

export type ReviewRow = {
  companyName: string;
  positionTitle: string;
  site: SiteId;
  siteNote: string;
  appliedAt: string;
  status: ApplicationStatus;
};
export type CheckedRow = ReviewRow & { checked: boolean };
export type RowField = 'companyName' | 'positionTitle' | 'appliedAt';

function validDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** 비어 있거나 잘못된 필수 칸. 출처 이름(기타)은 선택이다. */
export function missingFields(r: ReviewRow): RowField[] {
  const out: RowField[] = [];
  if (!r.companyName.trim()) out.push('companyName');
  if (!r.positionTitle.trim()) out.push('positionTitle');
  if (!validDate(r.appliedAt)) out.push('appliedAt');
  return out;
}

export function emptyRow(site: SiteId = 'other', appliedAt = ''): ReviewRow {
  return { companyName: '', positionTitle: '', site, siteNote: '', appliedAt, status: 'applied' };
}

/** 체크된 행만 등록용으로 바꾼다. 빈 칸이 있으면 던진다. */
export function rowsToRegister(rows: CheckedRow[]) {
  return rows
    .filter((r) => r.checked)
    .map((r) => {
      if (missingFields(r).length) throw new Error('비어 있는 칸을 채워 주세요.');
      return {
        companyName: r.companyName.trim(),
        positionTitle: r.positionTitle.trim(),
        site: r.site,
        siteNote: r.site === 'other' && r.siteNote.trim() ? r.siteNote.trim() : undefined,
        appliedAt: r.appliedAt.trim(),
        status: r.status,
      };
    });
}
