"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useToast } from "@/app/_components/Toast";

type UploadResponse =
  | { ok: true; unchanged: boolean; kitId: number; errorCount: number }
  | { ok: false; error: string };

/** [키트 파일 올리기]: 파일 여러 개(md 10개까지 + 스타일 1개, 파일당 1MB)를 골라 올린다. 같은 내용이면 새 버전을 만들지 않는다 */
export function KitUpload() {
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [names, setNames] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async () => {
    const files = Array.from(input.current?.files ?? []);
    if (files.length === 0) return;
    setPending(true);
    setError(null);
    try {
      const form = new FormData();
      for (const f of files) form.append("files", f);
      const res = await fetch("/api/kit", { method: "POST", body: form });
      const body = (await res.json()) as UploadResponse;
      if (!body.ok) {
        setError(body.error);
        return;
      }
      if (body.unchanged) toast("바뀐 파일이 없습니다. 새 버전을 만들지 않았습니다");
      else toast(body.errorCount > 0 ? `키트를 올렸습니다. 읽기 오류 ${body.errorCount}건이 있습니다` : "키트를 올렸습니다");
      if (input.current) input.current.value = "";
      setNames([]);
      router.refresh();
    } catch {
      setError("올리지 못했습니다. 잠시 뒤에 다시 시도하세요");
    } finally {
      setPending(false);
    }
  };

  return (
    <div data-testid="kit-upload" style={{ display: "grid", gap: 8, justifyItems: "end" }}>
      <div className="tl-actions">
        <label className="btn" style={{ cursor: "pointer" }}>
          키트 파일 고르기
          <input
            ref={input}
            type="file"
            multiple
            accept=".md,.css,.py"
            aria-label="키트 파일"
            className="sr-only"
            onChange={(e) => setNames(Array.from(e.target.files ?? []).map((f) => f.name))}
          />
        </label>
        <button type="button" className="btn primary" disabled={pending || names.length === 0} onClick={upload}>
          {pending ? "올리는 중…" : "키트 파일 올리기"}
        </button>
      </div>
      {names.length > 0 && (
        <ul className="small muted" style={{ margin: 0, paddingLeft: 18, textAlign: "left", maxWidth: 420 }}>
          {names.map((n) => (
            <li key={n} style={{ overflowWrap: "anywhere" }}>
              {n}
            </li>
          ))}
        </ul>
      )}
      {error ? <p className="field-err" role="alert" style={{ margin: 0 }}>{error}</p> : null}
    </div>
  );
}
