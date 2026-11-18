"use client";

import { useState } from "react";
import { updateApplicationAction } from "@/app/_actions/applications";
import { SITE_IDS, SITE_LABELS, type SiteId } from "@/lib/domain/types";
import { Modal } from "./Modal";
import { useAction } from "./useAction";

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
          <input id="ed-date" type="date" required value={appliedAt} onChange={(e) => setAppliedAt(e.target.value)} />
        </div>
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
