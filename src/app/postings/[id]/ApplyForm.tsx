"use client";

import { useRef, useState } from "react";
import { markAppliedAction, recentApplicationsAction } from "@/app/_actions/applications";
import { SiteBadge } from "@/app/_components/SiteBadge";
import { statusText } from "@/app/_components/StatusBadge";
import type { RecentApplication } from "@/lib/applications/repo";
import { Modal } from "@/app/_components/Modal";
import { useAction } from "@/app/_components/useAction";
import { todayLocal } from "@/lib/domain/dates";
import { SITE_IDS, SITE_LABELS, type SiteId } from "@/lib/domain/types";
import { DateInput } from "@/app/_components/DateInput";

/**
 * [지원 완료] 버튼과 작은 폼. docs/spec/screens.md 3.7
 * 누르면 먼저 최근 6개월 안의 같은 공고·같은 회사 지원 기록을 보고, 있으면 확인 창을 띄운다(D-10).
 */
export function ApplyForm({
  postingId,
  defaultSite,
  defaultSiteNote,
  siteNotes,
  disabledHint,
  secondary,
  label = "지원 완료",
}: {
  postingId: number;
  defaultSite: SiteId;
  defaultSiteNote: string | null;
  siteNotes: string[];
  /** 값이 있으면 버튼을 비활성으로 두고 이 문구를 보여 준다 */
  disabledHint?: string;
  /** 지원 기록 탭 안의 버튼처럼 쓸 때 */
  secondary?: boolean;
  /** 이미 지원한 공고에서는 "다시 지원 완료" */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<RecentApplication[] | null>(null);
  const [appliedAt, setAppliedAt] = useState("");
  const [site, setSite] = useState<SiteId>(defaultSite);
  const [siteNote, setSiteNote] = useState(defaultSiteNote ?? "");
  const [notes, setNotes] = useState("");
  const { pending, error, setError, run } = useAction();
  const [checking, setChecking] = useState(false);
  // 저장을 시작했거나 끝낸 폼은 다시 저장하지 않는다(이중 제출 방지). 폼을 새로 열 때만 풀린다.
  const submittedRef = useRef(false);
  const [submitted, setSubmitted] = useState(false);

  const start = async () => {
    setChecking(true);
    setError(null);
    try {
      const r = await recentApplicationsAction(postingId);
      if (r.ok && r.records.length > 0) setRecent(r.records);
      else openForm(); // 기록이 없거나 확인에 실패해도 폼은 연다(저장은 서버가 다시 검사한다)
    } finally {
      setChecking(false);
    }
  };

  const openForm = () => {
    setRecent(null);
    setAppliedAt(todayLocal());
    setSite(defaultSite);
    setSiteNote(defaultSiteNote ?? "");
    setNotes("");
    setError(null);
    submittedRef.current = false;
    setSubmitted(false);
    setOpen(true);
  };

  return (
    <>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
        <button
          type="button"
          className={`btn ${secondary ? "" : "primary"}`}
          disabled={Boolean(disabledHint) || checking}
          onClick={start}
        >
          {label}
        </button>
        {disabledHint ? <span className="muted small">{disabledHint}</span> : null}
      </span>
      {recent && (
        <Modal title="최근 6개월 안에 지원한 기록이 있습니다" onClose={() => setRecent(null)} wide>
          <ul className="recent-list" style={{ margin: "14px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
            {recent.map((r) => (
              <li key={r.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span>{r.appliedAt}</span>
                <SiteBadge site={r.site} note={r.siteNote} />
                <span>{r.positionTitle}</span>
                <span className="muted">{statusText(r.status, r.interviewRound)}</span>
                {r.samePosting ? <span className="tag-rec">이 공고</span> : null}
              </li>
            ))}
          </ul>
          <footer>
            <button type="button" className="btn" onClick={() => setRecent(null)}>
              취소
            </button>
            <button type="button" className="btn primary" onClick={openForm}>
              그래도 지원 완료
            </button>
          </footer>
        </Modal>
      )}
      {open && (
        <Modal title="지원 완료로 기록" description="실제 사이트에서 지원한 뒤 기록하세요." onClose={() => setOpen(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (submittedRef.current) return;
              submittedRef.current = true;
              setSubmitted(true);
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
                () => {
                  // 저장 실패: 고쳐서 다시 저장할 수 있게 푼다
                  submittedRef.current = false;
                  setSubmitted(false);
                },
              );
            }}
          >
            <div className="row">
              <label htmlFor="ap-date">지원일</label>
              <DateInput id="ap-date" required value={appliedAt} onChange={(e) => setAppliedAt(e.target.value)} />
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
              <button type="submit" className="btn primary" disabled={pending || submitted}>
                저장
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </>
  );
}
