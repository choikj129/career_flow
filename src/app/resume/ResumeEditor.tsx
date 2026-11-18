"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { saveResumeAction } from "@/app/_actions/resume";
import { ConfirmModal } from "@/app/_components/Modal";
import { useAction } from "@/app/_components/useAction";
import type { ResumeContent } from "@/lib/resume/schema";

type Resume = ResumeContent;

function uid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function move<T>(arr: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

const opt = (v: string): string | undefined => (v === "" ? undefined : v);

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="fl">
        {label}
        {children}
      </label>
    </div>
  );
}

function Arrows({ onUp, onDown, onDelete }: { onUp?: () => void; onDown?: () => void; onDelete: () => void }) {
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      {onUp && (
        <button type="button" className="icon-btn" aria-label="위로" onClick={onUp}>
          ↑
        </button>
      )}
      {onDown && (
        <button type="button" className="icon-btn" aria-label="아래로" onClick={onDown}>
          ↓
        </button>
      )}
      <button type="button" className="icon-btn" aria-label="삭제" onClick={onDelete}>
        ✕
      </button>
    </span>
  );
}

/** 문장 여러 개(성과 등). 추가·삭제·순서 이동 */
function Bullets({
  values,
  onChange,
  addLabel,
  label,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  addLabel: string;
  label: string;
}) {
  return (
    <>
      {values.map((v, i) => (
        <div className="bullet" key={i}>
          <input
            className="in"
            aria-label={`${label} ${i + 1}`}
            value={v}
            onChange={(e) => onChange(values.map((x, k) => (k === i ? e.target.value : x)))}
          />
          <Arrows
            onUp={() => onChange(move(values, i, -1))}
            onDown={() => onChange(move(values, i, 1))}
            onDelete={() => onChange(values.filter((_, k) => k !== i))}
          />
        </div>
      ))}
      <button type="button" className="btn sm" style={{ marginTop: 8 }} onClick={() => onChange([...values, ""])}>
        {addLabel}
      </button>
    </>
  );
}

/** 쉼표로 나눈 한 줄 입력(기술 목록). 입력 중 쉼표·공백을 지우지 않도록 문자열 상태를 따로 둔다. */
function CommaList({ values, onChange, label }: { values: string[]; onChange: (v: string[]) => void; label: string }) {
  const [text, setText] = useState(values.join(", "));
  return (
    <input
      className="in"
      aria-label={label}
      value={text}
      placeholder="쉼표로 구분"
      onChange={(e) => {
        setText(e.target.value);
        onChange(
          e.target.value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        );
      }}
    />
  );
}

/**
 * 저장하지 않은 변경이 있을 때 화면을 떠나면 확인한다.
 * 주소창 이동·새로고침은 브라우저 기본 확인창, 앱 안의 링크는 확인 창으로 막는다.
 */
function useLeaveGuard(active: boolean) {
  const router = useRouter();
  const [target, setTarget] = useState<string | null>(null);
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return; // 같은 화면의 #앵커
      e.preventDefault();
      e.stopPropagation();
      setTarget(url.pathname + url.search + url.hash);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [active]);
  const modal = target ? (
    <ConfirmModal
      title="저장하지 않고 나갈까요?"
      message="저장하지 않은 변경이 있습니다. 나가면 변경한 내용이 사라집니다."
      confirmLabel="나가기"
      danger
      onConfirm={() => {
        const t = target;
        setTarget(null);
        router.push(t);
      }}
      onClose={() => setTarget(null)}
    />
  ) : null;
  return modal;
}

const SECTIONS = [
  ["basics", "기본 정보"],
  ["summary", "한 줄 소개"],
  ["experiences", "경력"],
  ["projects", "프로젝트"],
  ["skills", "기술 스택"],
  ["education", "학력"],
  ["certs", "자격증·수상·교육"],
  ["narrative", "경력기술서"],
  ["portfolio", "포트폴리오"],
] as const;

/**
 * 이력서 편집기. docs/spec/screens.md 5.2.
 * draft이면 아직 저장된 적 없는 내용(가져오기 결과 검토·직접 입력)이다.
 */
export function ResumeEditor({
  initial,
  savedLabel,
  draft,
}: {
  initial: Resume;
  savedLabel?: string;
  draft?: boolean;
}) {
  const router = useRouter();
  const [r, setR] = useState<Resume>(initial);
  const [note, setNote] = useState("");
  const { pending, error, run } = useAction();
  const baseline = useRef(JSON.stringify(initial));
  const [done, setDone] = useState(false);
  const dirty = !done && (draft || JSON.stringify(r) !== baseline.current);
  const guard = useLeaveGuard(dirty);

  const edit = (fn: (d: Resume) => void) =>
    setR((cur) => {
      const d = structuredClone(cur);
      fn(d);
      return d;
    });

  function save() {
    run(
      () => saveResumeAction(r, note),
      () => {
        setDone(true);
        router.replace("/resume");
      },
    );
  }

  return (
    <div>
      {guard}
      <div className="saved-bar" style={{ justifyContent: "flex-end", marginBottom: 16, flexWrap: "wrap" }}>
        {savedLabel && !dirty && <span className="muted small">{savedLabel}</span>}
        {dirty && !draft && <span className="small" style={{ color: "var(--mark)", fontWeight: 600 }}>저장하지 않은 변경이 있습니다</span>}
        <input
          className="in"
          style={{ width: 260 }}
          aria-label="변경 메모"
          placeholder={draft ? "메모(선택)" : "변경 메모(선택) 예: B 프로젝트 성과 추가"}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button type="button" className="btn primary" disabled={pending} onClick={save}>
          {draft ? "기본 이력서로 저장" : "저장"}
        </button>
      </div>
      {error ? (
        <p className="field-err" role="alert" style={{ textAlign: "right" }}>
          {error}
        </p>
      ) : null}

      <div className="editor">
        <nav className="sec-index" aria-label="이력서 섹션">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#sec-${id}`}>
              {label}
            </a>
          ))}
        </nav>
        <div>
          <div className="card form-card" id="sec-basics">
            <h2>기본 정보</h2>
            <div className="grid2">
              <Field label="이름">
                <input className="in" value={r.basics.name} onChange={(e) => edit((d) => void (d.basics.name = e.target.value))} />
              </Field>
              <Field label="이메일">
                <input className="in" value={r.basics.email ?? ""} onChange={(e) => edit((d) => void (d.basics.email = opt(e.target.value)))} />
              </Field>
              <Field label="전화">
                <input className="in" value={r.basics.phone ?? ""} onChange={(e) => edit((d) => void (d.basics.phone = opt(e.target.value)))} />
              </Field>
            </div>
            <div style={{ marginTop: 12 }}>
              <span className="fl">링크</span>
              {r.basics.links.map((l, i) => (
                <div className="bullet" key={i}>
                  <input
                    className="in"
                    style={{ flex: "0 0 130px" }}
                    aria-label={`링크 이름 ${i + 1}`}
                    placeholder="GitHub"
                    value={l.label}
                    onChange={(e) => edit((d) => void (d.basics.links[i].label = e.target.value))}
                  />
                  <input
                    className="in"
                    aria-label={`링크 주소 ${i + 1}`}
                    placeholder="https://"
                    value={l.url}
                    onChange={(e) => edit((d) => void (d.basics.links[i].url = e.target.value))}
                  />
                  <Arrows onDelete={() => edit((d) => void d.basics.links.splice(i, 1))} />
                </div>
              ))}
              <button type="button" className="btn sm" style={{ marginTop: 8 }} onClick={() => edit((d) => void d.basics.links.push({ label: "", url: "" }))}>
                + 링크 추가
              </button>
            </div>
          </div>

          <div className="card form-card" id="sec-summary">
            <h2>한 줄 소개</h2>
            <textarea className="in" aria-label="한 줄 소개" value={r.summary} onChange={(e) => edit((d) => void (d.summary = e.target.value))} />
          </div>

          <div className="card form-card" id="sec-experiences">
            <h2>
              경력
              <button
                type="button"
                className="btn sm"
                onClick={() =>
                  edit((d) =>
                    void d.experiences.push({ id: uid(), company: "", role: "", start: "", end: null, description: "", achievements: [] }),
                  )
                }
              >
                + 경력 추가
              </button>
            </h2>
            {r.experiences.length === 0 && <p className="muted small">경력이 없습니다.</p>}
            {r.experiences.map((x, i) => (
              <div className="item" key={x.id}>
                <div className="item-head">
                  <b>
                    {x.company || "(회사명)"}　<span className="muted" style={{ fontWeight: 500 }}>{x.role}</span>
                  </b>
                  <Arrows
                    onUp={() => edit((d) => void (d.experiences = move(d.experiences, i, -1)))}
                    onDown={() => edit((d) => void (d.experiences = move(d.experiences, i, 1)))}
                    onDelete={() => edit((d) => void d.experiences.splice(i, 1))}
                  />
                </div>
                <div className="grid2" style={{ marginTop: 12 }}>
                  <Field label="회사">
                    <input className="in" value={x.company} onChange={(e) => edit((d) => void (d.experiences[i].company = e.target.value))} />
                  </Field>
                  <Field label="직무 / 직급">
                    <input className="in" value={x.role} onChange={(e) => edit((d) => void (d.experiences[i].role = e.target.value))} />
                  </Field>
                  <Field label="시작 (YYYY-MM)">
                    <input className="in" placeholder="2021-03" value={x.start} onChange={(e) => edit((d) => void (d.experiences[i].start = e.target.value))} />
                  </Field>
                  <div>
                    <span className="fl">종료 (YYYY-MM)</span>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <input
                        className="in"
                        aria-label="종료"
                        placeholder="YYYY-MM"
                        disabled={x.end === null}
                        value={x.end ?? ""}
                        onChange={(e) => edit((d) => void (d.experiences[i].end = e.target.value))}
                      />
                      <label className="small" style={{ whiteSpace: "nowrap" }}>
                        <input
                          type="checkbox"
                          checked={x.end === null}
                          onChange={(e) => edit((d) => void (d.experiences[i].end = e.target.checked ? null : ""))}
                        />{" "}
                        재직 중
                      </label>
                    </div>
                  </div>
                </div>
                <label className="fl" style={{ marginTop: 12 }}>
                  담당 업무
                  <textarea className="in" value={x.description} onChange={(e) => edit((d) => void (d.experiences[i].description = e.target.value))} />
                </label>
                <span className="fl" style={{ marginTop: 12 }}>성과</span>
                <Bullets
                  label="성과"
                  values={x.achievements}
                  addLabel="+ 성과 추가"
                  onChange={(v) => edit((d) => void (d.experiences[i].achievements = v))}
                />
              </div>
            ))}
          </div>

          <div className="card form-card" id="sec-projects">
            <h2>
              프로젝트
              <button
                type="button"
                className="btn sm"
                onClick={() => edit((d) => void d.projects.push({ id: uid(), name: "", role: "", techStack: [], achievements: [] }))}
              >
                + 프로젝트 추가
              </button>
            </h2>
            {r.projects.length === 0 && <p className="muted small">프로젝트가 없습니다.</p>}
            {r.projects.map((x, i) => (
              <div className="item" key={x.id}>
                <div className="item-head">
                  <b>{x.name || "(프로젝트 이름)"}</b>
                  <Arrows
                    onUp={() => edit((d) => void (d.projects = move(d.projects, i, -1)))}
                    onDown={() => edit((d) => void (d.projects = move(d.projects, i, 1)))}
                    onDelete={() => edit((d) => void d.projects.splice(i, 1))}
                  />
                </div>
                <div className="grid2" style={{ marginTop: 12 }}>
                  <Field label="이름">
                    <input className="in" value={x.name} onChange={(e) => edit((d) => void (d.projects[i].name = e.target.value))} />
                  </Field>
                  <Field label="소속">
                    <input className="in" value={x.org ?? ""} onChange={(e) => edit((d) => void (d.projects[i].org = opt(e.target.value)))} />
                  </Field>
                  <Field label="시작">
                    <input className="in" value={x.start ?? ""} onChange={(e) => edit((d) => void (d.projects[i].start = opt(e.target.value)))} />
                  </Field>
                  <Field label="종료">
                    <input className="in" value={x.end ?? ""} onChange={(e) => edit((d) => void (d.projects[i].end = opt(e.target.value)))} />
                  </Field>
                  <Field label="역할">
                    <input className="in" value={x.role} onChange={(e) => edit((d) => void (d.projects[i].role = e.target.value))} />
                  </Field>
                  <Field label="링크">
                    <input className="in" value={x.link ?? ""} onChange={(e) => edit((d) => void (d.projects[i].link = opt(e.target.value)))} />
                  </Field>
                </div>
                <span className="fl" style={{ marginTop: 12 }}>사용 기술</span>
                <CommaList label="사용 기술" values={x.techStack} onChange={(v) => edit((d) => void (d.projects[i].techStack = v))} />
                <span className="fl" style={{ marginTop: 12 }}>성과</span>
                <Bullets
                  label="성과"
                  values={x.achievements}
                  addLabel="+ 성과 추가"
                  onChange={(v) => edit((d) => void (d.projects[i].achievements = v))}
                />
              </div>
            ))}
          </div>

          <div className="card form-card" id="sec-skills">
            <h2>
              기술 스택
              <button type="button" className="btn sm" onClick={() => edit((d) => void d.skills.push({ category: "", items: [] }))}>
                + 분류 추가
              </button>
            </h2>
            {r.skills.length === 0 && <p className="muted small">기술 스택이 없습니다.</p>}
            {r.skills.map((s, i) => (
              <div className="bullet" key={i} style={{ alignItems: "center" }}>
                <input
                  className="in"
                  style={{ flex: "0 0 160px" }}
                  aria-label={`분류 ${i + 1}`}
                  placeholder="분류 (예: 언어)"
                  value={s.category}
                  onChange={(e) => edit((d) => void (d.skills[i].category = e.target.value))}
                />
                <CommaList label={`기술 목록 ${i + 1}`} values={s.items} onChange={(v) => edit((d) => void (d.skills[i].items = v))} />
                <Arrows onDelete={() => edit((d) => void d.skills.splice(i, 1))} />
              </div>
            ))}
          </div>

          <div className="card form-card" id="sec-education">
            <h2>
              학력
              <button type="button" className="btn sm" onClick={() => edit((d) => void d.education.push({ school: "" }))}>
                + 학력 추가
              </button>
            </h2>
            {r.education.length === 0 && <p className="muted small">학력이 없습니다.</p>}
            {r.education.map((x, i) => (
              <div className="item" key={i}>
                <div className="item-head">
                  <b>{x.school || "(학교)"}</b>
                  <Arrows onDelete={() => edit((d) => void d.education.splice(i, 1))} />
                </div>
                <div className="grid2" style={{ marginTop: 12 }}>
                  <Field label="학교">
                    <input className="in" value={x.school} onChange={(e) => edit((d) => void (d.education[i].school = e.target.value))} />
                  </Field>
                  <Field label="전공">
                    <input className="in" value={x.major ?? ""} onChange={(e) => edit((d) => void (d.education[i].major = opt(e.target.value)))} />
                  </Field>
                  <Field label="학위">
                    <input className="in" value={x.degree ?? ""} onChange={(e) => edit((d) => void (d.education[i].degree = opt(e.target.value)))} />
                  </Field>
                  <div>
                    <span className="fl">기간</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input className="in" aria-label="시작" value={x.start ?? ""} onChange={(e) => edit((d) => void (d.education[i].start = opt(e.target.value)))} />
                      <input className="in" aria-label="종료" value={x.end ?? ""} onChange={(e) => edit((d) => void (d.education[i].end = opt(e.target.value)))} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="card form-card" id="sec-certs">
            <h2>
              자격증·수상·교육
              <button type="button" className="btn sm" onClick={() => edit((d) => void d.certifications.push({ name: "" }))}>
                + 추가
              </button>
            </h2>
            {r.certifications.length === 0 && <p className="muted small">항목이 없습니다.</p>}
            {r.certifications.map((x, i) => (
              <div className="bullet" key={i}>
                <input className="in" aria-label={`이름 ${i + 1}`} placeholder="이름" value={x.name} onChange={(e) => edit((d) => void (d.certifications[i].name = e.target.value))} />
                <input className="in" aria-label={`발급처 ${i + 1}`} placeholder="발급처" value={x.issuer ?? ""} onChange={(e) => edit((d) => void (d.certifications[i].issuer = opt(e.target.value)))} />
                <input className="in" aria-label={`날짜 ${i + 1}`} placeholder="날짜" value={x.date ?? ""} onChange={(e) => edit((d) => void (d.certifications[i].date = opt(e.target.value)))} />
                <Arrows onDelete={() => edit((d) => void d.certifications.splice(i, 1))} />
              </div>
            ))}
          </div>

          <div className="card form-card" id="sec-narrative">
            <h2>경력기술서</h2>
            <textarea
              className="in"
              aria-label="경력기술서"
              style={{ minHeight: 160 }}
              value={r.careerNarrative}
              onChange={(e) => edit((d) => void (d.careerNarrative = e.target.value))}
            />
          </div>

          <div className="card form-card" id="sec-portfolio">
            <h2>
              포트폴리오
              <button type="button" className="btn sm" onClick={() => edit((d) => void d.portfolio.push({ title: "", summary: "" }))}>
                + 추가
              </button>
            </h2>
            {r.portfolio.length === 0 && <p className="muted small">포트폴리오가 없습니다.</p>}
            {r.portfolio.map((x, i) => (
              <div className="item" key={i}>
                <div className="item-head">
                  <b>{x.title || "(제목)"}</b>
                  <Arrows onDelete={() => edit((d) => void d.portfolio.splice(i, 1))} />
                </div>
                <div className="grid2" style={{ marginTop: 12 }}>
                  <Field label="제목">
                    <input className="in" value={x.title} onChange={(e) => edit((d) => void (d.portfolio[i].title = e.target.value))} />
                  </Field>
                  <Field label="링크">
                    <input className="in" value={x.url ?? ""} onChange={(e) => edit((d) => void (d.portfolio[i].url = opt(e.target.value)))} />
                  </Field>
                </div>
                <label className="fl" style={{ marginTop: 12 }}>
                  요약
                  <textarea className="in" value={x.summary} onChange={(e) => edit((d) => void (d.portfolio[i].summary = e.target.value))} />
                </label>
                {x.filePath && <p className="muted small">파일: {x.filePath}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
