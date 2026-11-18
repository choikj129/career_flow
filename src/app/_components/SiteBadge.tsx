import { SITE_LABELS, type SiteId } from "@/lib/domain/types";

/** 사이트 표시: 색 점 + 이름. 기타는 출처 이름을 옆에 붙인다. */
export function SiteBadge({ site, note, large }: { site: SiteId; note?: string | null; large?: boolean }) {
  return (
    <span className={`site ${site}${large ? " lg" : ""}`}>
      {SITE_LABELS[site]}
      {site === "other" && note ? (
        <span className="muted" style={{ fontWeight: 500 }}>
          {note}
        </span>
      ) : null}
    </span>
  );
}
