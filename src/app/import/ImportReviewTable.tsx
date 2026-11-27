"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { checkExistingAction, checkExistingMatchesAction, commitApplicationImportAction } from "@/app/_actions/import";
import { useAction } from "@/app/_components/useAction";
import {
  emptyRow,
  missingFields,
  type CheckedRow,
  type RowField,
} from "@/lib/applications/import-rows";
import { validDate } from "@/lib/domain/dates";
import { DOC_KINDS, DOC_KIND_LABELS, DOC_NONE, canBeNone, pickDocs, type DocFile, type DocKind } from "@/lib/documents/files";
import { DateInput } from "@/app/_components/DateInput";
import {
  APPLICATION_STATUSES,
  SITE_IDS,
  SITE_LABELS,
  STATUS_LABELS,
  type ApplicationStatus,
  type SiteId,
} from "@/lib/domain/types";

/** 길면 줄바꿈되며 높이가 늘어나는 한 줄 입력(회사·포지션). 줄바꿈 키는 막는다. */
function AutoText({
  value,
  onChange,
  onBlur,
  className,
  label,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  className: string;
  label: string;
  placeholder: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      className={`${className} autotext`}
      aria-label={label}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\r?\n/g, " "))}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.preventDefault();
      }}
      onBlur={onBlur}
    />
  );
}

type Row = CheckedRow & {
  key: number;
  existing: boolean;
  /** 같은 회사·같은 날 기록은 있지만 포지션이 다름(체크 유지) */
  sameDay: boolean;
  /** 사용자가 직접 고른 서류 칸(날짜를 바꿔도 다시 고르지 않는다) */
  touched: Partial<Record<DocKind, boolean>>;
};

const FIELD_NAME: Record<RowField, string> = { companyName: "회사명", positionTitle: "포지션", appliedAt: "지원일" };

/** 검토 단계: 고치고, 지울 행을 빼고, 체크한 행만 등록한다. docs/spec/screens.md 6.2 */
export function ImportReviewTable({
  initialRows,
  initialExisting,
  docFiles,
  manual = false,
}: {
  initialRows: CheckedRow[];
  initialExisting: boolean[];
  docFiles: DocFile[];
  manual?: boolean;
}) {
  const router = useRouter();
  const nextKey = useRef(initialRows.length);
  const [rows, setRows] = useState<Row[]>(() =>
    initialRows.map((r, i) => ({
      ...r,
      docs: validDate(r.appliedAt) ? pickDocs(r.appliedAt, docFiles) : r.docs,
      key: i,
      existing: initialExisting[i] ?? false,
      sameDay: false,
      touched: {},
    })),
  );
  const { pending, error, run } = useAction();

  const patch = (key: number, p: Partial<Row>) => setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...p } : r)));

  /** 지원일을 고치면 직접 고르지 않은 서류 칸을 다시 고른다. */
  function setAppliedAt(key: number, appliedAt: string) {
    setRows((cur) =>
      cur.map((r) => {
        if (r.key !== key) return r;
        if (!validDate(appliedAt)) return { ...r, appliedAt };
        const picked = pickDocs(appliedAt, docFiles);
        const docs = { ...r.docs };
        for (const k of DOC_KINDS) if (!r.touched[k]) docs[k] = picked[k];
        return { ...r, appliedAt, docs };
      }),
    );
  }

  /** 회사·포지션·지원일을 고친 뒤 "이미 있음"을 다시 판단한다. */
  async function recheck(key: number) {
    const r = rows.find((x) => x.key === key);
    if (!r) return;
    let hit: boolean;
    let sameDay = false;
    if (manual) {
      const [m] = await checkExistingMatchesAction([
        { companyName: r.companyName, positionTitle: r.positionTitle, appliedAt: r.appliedAt },
      ]);
      hit = m === "same";
      sameDay = m === "same_day";
    } else {
      [hit] = await checkExistingAction([{ companyName: r.companyName, appliedAt: r.appliedAt }]);
    }
    setRows((cur) =>
      cur.map((x) =>
        x.key === key
          ? { ...x, existing: hit, sameDay, checked: hit && x.existing !== hit ? false : x.checked }
          : x,
      ),
    );
  }

  const checked = rows.filter((r) => r.checked);
  const blocked = checked.some((r) => missingFields(r).length > 0);
  const total = rows.length;

  function commit() {
    run(() => commitApplicationImportAction(rows.map((r) => ({
          companyName: r.companyName,
          positionTitle: r.positionTitle,
          site: r.site,
          siteNote: r.siteNote,
          appliedAt: r.appliedAt,
          status: r.status,
          notes: r.notes,
          docs: r.docs,
          checked: r.checked,
        }))));
  }

  return (
    <div className="card" style={{ marginTop: 16, padding: "18px 20px" }}>
      <div className="toolbar">
        <span>
          {manual ? (
            <>
              <b>지난 지원 기록을 직접 입력합니다.</b>{" "}
              <span className="muted">사이트·회사·포지션·지원일은 꼭 채우세요. 서류는 지원일에 맞춰 자동으로 골라집니다.</span>
            </>
          ) : (
            <>
              <b>{total}건을 찾았습니다.</b>{" "}
              <span className="muted">틀린 값을 고치고 등록할 행을 고르세요. 이미 있는 기록은 체크가 해제되어 있습니다.</span>
            </>
          )}
        </span>
        <button type="button" className="btn quiet" onClick={() => router.push("/import")}>
          처음부터
        </button>
      </div>

      {docFiles.length === 0 && (
        <p className="muted small" style={{ margin: "10px 0 0" }}>
          서류 파일이 없어 서류는 모두 &apos;모름&apos;입니다 → <Link href="/resume?tab=docs">서류 파일</Link>
        </p>
      )}

      <div className="review-wrap">
      <table className="review">
        <thead>
          <tr>
            <th />
            <th>회사</th>
            <th>포지션</th>
            <th>사이트</th>
            <th>지원일</th>
            <th>상태</th>
            <th>서류</th>
            <th>메모</th>
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
                  <AutoText
                    className={`in${need("companyName")}`}
                    label="회사"
                    placeholder="회사명"
                    value={r.companyName}
                    onChange={(v) => patch(r.key, { companyName: v })}
                    onBlur={() => void recheck(r.key)}
                  />
                </td>
                <td>
                  <AutoText
                    className={`in${need("positionTitle")}`}
                    label="포지션"
                    placeholder="포지션"
                    value={r.positionTitle}
                    onChange={(v) => patch(r.key, { positionTitle: v })}
                    onBlur={() => manual && void recheck(r.key)}
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
                  <DateInput
                    className={`in${need("appliedAt")}`}
                    aria-label="지원일"
                    value={r.appliedAt}
                    onChange={(e) => setAppliedAt(r.key, e.target.value)}
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
                  {DOC_KINDS.map((k) => (
                    <label key={k} className="doc-pick">
                      <span>{DOC_KIND_LABELS[k]}</span>
                      <select
                        className="in"
                        aria-label={DOC_KIND_LABELS[k]}
                        value={r.docs[k] ?? ""}
                        onChange={(e) =>
                          patch(r.key, {
                            docs: { ...r.docs, [k]: e.target.value || null },
                            touched: { ...r.touched, [k]: true },
                          })
                        }
                      >
                        <option value="">모름</option>
                        {canBeNone(k) && <option value={DOC_NONE}>없음</option>}
                        {docFiles
                          .filter((f) => f.kind === k)
                          .map((f) => (
                            <option key={f.fileName} value={f.fileName}>
                              {f.date}
                            </option>
                          ))}
                      </select>
                    </label>
                  ))}
                </td>
                <td>
                  <textarea
                    className="in"
                    rows={1}
                    aria-label="메모"
                    placeholder="메모(선택)"
                    value={r.notes}
                    onChange={(e) => patch(r.key, { notes: e.target.value })}
                  ></textarea>
                </td>
                <td>
                  {r.existing ? (
                    <span className="flag">이미 있음</span>
                  ) : r.sameDay && missing.length === 0 ? (
                    <span className="flag">같은 날 기록 있음</span>
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
      </div>
      {rows.length === 0 && <p className="muted" style={{ marginTop: 12 }}>행이 없습니다. 아래에서 추가하거나 처음부터 다시 하세요.</p>}

      <div className="toolbar" style={{ marginTop: 14 }}>
        <button
          type="button"
          className="btn sm"
          onClick={() =>
            setRows((cur) => [
              ...cur,
              { ...emptyRow(cur.at(-1)?.site ?? "other"), checked: true, key: nextKey.current++, existing: false, sameDay: false, touched: {} },
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
