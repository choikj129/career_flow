import { DOC_KINDS, DOC_KIND_LABELS, docFileOf, isDocNone, parseDocFileName, type DocKind, type SubmittedDocs as Docs } from "@/lib/documents/files";

/**
 * 제출 서류 세 줄: 종류, 날짜, [보기]. 파일이 없어졌으면 "파일 없음", 내지 않았으면 "없음", 기록에 없으면 "모름". docs/spec/screens.md 5.5
 * resume이 있으면(맞춤본·기본 서류·예전 기본 이력서) 이력서 줄을 그 이름과 [보기]로 대신한다(3단계, D-25: PDF는 그때그때 만든다).
 */
export function SubmittedDocs({
  docs,
  exists,
  resume,
}: {
  docs: Docs | null;
  exists: Record<DocKind, boolean>;
  resume?: { label: string; href: string | null } | null;
}) {
  const allUnknown = !resume && DOC_KINDS.every((k) => docs?.[k] == null);
  if (allUnknown) {
    return (
      <div data-testid="submitted-docs" style={{ fontSize: 13.5 }}>
        <b>제출 서류</b> <span className="muted" style={{ marginLeft: 12 }}>모름</span>
      </div>
    );
  }
  return (
    <div data-testid="submitted-docs">
      <b style={{ fontSize: 13.5 }}>제출 서류</b>
      <ul style={{ listStyle: "none", margin: "4px 0 0", padding: 0 }}>
        {DOC_KINDS.map((k) => {
          const value = docs?.[k] ?? null;
          const name = docFileOf(value);
          const f = name ? parseDocFileName(name) : null;
          return (
            <li key={k} style={{ display: "flex", gap: 12, alignItems: "baseline", fontSize: 13.5, padding: "2px 0" }}>
              <span style={{ width: 80, flex: "none" }}>{DOC_KIND_LABELS[k]}</span>
              {k === "resume" && resume ? (
                <>
                  <span data-testid="resume-line" style={{ minWidth: 0, overflowWrap: "anywhere" }}>{resume.label}</span>
                  {resume.href ? (
                    <a href={resume.href} target="_blank" rel="noopener">
                      보기
                    </a>
                  ) : null}
                </>
              ) : name && f ? (
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
              ) : isDocNone(value) ? (
                <span data-testid={`doc-none-${k}`}>없음</span>
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
