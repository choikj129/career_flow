"use client";

import { useActionState, useState } from "react";
import { uploadResumeFilesAction, type UploadState } from "@/app/_actions/resume";
import { checkUpload } from "@/lib/uploads/check";

type Picked = { name: string; reason?: string };

/** 처음 등록: 파일(여러 개)과 텍스트 붙여넣기. docs/spec/screens.md 5.1 */
export function UploadForm() {
  const [state, action, pending] = useActionState<UploadState, FormData>(uploadResumeFilesAction, null);
  const [files, setFiles] = useState<Picked[]>([]);
  const [text, setText] = useState("");
  const usable = files.filter((f) => !f.reason).length;
  const empty = usable === 0 && !text.trim();

  return (
    <form action={action} className="card" style={{ padding: 28 }}>
      <h2 style={{ fontSize: 19, margin: 0 }}>기존 이력서를 올려 시작하세요.</h2>
      <p className="muted small" style={{ margin: "6px 0 0" }}>
        이력서·경력기술서·포트폴리오를 여러 개 올릴 수 있습니다. 올린 내용을 항목별로 정리해 보여 드리고, 저장은 직접 확인한 뒤에 합니다.
      </p>

      <label className="label" htmlFor="files" style={{ marginTop: 20 }}>
        파일 선택 <span className="muted" style={{ fontWeight: 400 }}>(PDF·DOCX·TXT·MD, 한 번에 10개까지, 파일당 20MB까지)</span>
      </label>
      <input
        id="files"
        name="files"
        type="file"
        multiple
        accept=".pdf,.docx,.txt,.md"
        onChange={(e) =>
          setFiles(
            Array.from(e.target.files ?? []).map((f) => {
              const c = checkUpload(f.name, f.size, "resume");
              return { name: f.name, reason: c.ok ? undefined : c.reason };
            }),
          )
        }
      />
      {files.length > 0 && (
        <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          {files.map((f, i) => (
            <li key={i} className={f.reason ? "field-err" : "small"} style={f.reason ? { margin: 0 } : undefined}>
              {f.name}
              {f.reason ? ` — ${f.reason} 이 파일은 제외됩니다.` : ""}
            </li>
          ))}
        </ul>
      )}

      <label className="label" htmlFor="pastedText" style={{ marginTop: 20 }}>
        또는 텍스트 붙여넣기
      </label>
      <textarea
        id="pastedText"
        name="pastedText"
        className="field-area"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="이력서 내용을 붙여넣으세요."
      />

      {state?.error ? <p className="field-err">{state.error}</p> : null}
      {state?.rejected?.map((r) => (
        <p key={r.name} className="field-err" style={{ margin: "4px 0 0" }}>
          {r.name}: {r.reason}
        </p>
      ))}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 22 }}>
        <a className="btn" href="/resume?manual=1">
          직접 입력으로 시작
        </a>
        <button type="submit" className="btn primary" disabled={empty || pending}>
          {pending ? "올리는 중…" : "가져오기"}
        </button>
      </div>
    </form>
  );
}
