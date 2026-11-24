import { Suspense } from "react";
import { connection } from "next/server";
import { listSiteNotes } from "@/lib/postings/repo";
import { getLatestResume } from "@/lib/resume/repo";
import { NewPostingForm } from "./NewPostingForm";

export default function NewPostingPage() {
  return (
    <main className="page">
      <div className="narrow" style={{ maxWidth: 720, margin: "24px auto 0" }}>
        <h1 style={{ fontSize: 26 }}>공고 등록</h1>
        <p className="desc">공고 링크를 넣으면 바로 분석을 시작합니다. 보통 1~3분 걸립니다.</p>
        <Suspense fallback={<div className="card" style={{ marginTop: 20, padding: 32 }} />}>
          <FormLoader />
        </Suspense>
      </div>
    </main>
  );
}

async function FormLoader() {
  await connection();
  return <NewPostingForm hasResume={getLatestResume() != null} siteNotes={listSiteNotes()} />;
}
