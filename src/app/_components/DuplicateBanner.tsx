import Link from "next/link";
import type { ApplicationStatus, SiteId } from "@/lib/domain/types";
import { SiteBadge } from "./SiteBadge";
import { statusText } from "./StatusBadge";

export type PriorApplication = {
  id: number;
  postingId: number | null;
  positionTitle: string;
  site: SiteId;
  siteNote: string | null;
  appliedAt: string;
  status: ApplicationStatus;
  interviewRound: number | null;
};

/** 같은 회사에 낸 다른 지원 기록이 있으면 보이는 노란 경고 */
export function DuplicateBanner({ prior }: { prior: PriorApplication[] }) {
  if (prior.length === 0) return null;
  return (
    <div className="dup" role="note">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3 2 21h20L12 3z" />
        <path d="M12 10v5M12 18h.01" />
      </svg>
      <b>이 회사에 지원한 기록이 {prior.length}건 있습니다.</b>
      <ul>
        {prior.map((p) => {
          const inner = (
            <>
              {p.appliedAt} <SiteBadge site={p.site} note={p.siteNote} /> ‘{p.positionTitle}’ — {statusText(p.status, p.interviewRound)}
            </>
          );
          return (
            <li key={p.id}>{p.postingId != null ? <Link href={`/postings/${p.postingId}`}>{inner}</Link> : inner}</li>
          );
        })}
      </ul>
    </div>
  );
}
