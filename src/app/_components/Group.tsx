"use client";

import { useEffect, useState } from "react";

const STORAGE = "cf.dashboard.groups";

function readOpen(key: string): boolean | undefined {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE) ?? "{}") as Record<string, boolean>;
    return all[key];
  } catch {
    return undefined;
  }
}

function writeOpen(key: string, open: boolean) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE) ?? "{}") as Record<string, boolean>;
    all[key] = open;
    localStorage.setItem(STORAGE, JSON.stringify(all));
  } catch {
    /* 저장이 막혀 있어도 화면은 동작한다 */
  }
}

/** 접고 펴는 묶음. 펼침 상태는 이 브라우저에만 기억한다. 기본은 펼침. */
export function Group({
  storageKey,
  chip,
  count,
  rate,
  children,
}: {
  storageKey: string;
  chip: React.ReactNode;
  count: number;
  rate: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const saved = readOpen(storageKey);
    if (saved !== undefined) setOpen(saved);
  }, [storageKey]);

  return (
    <div className="group" data-open={open}>
      <button
        type="button"
        className="group-head"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          writeOpen(storageKey, !open);
        }}
      >
        <span className="tri" />
        {chip}
        <span className="n">{count}</span>
        <span className="rate">{rate}</span>
      </button>
      <div className="group-body card table-card">{children}</div>
    </div>
  );
}
