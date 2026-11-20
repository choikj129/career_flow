import Link from "next/link";
import { dashboardHref, type DashboardParams } from "@/lib/search/dashboard-params";
import { pageNumbers, type PageSlice } from "@/lib/search/paging";

/** 전체 보기 아래 페이지 번호 줄과 "전체 n건 중 a–b". 번호는 주소의 page로 만든다. */
export function Pagination({ pg, params }: { pg: PageSlice<unknown>; params: DashboardParams }) {
  const href = (page: number) => dashboardHref({ ...params, page });
  const item = (label: string, page: number, disabled: boolean, aria?: string) =>
    disabled ? (
      <span key={label} className="pg-btn disabled" aria-disabled="true">
        {label}
      </span>
    ) : (
      <Link key={label} className="pg-btn" href={href(page)} aria-label={aria}>
        {label}
      </Link>
    );
  return (
    <div className="table-foot pager" data-testid="pager">
      <span>
        전체 {pg.total}건 중 {pg.from}–{pg.to}
      </span>
      {pg.pageCount > 1 && (
        <nav className="pg" aria-label="페이지">
          {item("처음", 1, pg.page === 1)}
          {item("이전", pg.page - 1, pg.page === 1)}
          {pageNumbers(pg.page, pg.pageCount).map((n, i) =>
            n === "…" ? (
              <span key={`e${i}`} className="pg-gap">
                …
              </span>
            ) : n === pg.page ? (
              <span key={n} className="pg-btn on" aria-current="page">
                {n}
              </span>
            ) : (
              <Link key={n} className="pg-btn" href={href(n)}>
                {n}
              </Link>
            ),
          )}
          {item("다음", pg.page + 1, pg.page === pg.pageCount)}
          {item("마지막", pg.pageCount, pg.page === pg.pageCount)}
        </nav>
      )}
    </div>
  );
}
