import { Suspense } from "react";
import { headers } from "next/headers";
import { connection } from "next/server";
import { checkClaudeHealth } from "@/lib/ai/health";
import { buildBookmarkletCode } from "@/lib/bookmarklet/code";
import { getOrCreateBookmarkletToken } from "@/lib/bookmarklet/token";
import { latestBackupAt } from "@/lib/backup";
import { config } from "@/lib/config";
import { formatDateTime } from "@/lib/domain/dates";
import { getModelFor, getSetting } from "@/lib/settings";
import { ClaudeStatus } from "./ClaudeStatus";
import { ModelSelects } from "./ModelSelects";
import { summarizeUploads, uploadsInUse } from "@/lib/uploads/cleanup";
import { UploadsCleanup } from "./UploadsCleanup";
import { BookmarkletCard } from "./BookmarkletCard";

/** 설정 화면을 연 주소(평소 http://127.0.0.1:3939)를 북마크 버튼의 앱 주소로 쓴다. 이상한 Host 값은 쓰지 않는다. */
function appOriginFrom(host: string | null): string {
  return host && /^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(host) ? `http://${host}` : "http://127.0.0.1:3939";
}

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
  const uploads = summarizeUploads();
  const uploadsBusy = uploadsInUse();
  const bm = getOrCreateBookmarkletToken();
  const bookmarkletCode = buildBookmarkletCode({
    token: bm.token,
    appOrigin: appOriginFrom((await headers()).get("host")),
  });
  const models = {
    analyze_posting: getModelFor("analyze_posting"),
    import_resume: getModelFor("import_resume"),
    import_applications: getModelFor("import_applications"),
    tailor_resume: getModelFor("tailor_resume"),
    revise_tailored: getModelFor("revise_tailored"),
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

      <BookmarkletCard code={bookmarkletCode} createdAt={bm.createdAt.slice(0, 10)} />

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
        <UploadsCleanup count={uploads.count} bytes={uploads.bytes} busy={uploadsBusy} />
      </div>
    </>
  );
}
