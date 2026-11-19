"use client";

import { useState } from "react";

const TABS = [
  { id: "edit", label: "이력서" },
  { id: "ver", label: "버전 기록" },
  { id: "pref", label: "희망 조건" },
  { id: "docs", label: "서류 파일" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** 세 구역을 모두 그려 두고 보이는 것만 바꾼다. 탭을 옮겨도 편집 중인 내용이 사라지지 않는다. */
export function ResumeTabs({
  edit,
  versions,
  prefs,
  docs,
  initialTab,
}: {
  edit: React.ReactNode;
  versions: React.ReactNode;
  prefs: React.ReactNode;
  docs: React.ReactNode;
  initialTab?: string;
}) {
  const [tab, setTab] = useState<TabId>(TABS.some((t) => t.id === initialTab) ? (initialTab as TabId) : "edit");
  const panels: Record<TabId, React.ReactNode> = { edit, ver: versions, pref: prefs, docs };
  return (
    <>
      <div className="subtabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {TABS.map((t) => (
        <section key={t.id} className={`subpanel${tab === t.id ? " on" : ""}`} role="tabpanel">
          {panels[t.id]}
        </section>
      ))}
    </>
  );
}
