import { Suspense } from "react";
import { connection } from "next/server";
import { checkClaudeHealth } from "@/lib/ai/health";
import { latestBackupAt } from "@/lib/backup";
import { config } from "@/lib/config";
import { formatDateTime } from "@/lib/domain/dates";
import { isBrowserBusy } from "@/lib/extract/browser";
import { getModelFor, getSetting } from "@/lib/settings";
import { ClaudeStatus } from "./ClaudeStatus";
import { ModelSelects } from "./ModelSelects";
import { SiteLoginButtons } from "./SiteLoginButtons";

export default function SettingsPage() {
  return (
    <main className="page">
      <div className="settings">
        <h1 style={{ fontSize: 26 }}>설정</h1>
        <Suspense fallback={<div className="card form-card muted" style={{ marginTop: 20 }}>불러오는 중…</div>}>
          <SettingsBody />
        </Suspense>
      </div>
    </main>
  );
}

function lastLoginCheck(): { at: string; loggedIn: boolean } | null {
  const raw = getSetting("claude.loginCheck");
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return typeof v?.at === "string" && typeof v?.loggedIn === "boolean" ? v : null;
  } catch {
    return null;
  }
}

async function SettingsBody() {
  await connection();
  // 설치 확인(claude --version)만 자동으로 한다. 로그인 확인은 버튼을 눌렀을 때만 한다.
  const health = await checkClaudeHealth();
  const backup = latestBackupAt();
  const models = {
    analyze_posting: getModelFor("analyze_posting"),
    import_resume: getModelFor("import_resume"),
    import_applications: getModelFor("import_applications"),
  };
  return (
    <>
      <div className="card form-card" style={{ marginTop: 20 }}>
        <h2>Claude Code</h2>
        <ClaudeStatus
          installed={health.installed}
          version={health.version}
          message={health.message}
          last={lastLoginCheck()}
        />
      </div>

      <div className="card form-card">
        <h2>작업별 모델</h2>
        <p className="muted small" style={{ margin: "0 0 8px" }}>바꾸면 바로 저장됩니다.</p>
        <ModelSelects models={models} />
      </div>

      <div className="card form-card">
        <h2>사이트 로그인</h2>
        <p className="muted small" style={{ margin: 0 }}>
          로그인이 필요한 공고를 읽을 때 쓰는 브라우저입니다. 열린 창에서 직접 로그인한 뒤 창을 닫으세요. 앱은 비밀번호를 저장하지 않습니다.
        </p>
        <SiteLoginButtons busy={isBrowserBusy()} />
      </div>

      <div className="card form-card">
        <h2>데이터</h2>
        <div className="toolbar">
          <span>
            데이터 폴더 <span className="mono-path">{config.dataDir}</span>
          </span>
        </div>
        <p className="muted small" style={{ margin: "10px 0 0" }}>
          최근 자동 백업: {backup ? formatDateTime(backup) : "아직 없음"}
        </p>
      </div>
    </>
  );
}
