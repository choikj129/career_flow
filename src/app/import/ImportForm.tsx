"use client";

import { useActionState, useState } from "react";
import { startApplicationImportAction, type ImportStartState } from "@/app/_actions/import";
import { SITE_IDS, SITE_LABELS } from "@/lib/domain/types";
import { checkUpload } from "@/lib/uploads/check";

type Picked = { name: string; reason?: string };

/** 입력 단계: 사이트, 텍스트, 캡처 이미지. docs/spec/screens.md 6.1 */
export function ImportForm() {
  const [state, action, pending] = useActionState<ImportStartState, FormData>(startApplicationImportAction, null);
  const [site, setSite] = useState<string>("");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Picked[]>([]);
  const empty = !text.trim() && files.filter((f) => !f.reason).length === 0;

  return (
    <form action={action} className="card" style={{ padding: "22px 24px", maxWidth: 820, marginTop: 16 }}>
      <span className="label">사이트</span>
      <div className="opts">
        {SITE_IDS.map((s) => (
          <label key={s}>
            <input type="radio" name="site" value={s} checked={site === s} onChange={() => setSite(s)} />
            <span className={`site ${s}`}>{SITE_LABELS[s]}</span>
          </label>
        ))}
        <label>
          <input type="radio" name="site" value="" checked={site === ""} onChange={() => setSite("")} />
          모름
        </label>
      </div>
      <p className="hint">사이트를 모르면 &quot;모름&quot;을 고르세요. 검토 단계에서 행마다 고칠 수 있습니다.</p>

      <label className="label" htmlFor="pastedText" style={{ marginTop: 16 }}>
        텍스트
      </label>
      <textarea
        id="pastedText"
        name="pastedText"
        className="field-area"
        style={{ minHeight: 140 }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="지원 현황 화면을 전체 선택(Ctrl+A)해 복사한 내용"
      />

      <label className="label" htmlFor="images" style={{ marginTop: 16 }}>
        캡처 이미지 <span className="muted" style={{ fontWeight: 400 }}>(PNG·JPG, 여러 장, 파일당 20MB까지)</span>
      </label>
      <div className="drop">
        <input
          id="images"
          name="images"
          type="file"
          multiple
          accept=".png,.jpg,.jpeg"
          onChange={(e) =>
            setFiles(
              Array.from(e.target.files ?? []).map((f) => {
                const c = checkUpload(f.name, f.size, "image");
                return { name: f.name, reason: c.ok ? undefined : c.reason };
              }),
            )
          }
        />
      </div>
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

      {state?.error ? <p className="field-err">{state.error}</p> : null}
      {state?.rejected?.map((r) => (
        <p key={r.name} className="field-err" style={{ margin: "4px 0 0" }}>
          {r.name}: {r.reason}
        </p>
      ))}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <button type="submit" className="btn primary" disabled={empty || pending}>
          {pending ? "올리는 중…" : "추출하기"}
        </button>
      </div>
    </form>
  );
}
