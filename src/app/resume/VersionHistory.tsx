"use client";

import { useState } from "react";
import { formatDateTime } from "@/lib/domain/dates";
import { diffResume } from "@/lib/resume/diff";
import type { ResumeContent } from "@/lib/resume/schema";

type Version = { id: number; versionNo: number; createdAt: string; note: string | null; content: ResumeContent };

/** 버전 목록과 읽기 전용 보기, 직전 버전과 비교. docs/spec/screens.md 5.3 */
export function VersionHistory({ versions }: { versions: Version[] }) {
  const [selected, setSelected] = useState(versions[0]?.id);
  const [mode, setMode] = useState<"view" | "diff">("view");
  const shown = versions.find((v) => v.id === selected) ?? versions[0];
  const shownIndex = shown ? versions.indexOf(shown) : -1;
  const prev = shownIndex >= 0 ? versions[shownIndex + 1] : undefined; // 목록은 최신이 위라 다음 칸이 직전 버전
  return (
    <div className="two" style={{ gridTemplateColumns: "280px minmax(0,1fr)" }}>
      <div className="card vlist" role="list">
        {versions.map((v, i) => (
          <button key={v.id} type="button" aria-pressed={v.id === shown?.id} onClick={() => setSelected(v.id)}>
            <b>v{v.versionNo}</b> {i === 0 ? "현재" : ""}
            <small>
              {formatDateTime(v.createdAt)}
              {v.note ? `, ${v.note}` : ""}
            </small>
          </button>
        ))}
      </div>
      {shown && (
        <div style={{ minWidth: 0 }}>
          <div className="seg" role="tablist" aria-label="보기 방식" style={{ marginBottom: 12 }}>
            <button type="button" role="tab" aria-selected={mode === "view"} onClick={() => setMode("view")}>
              내용
            </button>
            <button type="button" role="tab" aria-selected={mode === "diff"} onClick={() => setMode("diff")}>
              직전 버전과 비교
            </button>
          </div>
          {mode === "view" ? <ReadOnlyResume v={shown} /> : <VersionDiff v={shown} prev={prev} />}
        </div>
      )}
    </div>
  );
}

/** 직전 버전과 달라진 곳. 맞춤 이력서 변경 내역과 같은 모양(이유 줄 없음) */
function VersionDiff({ v, prev }: { v: Version; prev: Version | undefined }) {
  if (!prev) return <div className="card" style={{ padding: 20 }} data-testid="version-diff">첫 버전입니다.</div>;
  const changes = diffResume(prev.content, v.content);
  return (
    <div className="card" style={{ padding: "8px 0" }} data-testid="version-diff">
      <h2 style={{ fontSize: 18, padding: "10px 16px 0" }}>
        v{prev.versionNo} → v{v.versionNo}
      </h2>
      {changes.length === 0 ? (
        <p className="muted" style={{ padding: "8px 16px" }}>직전 버전과 같은 내용입니다.</p>
      ) : (
        changes.map((c, i) => (
          <div className="change" key={i}>
            <div className="path">{c.section} · {c.label}</div>
            <div style={{ overflowWrap: "anywhere" }}>
              {c.before != null && <del>{c.before}</del>}
              {c.before != null && c.after != null ? " → " : null}
              {c.after != null && <ins>{c.after}</ins>}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div className="fl">{title}</div>
      {children}
    </div>
  );
}

function ReadOnlyResume({ v }: { v: Version }) {
  const c = v.content;
  return (
    <div>
      <h2 style={{ fontSize: 18 }}>
        v{v.versionNo} <span className="muted" style={{ fontWeight: 500, fontSize: 14 }}>읽기 전용</span>
      </h2>
      <div className="card" style={{ marginTop: 12, padding: "8px 24px 24px" }}>
        <Block title="기본 정보">
          <div>{c.basics.name || "(이름 없음)"}</div>
          <div className="muted small">{[c.basics.email, c.basics.phone].filter(Boolean).join(" · ")}</div>
          {c.basics.links.map((l, i) => (
            <div key={i} className="small">
              {l.label} {l.url}
            </div>
          ))}
        </Block>
        {c.summary && (
          <Block title="한 줄 소개">
            <div style={{ whiteSpace: "pre-wrap" }}>{c.summary}</div>
          </Block>
        )}
        {c.experiences.length > 0 && (
          <Block title="경력">
            {c.experiences.map((e) => (
              <div key={e.id} style={{ marginTop: 8 }}>
                <b>{e.company}</b> <span className="muted">{e.role}</span>
                <div className="muted small">
                  {e.start} ~ {e.end ?? "재직 중"}
                </div>
                {e.description && <div style={{ whiteSpace: "pre-wrap" }}>{e.description}</div>}
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                  {e.achievements.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            ))}
          </Block>
        )}
        {c.projects.length > 0 && (
          <Block title="프로젝트">
            {c.projects.map((p) => (
              <div key={p.id} style={{ marginTop: 8 }}>
                <b>{p.name}</b> <span className="muted">{[p.org, p.role].filter(Boolean).join(" · ")}</span>
                <div className="muted small">{p.techStack.join(", ")}</div>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                  {p.achievements.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            ))}
          </Block>
        )}
        {c.skills.length > 0 && (
          <Block title="기술 스택">
            {c.skills.map((s, i) => (
              <div key={i}>
                <b>{s.category}</b> {s.items.join(", ")}
              </div>
            ))}
          </Block>
        )}
        {c.education.length > 0 && (
          <Block title="학력">
            {c.education.map((e, i) => (
              <div key={i}>
                {[e.school, e.major, e.degree].filter(Boolean).join(" · ")}{" "}
                <span className="muted small">{[e.start, e.end].filter(Boolean).join(" ~ ")}</span>
              </div>
            ))}
          </Block>
        )}
        {c.certifications.length > 0 && (
          <Block title="자격증·수상·교육">
            {c.certifications.map((e, i) => (
              <div key={i}>{[e.name, e.issuer, e.date].filter(Boolean).join(" · ")}</div>
            ))}
          </Block>
        )}
        {c.careerNarrative && (
          <Block title="경력기술서">
            <div style={{ whiteSpace: "pre-wrap" }}>{c.careerNarrative}</div>
          </Block>
        )}
        {c.portfolio.length > 0 && (
          <Block title="포트폴리오">
            {c.portfolio.map((p, i) => (
              <div key={i}>
                <b>{p.title}</b> <span className="muted small">{p.url ?? p.filePath ?? ""}</span>
                <div>{p.summary}</div>
              </div>
            ))}
          </Block>
        )}
      </div>
    </div>
  );
}
