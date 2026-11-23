"use client";

import { useEffect, useState } from "react";
import { submittedFormDataAction, updateApplicationAction } from "@/app/_actions/applications";
import type { SubmittedFormData } from "@/lib/applications/submitted-options";
import { DocSelects, useSubmittedValues } from "./DocSelects";
import { SITE_IDS, SITE_LABELS, type SiteId } from "@/lib/domain/types";
import { Modal } from "./Modal";
import { useAction } from "./useAction";
import { DateInput } from "./DateInput";

export type EditableRecord = {
  applicationId: number;
  companyName: string;
  positionTitle: string;
  site: SiteId;
  siteNote: string | null;
  appliedAt: string;
};

/** 지원 기록 수정 창. 상태는 여기서 바꾸지 않는다. docs/spec/screens.md 3.10 */
export function ApplicationEditModal({
  record,
  siteNotes,
  onClose,
}: {
  record: EditableRecord;
  siteNotes: string[];
  onClose: () => void;
}) {
  const [companyName, setCompanyName] = useState(record.companyName);
  const [positionTitle, setPositionTitle] = useState(record.positionTitle);
  const [site, setSite] = useState<SiteId>(record.site);
  const [siteNote, setSiteNote] = useState(record.siteNote ?? "");
  const [appliedAt, setAppliedAt] = useState(record.appliedAt);
  const { pending, error, run } = useAction();
  // 제출 서류 선택지는 창이 열릴 때 읽는다. 읽는 동안·실패하면 제출 서류는 건드리지 않는다
  const [form, setForm] = useState<SubmittedFormData | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const submitted = useSubmittedValues(form, record.appliedAt, "edit");
  useEffect(() => {
    let alive = true;
    submittedFormDataAction({ applicationId: record.applicationId }).then((r) => {
      if (!alive) return;
      if (r.ok) setForm(r.data);
      else setFormError(r.error);
    });
    return () => {
      alive = false;
    };
  }, [record.applicationId]);

  return (
    <Modal title="지원 기록 수정" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () =>
              updateApplicationAction({
                applicationId: record.applicationId,
                companyName,
                positionTitle,
                site,
                siteNote: site === "other" ? siteNote : undefined,
                appliedAt,
                // 직접 바꾼 때만 보낸다(그대로면 지금 기록 값을 다시 검증하지 않는다)
                submitted: submitted.touched ? (submitted.value ?? undefined) : undefined,
              }),
            onClose,
          );
        }}
      >
        <div className="row">
          <label htmlFor="ed-co">회사</label>
          <input id="ed-co" required value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        </div>
        <div className="row">
          <label htmlFor="ed-pos">포지션</label>
          <input id="ed-pos" required value={positionTitle} onChange={(e) => setPositionTitle(e.target.value)} />
        </div>
        <div className="row">
          <label htmlFor="ed-site">지원 사이트</label>
          <select id="ed-site" value={site} onChange={(e) => setSite(e.target.value as SiteId)}>
            {SITE_IDS.map((s) => (
              <option key={s} value={s}>
                {SITE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        {site === "other" && (
          <div className="row">
            <label htmlFor="ed-note">출처 이름</label>
            <input
              id="ed-note"
              list="ed-notes"
              value={siteNote}
              onChange={(e) => setSiteNote(e.target.value)}
              placeholder="예: 지인 추천"
            />
            <datalist id="ed-notes">
              {siteNotes.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
        )}
        <div className="row">
          <label htmlFor="ed-date">지원일</label>
          <DateInput id="ed-date" required value={appliedAt} onChange={(e) => setAppliedAt(e.target.value)} />
        </div>
        {form && submitted.value ? (
          <DocSelects data={form} value={submitted.value} onChange={submitted.set} idPrefix="ed-doc" />
        ) : (
          <div className="row">
            <label>제출 서류</label>
            <span className="muted small">{formError ?? "불러오는 중…"}</span>
          </div>
        )}
        {error ? <p className="err">{error}</p> : null}
        <footer>
          <button type="button" className="btn" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="btn primary" disabled={pending}>
            저장
          </button>
        </footer>
      </form>
    </Modal>
  );
}
