import { formatDateTime } from "@/lib/domain/dates";
import { getLatestKit, listKitSummaries, readKitDoc } from "@/lib/kit/repo";
import { pairParts, type PairRow } from "@/lib/kit/pairs";
import type { KitFile, KitParsed } from "@/lib/kit/types";
import { kitDisplayName } from "@/lib/tailored/view";
import { KitUpload } from "./KitUpload";

const ROLE_LABEL: Record<KitFile["role"], string> = {
  guide: "가이드",
  rules: "작성 규칙",
  master: "마스터스토리",
  resume: "이력서",
  career: "경력기술서",
  style: "PDF 스타일",
};

const fileLabel = (f: KitFile) => (f.track ? `${ROLE_LABEL[f.role]}(${f.track})` : ROLE_LABEL[f.role]);

/** 서류 키트 탭(화면 문서 5.6). 키트 파일의 내용(자기소개·경력·수치)은 보이지 않고 구조(이름·개수·순서)만 보인다 */
export function KitTab() {
  const kit = getLatestKit();
  const history = listKitSummaries();
  return (
    <div className="tl" data-testid="kit-tab">
      <div className="card tl-box">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 18, margin: 0 }}>서류 키트</h2>
            {kit ? (
              <p style={{ margin: "4px 0 0" }} data-testid="kit-current">
                <b>{kitDisplayName(kit.id, kit.label)}</b> · {formatDateTime(kit.createdAt)} 올림
              </p>
            ) : (
              <p className="muted" style={{ margin: "4px 0 0" }} data-testid="kit-empty">
                아직 서류 키트가 없습니다. 가이드·작성 규칙·마스터스토리·기본 서류 md를 한 번에 골라 올리세요.
              </p>
            )}
          </div>
          <KitUpload />
        </div>
        {kit && kit.files.length > 0 && (
          <p style={{ margin: "12px 0 0" }} data-testid="kit-files">
            <span className="muted small">파일</span> {kit.files.map(fileLabel).join(" · ")}
          </p>
        )}
        <p className="muted small" style={{ margin: "10px 0 0" }}>
          원본을 고치면 고친 파일을 포함해 키트 전체를 다시 올립니다. 같은 내용이면 새 버전을 만들지 않습니다. 이전 버전은 지우지 않습니다(옛 맞춤본이 그 키트를 씁니다).
        </p>
      </div>

      {kit && kit.errors.length > 0 && (
        <div className="fail-card" role="alert" data-testid="kit-errors">
          <h3>읽기 오류 {kit.errors.length}건</h3>
          <p style={{ margin: "0 0 6px" }}>오류가 있는 키트로는 맞춤본을 만들 수 없습니다. 원본을 고쳐 다시 올리세요.</p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {kit.errors.map((e, i) => (
              <li key={i} style={{ overflowWrap: "anywhere" }}>
                <b>{e.file}</b> · {e.where} — {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {kit?.parsed && <ParsedKit kitId={kit.id} parsed={kit.parsed} />}

      {history.length > 0 && (
        <div className="card tl-box" data-testid="kit-history">
          <h3>키트 기록</h3>
          <p style={{ margin: 0 }}>
            {history.map((h, i) => (
              <span key={h.id}>
                {i > 0 ? " · " : ""}
                {kitDisplayName(h.id, h.label)} {formatDateTime(h.createdAt)}
                {h.errorCount > 0 ? `(오류 ${h.errorCount})` : ""}
              </span>
            ))}
          </p>
        </div>
      )}

      <details className="card tl-box" data-testid="kit-format">
        <summary>키트 형식 (앱이 가이드에서 찾는 구획)</summary>
        <p className="muted small">가이드의 구획은 제목에 들어 있는 글자로 찾습니다(번호는 상관없습니다). 형식이 맞지 않으면 위 오류 목록에 어느 구획·어느 줄인지 나옵니다.</p>
        <ul className="plain">
          <li><b>기본 서류</b> 표: 직무 / 이력서 / 경력기술서 / 기본 프로필</li>
          <li><b>번호표</b>: 굵은 줄 <code>**{"{직무}"} 이력서**</code> 아래 핵심 역량(ⓐ ⓑ…), 주요 성과(1 2…), 경력기술서, 개인 프로젝트</li>
          <li><b>### {"{직무}"}</b> 아래 프로필 표: 프로필 / 공고 단어 / ① 자기소개 / ② 핵심 역량 / ③ 주요 성과 / ⑤ 경력기술서 / ④ 개인 프로젝트</li>
          <li><b>추가 조정</b> 목록: <code>- 공고에 **단어, 단어**가 있으면: 할 일</code></li>
          <li><b>자기소개 후보</b>: <code>**id 이름**</code> 다음 인용 블록</li>
          <li><b>허용 범위</b> 표: 원래 표현 / 바꿔도 되는 표현 / 쓰면 안 되는 표현</li>
          <li><b>체크리스트</b>: <code>- [ ] …</code></li>
        </ul>
      </details>
    </div>
  );
}

function ParsedKit({ kitId, parsed }: { kitId: number; parsed: KitParsed }) {
  const pairs = parsed.tracks.map((t) => {
    let rows: PairRow[] = [];
    try {
      rows = pairParts(t, readKitDoc(kitId, t.name, "resume"), readKitDoc(kitId, t.name, "career"));
    } catch {
      /* 파일을 읽을 수 없으면 짝 표를 건너뛴다 */
    }
    return { track: t, rows };
  });
  const adjCount = (track: string) => parsed.adjustments.filter((a) => a.track === track).length;
  return (
    <div className="card tl-box" data-testid="kit-parsed">
      <h3>읽은 내용</h3>
      <dl className="kv" style={{ gridTemplateColumns: "88px minmax(0,1fr)" }}>
        <dt>직무</dt>
        <dd data-testid="kit-tracks">{parsed.tracks.map((t) => `${t.name}(기본 ${t.defaultProfileId})`).join(" · ")}</dd>
        <dt>추가 조정</dt>
        <dd>{parsed.tracks.map((t) => `${t.name} ${adjCount(t.name)}`).join(" · ")}</dd>
        <dt>허용 범위</dt>
        <dd>{parsed.terms.length}줄</dd>
        <dt>체크리스트</dt>
        <dd>{parsed.checklist.length}개</dd>
      </dl>

      <h3 style={{ marginTop: 16 }}>프로필</h3>
      <div className="kit-scroll">
        <table className="kit-table" data-testid="kit-profiles">
          <thead>
            <tr>
              <th>직무</th>
              <th>프로필</th>
              <th>공고 단어</th>
              <th>자기소개</th>
              <th>핵심 역량 · 주요 성과 · 장 순서</th>
              <th>개인 프로젝트</th>
            </tr>
          </thead>
          <tbody>
            {parsed.profiles.map((p) => (
              <tr key={`${p.track}-${p.id}`}>
                <td>{p.track}</td>
                <td>
                  <b>{p.id}</b> {p.name}
                  {p.isDefault ? <span className="tag-rec">기본</span> : null}
                </td>
                <td>{p.keywords.join(", ")}</td>
                <td>{p.introId}</td>
                <td>
                  {p.competencyOrder.map((i) => "ⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛ"[i] ?? i + 1).join(" ")} · {p.achievementOrder.map((i) => i + 1).join(" ")} · {p.chapterOrder.map((i) => i + 1).join(" ")}
                </td>
                <td>{p.projects.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ marginTop: 16 }}>부품 짝</h3>
      <p className="muted small" style={{ margin: "0 0 6px" }}>번호표의 이름이 기본 서류의 어느 항목과 짝지어졌는지 확인하세요.</p>
      {pairs.map(({ track, rows }) => (
        <div key={track.name} className="kit-scroll" style={{ marginBottom: 12 }}>
          <table className="kit-table" data-testid={`kit-pairs-${track.name}`}>
            <caption style={{ textAlign: "left", fontWeight: 700, padding: "4px 12px" }}>{track.name}</caption>
            <thead>
              <tr>
                <th>서류</th>
                <th>부품</th>
                <th>번호표 이름</th>
                <th>기본 서류에서 찾은 것</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.doc === "resume" ? "이력서" : "경력기술서"}</td>
                  <td>{r.part}</td>
                  <td>{r.name}</td>
                  <td>{r.found ?? <span style={{ color: "var(--mark)" }}>찾지 못함</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
