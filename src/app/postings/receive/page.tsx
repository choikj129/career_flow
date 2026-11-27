import { Suspense } from "react";
import { connection } from "next/server";
import { listSiteNotes } from "@/lib/postings/repo";
import { getLatestResume } from "@/lib/resume/repo";
import { ReceiveBookmarklet } from "./ReceiveBookmarklet";

/** 북마크 버튼이 보낸 공고를 받는 화면. docs/spec/screens.md 2.1 */
export default function ReceivePostingPage() {
  return (
    <main className="page">
      <div className="narrow" style={{ maxWidth: 720, margin: "24px auto 0" }}>
        <h1 style={{ fontSize: 26 }}>공고 받기</h1>
        <Suspense fallback={<div className="card" style={{ marginTop: 20, padding: 32 }} />}>
          <Loader />
        </Suspense>
      </div>
    </main>
  );
}

async function Loader() {
  await connection();
  return <ReceiveBookmarklet hasResume={getLatestResume() != null} siteNotes={listSiteNotes()} />;
}
