"use client";

import { useEffect, useState } from "react";
import {
  addAliasAction,
  linkCompanyAction,
  mergeCompaniesAction,
  searchCompaniesAction,
  type CompanyCandidate,
} from "@/app/_actions/companies";
import { Modal } from "@/app/_components/Modal";
import { useAction } from "@/app/_components/useAction";
import { josa } from "@/lib/domain/korean";

type Mode = "link" | "alias" | "merge";
const MODE_LABEL: Record<Mode, string> = { link: "다른 회사로 연결", alias: "별칭 추가", merge: "다른 회사와 합치기" };
const OK_LABEL: Record<Mode, string> = { link: "연결 바꾸기", alias: "별칭 추가", merge: "합치기" };

/** [회사 연결 변경] 창: 연결 바꾸기 / 별칭 추가 / 다른 회사와 합치기 (D-04) */
export function CompanyLink({
  postingId,
  company,
}: {
  postingId: number;
  company: { id: number; displayName: string; legalName: string | null; postings: number; applications: number };
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn quiet" onClick={() => setOpen(true)}>
        회사 연결 변경
      </button>
      {open && <CompanyLinkModal postingId={postingId} company={company} onClose={() => setOpen(false)} />}
    </>
  );
}

function CompanyLinkModal({
  postingId,
  company,
  onClose,
}: {
  postingId: number;
  company: { id: number; displayName: string; legalName: string | null; postings: number; applications: number };
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>("merge");
  const [text, setText] = useState("");
  const [alias, setAlias] = useState("");
  const [found, setFound] = useState<CompanyCandidate[]>([]);
  const [picked, setPicked] = useState<CompanyCandidate | null>(null);
  const { pending, error, setError, run } = useAction();

  // 입력을 멈추면 회사를 찾는다.
  useEffect(() => {
    if (mode === "alias" || !text.trim()) return;
    let stale = false;
    const t = setTimeout(async () => {
      const result = await searchCompaniesAction(text);
      if (!stale) setFound(result.filter((c) => c.id !== company.id));
    }, 200);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [text, mode, company.id]);

  // 검색어가 없거나 별칭 모드면 후보를 보이지 않는다.
  const cands = mode === "alias" || !text.trim() ? [] : found;

  const switchMode = (m: Mode) => {
    setMode(m);
    setPicked(null);
    setText("");
    setFound([]);
    setError(null);
  };

  const canSubmit = mode === "alias" ? alias.trim() !== "" : picked != null;

  const submit = () => {
    if (mode === "link" && picked) run(() => linkCompanyAction(postingId, picked.id), onClose);
    else if (mode === "alias") run(() => addAliasAction(company.id, alias), onClose);
    else if (mode === "merge" && picked) run(() => mergeCompaniesAction(company.id, picked.id), onClose);
  };

  return (
    <Modal
      title="회사 연결 변경"
      description={`지금 연결: ${company.displayName}${company.legalName ? ` (법인명 ${company.legalName})` : ""}`}
      onClose={onClose}
      wide
    >
      <div className="round" style={{ marginTop: 16 }} role="tablist">
        {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
          <button key={m} type="button" className="r" aria-pressed={mode === m} onClick={() => switchMode(m)}>
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>

      {mode === "alias" ? (
        <div>
          <input
            className="in"
            style={{ marginTop: 14 }}
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="예: 서비스 이름, 영문 이름"
            aria-label="별칭"
          />
          <p className="muted small">이 이름으로 검색해도 {josa(company.displayName, "이")} 나옵니다.</p>
        </div>
      ) : (
        <div>
          <input
            className="in"
            style={{ marginTop: 14 }}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPicked(null);
            }}
            placeholder={mode === "link" ? "연결할 회사 이름으로 찾기" : "합칠 회사 이름으로 찾기"}
            aria-label="회사 찾기"
          />
          {cands.map((c) => (
            <button
              key={c.id}
              type="button"
              className="cand"
              aria-pressed={picked?.id === c.id}
              onClick={() => setPicked(c)}
            >
              <span>
                <b>{c.displayName}</b>{" "}
                <span className="muted small">
                  공고 {c.postings}건, 지원 기록 {c.applications}건
                </span>
              </span>
              {picked?.id === c.id && <span className="st go">선택됨</span>}
            </button>
          ))}
          {text.trim() && cands.length === 0 && <p className="muted small">찾은 회사가 없습니다.</p>}
          {mode === "merge" && picked && (
            <p className="small" style={{ margin: "12px 0 0" }}>
              {josa(company.displayName, "와")} {josa(picked.displayName, "를")} 합칩니다. 공고 {picked.postings}건, 지원 기록{" "}
              {picked.applications}건이 <b>{josa(company.displayName, "로")}</b> 모이고, &quot;{picked.displayName}&quot; 이름은 별칭으로 남습니다.
            </p>
          )}
          {mode === "link" && picked && (
            <p className="small" style={{ margin: "12px 0 0" }}>
              이 공고를 <b>{picked.displayName}</b> 회사에 연결합니다.
            </p>
          )}
        </div>
      )}

      {error ? <p className="err">{error}</p> : null}
      <footer>
        <button type="button" className="btn" onClick={onClose}>
          취소
        </button>
        <button type="button" className="btn primary" disabled={!canSubmit || pending} onClick={submit}>
          {OK_LABEL[mode]}
        </button>
      </footer>
    </Modal>
  );
}
