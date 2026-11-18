"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { checkExistingAction, commitApplicationImportAction } from "@/app/_actions/import";
import { useAction } from "@/app/_components/useAction";
import {
  emptyRow,
  missingFields,
  type CheckedRow,
  type RowField,
} from "@/lib/applications/import-rows";
import {
  APPLICATION_STATUSES,
  SITE_IDS,
  SITE_LABELS,
  STATUS_LABELS,
  type ApplicationStatus,
  type SiteId,
} from "@/lib/domain/types";

type Row = CheckedRow & { key: number; existing: boolean };

const FIELD_NAME: Record<RowField, string> = { companyName: "회사명", positionTitle: "포지션", appliedAt: "지원일(YYYY-MM-DD)" };

/** 검토 단계: 고치고, 지울 행을 빼고, 체크한 행만 등록한다. docs/spec/screens.md 6.2 */
export function ImportReviewTable({
  initialRows,
  initialExisting,
}: {
  initialRows: CheckedRow[];
  initialExisting: boolean[];
}) {
  const router = useRouter();
  const nextKey = useRef(initialRows.length);
  const [rows, setRows] = useState<Row[]>(() =>
    initialRows.map((r, i) => ({ ...r, key: i, existing: initialExisting[i] ?? false })),
  );
  const { pending, error, run } = useAction();

  const patch = (key: number, p: Partial<Row>) => setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...p } : r)));

  /** 회사·지원일을 고친 뒤 "이미 있음"을 다시 판단한다. */
  async function recheck(key: number) {
    const r = rows.find((x) => x.key === key);
    if (!r) return;
    const [hit] = await checkExistingAction([{ companyName: r.companyName, appliedAt: r.appliedAt }]);
    setRows((cur) =>
      cur.map((x) =>
        x.key === key ? { ...x, existing: hit, checked: hit && x.existing !== hit ? false : x.checked } : x,
      ),
    );
  }

  const checked = rows.filter((r) => r.checked);
  const blocked = checked.some((r) => missingFields(r).length > 0);
  const total = rows.length;

  function commit() {
    run(() => commitApplicationImportAction(rows.map(({ key: _k, existing: _e, ...r }) => r)));
  }

  return (
    <div className="card" style={{ marginTop: 16, padding: "18px 20px" }}>
      <div className="toolbar">
        <span>
          <b>{total}건을 찾았습니다.</b>{" "}
          <span className="muted">틀린 값을 고치고 등록할 행을 고르세요. 이미 있는 기록은 체크가 해제되어 있습니다.</span>
        </span>
        <button type="button" className="btn quiet" onClick={() => router.push("/import")}>
          처음부터
        </button>
      </div>

      <table className="review" style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th />
            <th>회사</th>
            <th>포지션</th>
            <th>사이트</th>
            <th>지원일</th>
            <th>상태</th>
            <th />
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const missing = missingFields(r);
            const need = (f: RowField) => (missing.includes(f) ? " need" : "");
            return (
              <tr key={r.key} className={r.existing ? "dupe" : undefined}>
                <td>
                  <input type="checkbox" aria-label="등록할 행" checked={r.checked} onChange={(e) => patch(r.key, { checked: e.target.checked })} />
                </td>
                <td>
                  <input
                    className={`in${need("companyName")}`}
                    aria-label="회사"
                    placeholder="회사명"
                    value={r.companyName}
                    onChange={(e) => patch(r.key, { companyName: e.target.value })}
                    onBlur={() => void recheck(r.key)}
                  />
                </td>
                <td>
                  <input
                    className={`in${need("positionTitle")}`}
                    aria-label="포지션"
                    placeholder="포지션"
                    value={r.positionTitle}
                    onChange={(e) => patch(r.key, { positionTitle: e.target.value })}
                  />
                </td>
                <td>
                  <select className="in" aria-label="사이트" value={r.site} onChange={(e) => patch(r.key, { site: e.target.value as SiteId })}>
                    {SITE_IDS.map((s) => (
                      <option key={s} value={s}>
                        {SITE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  {r.site === "other" && (
                    <input
                      className="in"
                      style={{ marginTop: 4 }}
                      aria-label="출처 이름"
                      placeholder="출처 이름(선택)"
                      value={r.siteNote}
                      onChange={(e) => patch(r.key, { siteNote: e.target.value })}
                    />
                  )}
                </td>
                <td>
                  <input
                    className={`in${need("appliedAt")}`}
                    aria-label="지원일"
                    placeholder="2026-10-03"
                    value={r.appliedAt}
                    onChange={(e) => patch(r.key, { appliedAt: e.target.value })}
                    onBlur={() => void recheck(r.key)}
                  />
                </td>
                <td>
                  <select className="in" aria-label="상태" value={r.status} onChange={(e) => patch(r.key, { status: e.target.value as ApplicationStatus })}>
                    {APPLICATION_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  {r.existing ? (
                    <span className="flag">이미 있음</span>
                  ) : missing.length > 0 ? (
                    <span className="flag need">{FIELD_NAME[missing[0]]} 필요</span>
                  ) : null}
                </td>
                <td>
                  <button type="button" className="icon-btn" aria-label="행 삭제" onClick={() => setRows((cur) => cur.filter((x) => x.key !== r.key))}>
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <p className="muted" style={{ marginTop: 12 }}>행이 없습니다. 아래에서 추가하거나 처음부터 다시 하세요.</p>}

      <div className="toolbar" style={{ marginTop: 14 }}>
        <button
          type="button"
          className="btn sm"
          onClick={() =>
            setRows((cur) => [
              ...cur,
              { ...emptyRow(cur.at(-1)?.site ?? "other"), checked: true, key: nextKey.current++, existing: false },
            ])
          }
        >
          + 행 추가
        </button>
        <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {blocked && <span className="muted small">빈 칸을 채워야 등록할 수 있습니다</span>}
          <button type="button" className="btn primary" disabled={pending || blocked || checked.length === 0} onClick={commit}>
            {checked.length}건 등록
          </button>
        </span>
      </div>
      {error ? <p className="field-err">{error}</p> : null}
    </div>
  );
}
