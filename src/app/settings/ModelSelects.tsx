"use client";

import { setModelAction } from "@/app/_actions/settings";
import { useAction } from "@/app/_components/useAction";

const ROWS = [
  { type: "analyze_posting", label: "공고 분석" },
  { type: "import_resume", label: "이력서 가져오기" },
  { type: "import_applications", label: "지원 내역 가져오기" },
] as const;
const CHOICES = ["opus", "sonnet", "haiku"];

export function ModelSelects({ models }: { models: Record<(typeof ROWS)[number]["type"], string> }) {
  const { pending, error, run } = useAction();
  return (
    <>
      <table>
        <thead>
          <tr>
            <th style={{ paddingLeft: 0 }}>작업</th>
            <th>모델</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.type}>
              <td style={{ paddingLeft: 0 }}>{r.label}</td>
              <td>
                <select
                  className="in"
                  style={{ width: 130 }}
                  aria-label={`${r.label} 모델`}
                  defaultValue={models[r.type]}
                  disabled={pending}
                  onChange={(e) => run(() => setModelAction(r.type, e.target.value))}
                >
                  {CHOICES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error ? <p className="field-err">{error}</p> : null}
    </>
  );
}
