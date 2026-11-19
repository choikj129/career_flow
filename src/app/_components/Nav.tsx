"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const LINKS = [
  { href: "/", label: "대시보드" },
  { href: "/stats", label: "통계" },
  { href: "/postings/new", label: "공고 등록" },
  { href: "/postings/analyzed", label: "분석한 공고" },
  { href: "/resume", label: "기본 이력서" },
  { href: "/import", label: "가져오기" },
  { href: "/settings", label: "설정" },
];

type Active = { running: number; queued: number; href: string | null };

function isCurrent(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  // "/postings/new"와 "/postings/analyzed"는 따로 강조한다. 공고 상세(/postings/숫자)는 대시보드 쪽으로 본다.
  return pathname === href || pathname.startsWith(href + "/");
}

/** 상단 내비게이션 + 진행 중 작업 표시(3초마다 조회) */
export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [active, setActive] = useState<Active>({ running: 0, queued: 0, href: null });
  const prevTotal = useRef(0);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/jobs/active", { cache: "no-store" });
        if (!res.ok || stopped) return;
        const data = (await res.json()) as Active;
        setActive(data);
        const total = data.running + data.queued;
        // 작업이 모두 끝나면 화면 데이터를 새로 읽는다.
        if (prevTotal.current > 0 && total === 0) router.refresh();
        prevTotal.current = total;
      } catch {
        /* 서버가 잠깐 안 될 수 있다. 다음 주기에 다시 한다. */
      }
    };
    void tick();
    const timer = setInterval(tick, 3000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [router]);

  const total = active.running + active.queued;
  const jobText =
    active.running > 0
      ? `작업 ${active.running}개 진행 중${active.queued > 0 ? ` · 대기 ${active.queued}` : ""}`
      : `대기 ${active.queued}`;

  return (
    <nav className="nav" aria-label="주 메뉴">
      <div className="nav-inner">
        <Link href="/" className="logo">
          Career Flow
        </Link>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} aria-current={isCurrent(pathname, l.href) ? "page" : undefined}>
            {l.label}
          </Link>
        ))}
        {total > 0 && (
          <Link className="job-ind" href={active.href ?? "/"}>
            <span className="dot" />
            {jobText}
          </Link>
        )}
      </div>
    </nav>
  );
}
