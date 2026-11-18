"use client";

import { useState } from "react";
import { markAppliedAction } from "@/app/_actions/applications";
import { Modal } from "@/app/_components/Modal";
import { useAction } from "@/app/_components/useAction";
import { todayLocal } from "@/lib/domain/dates";
import { SITE_IDS, SITE_LABELS, type SiteId } from "@/lib/domain/types";

/** [지원 완료] 버튼과 작은 폼. docs/spec/screens.md 3.7 */
export function ApplyForm({
  postingId,
  defaultSite,
  defaultSiteNote,
  siteNotes,
  disabledHint,
  secondary,
}: {
  postingId: number;
  defaultSite: SiteId;
  defaultSiteNote: string | null;
  siteNotes: string[];
  /** 값이 있으면 버튼을 비활성으로 두고 이 문구를 보여 준다 */
  disabledHint?: string;
  /** 지원 기록 탭 안의 버튼처럼 쓸 때 */
  secondary?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [appliedAt, setAppliedAt] = useState("");
  const [site, setSite] = useState<SiteId>(defaultSite);
  const [siteNote, setSiteNote] = useState(defaultSiteNote ?? "");
  const [notes, setNotes] = useState("");
  const { pending, error, setError, run } = useAction();

  const openForm = () => {
    setAppliedAt(todayLocal());
    setSite(defaultSite);
    setSiteNote(defaultSiteNote ?? "");
    setNotes("");
    setError(null);
    setOpen(true);
  };

  return (
    <>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
        <button
          type="button"
          className={`btn ${secondary ? "" : "primary"}`}
          disabled={Boolean(disabledHint)}
          onClick={openForm}
        >
          지원 완료
        </button>
        {disabledHint ? <span className="muted small">{disabledHint}</span> : null}
      </span>
      {open && (
        <Modal title="지원 완료로 기록" description="실제 사이트에서 지원한 뒤 기록하세요." onClose={() => setOpen(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () =>
                  markAppliedAction({
                    postingId,
                    appliedAt,
                    site,
                    siteNote: site === "other" ? siteNote : undefined,
                    notes,
                  }),
                () => setOpen(false),
              );
            }}
          >
            <div className="row">
              <label htmlFor="ap-date">지원일</label>
              <input id="ap-date" type="date" required value={appliedAt} onChange={(e) => setAppliedAt(e.target.value)} />
            </div>
            <div className="row">
              <label htmlFor="ap-site">지원 사이트</label>
              <select id="ap-site" value={site} onChange={(e) => setSite(e.target.value as SiteId)}>
                {SITE_IDS.map((s) => (
                  <option key={s} value={s}>
                    {SITE_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            {site === "other" && (
              <div className="row">
                <label htmlFor="ap-note">출처 이름</label>
                <input
                  id="ap-note"
                  list="ap-notes"
                  value={siteNote}
                  onChange={(e) => setSiteNote(e.target.value)}
                  placeholder="예: 지인 추천"
                />
                <datalist id="ap-notes">
                  {siteNotes.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>
            )}
            <div className="row">
              <label htmlFor="ap-memo">메모</label>
              <input id="ap-memo" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="선택" />
            </div>
            {error ? <p className="err">{error}</p> : null}
            <footer>
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                취소
              </button>
              <button type="submit" className="btn primary" disabled={pending}>
                저장
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </>
  );
}
