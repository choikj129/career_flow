"use client";

import { openSiteLoginAction } from "@/app/_actions/settings";
import { SiteBadge } from "@/app/_components/SiteBadge";
import { useAction } from "@/app/_components/useAction";

const SITES = ["remember", "wanted", "groupby", "jobkorea"] as const;

export function SiteLoginButtons({ busy }: { busy: boolean }) {
  const { pending, error, run } = useAction();
  return (
    <>
      <div className="cols4">
        {SITES.map((s) => (
          <div className="login-site" key={s}>
            <SiteBadge site={s} large />
            <button type="button" className="btn sm" disabled={busy || pending} onClick={() => run(() => openSiteLoginAction(s))}>
              로그인 창 열기
            </button>
          </div>
        ))}
      </div>
      {busy && <p className="muted small" style={{ margin: "10px 0 0" }}>분석 작업이 끝난 뒤 시도하세요.</p>}
      {error ? <p className="field-err">{error}</p> : null}
    </>
  );
}
