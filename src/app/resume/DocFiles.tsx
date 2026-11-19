import { DOC_KINDS, DOC_KIND_LABELS } from "@/lib/documents/files";
import { listDocFiles } from "@/lib/documents/folder";
import { countDocsNotesPending, countDocUsage } from "@/lib/documents/migrate";
import { MigrateDocsButton } from "./MigrateDocsButton";

/** "서류 파일" 탭: data/documents 폴더의 파일 목록. 등록·삭제 버튼은 없다. docs/spec/screens.md 5.5 */
export function DocFiles() {
  const { files, ignored } = listDocFiles();
  const usage = countDocUsage();
  const pending = countDocsNotesPending();
  return (
    <div data-testid="doc-files">
      <p className="muted small" style={{ margin: "0 0 12px" }}>
        파일은 <code>data/documents/resume|career|portfolio</code> 폴더에 <code>이력서_YYYYMMDD.pdf</code> 이름으로 넣으면 목록에 나옵니다.
      </p>
      {DOC_KINDS.map((k) => {
        const list = files.filter((f) => f.kind === k);
        return (
          <div key={k} className="card" style={{ padding: "14px 18px", marginBottom: 12 }}>
            <b>{DOC_KIND_LABELS[k]}</b>
            {list.length === 0 ? (
              <p className="muted small" style={{ margin: "6px 0 0" }}>파일이 없습니다.</p>
            ) : (
              <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0 }}>
                {list.map((f) => (
                  <li key={f.fileName} style={{ display: "flex", gap: 16, alignItems: "baseline", padding: "3px 0" }}>
                    <span style={{ width: 100 }}>{f.date}</span>
                    <span className="muted small" style={{ width: 90 }}>기록 {usage.get(f.fileName) ?? 0}건</span>
                    <a href={`/api/documents/${encodeURIComponent(f.fileName)}`} target="_blank" rel="noopener">
                      보기
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      {ignored.length > 0 && (
        <p className="muted small">이름 규칙에 맞지 않아 쓰지 않는 파일: {ignored.join(", ")}</p>
      )}
      {pending > 0 && <MigrateDocsButton pendingCount={pending} />}
    </div>
  );
}
