import { DOC_KINDS, DOC_KIND_LABELS, parseDocFileName, type DocKind, type SubmittedDocs as Docs } from "@/lib/documents/files";

/** 제출 서류 세 줄: 종류, 날짜, [보기]. 파일이 없어졌으면 "파일 없음", 기록에 없으면 "모름". docs/spec/screens.md 5.5 */
export function SubmittedDocs({ docs, exists }: { docs: Docs | null; exists: Record<DocKind, boolean> }) {
  return (
    <div data-testid="submitted-docs">
      <b style={{ fontSize: 13.5 }}>제출 서류</b>
      <ul style={{ listStyle: "none", margin: "4px 0 0", padding: 0 }}>
        {DOC_KINDS.map((k) => {
          const name = docs?.[k] ?? null;
          const f = name ? parseDocFileName(name) : null;
          return (
            <li key={k} style={{ display: "flex", gap: 12, alignItems: "baseline", fontSize: 13.5, padding: "2px 0" }}>
              <span style={{ width: 80 }}>{DOC_KIND_LABELS[k]}</span>
              {name && f ? (
                <>
                  <span>{f.date}</span>
                  {exists[k] ? (
                    <a href={`/api/documents/${encodeURIComponent(name)}`} target="_blank" rel="noopener">
                      보기
                    </a>
                  ) : (
                    <span className="muted small">파일 없음</span>
                  )}
                </>
              ) : (
                <span className="muted">모름</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
