"use client";

import { reanalyzeAction } from "@/app/_actions/postings";
import { useAction } from "@/app/_components/useAction";

/** [다시 시도] / [다시 분석]. 분석 작업을 새로 큐에 넣는다. */
export function RetryButton({
  postingId,
  label = "다시 시도",
  small,
  disabled,
}: {
  postingId: number;
  label?: string;
  small?: boolean;
  disabled?: boolean;
}) {
  const { pending, error, run } = useAction();
  return (
    <span>
      <button
        type="button"
        className={`btn ${small ? "sm" : ""}`}
        disabled={pending || disabled}
        onClick={() => run(() => reanalyzeAction(postingId))}
      >
        {label}
      </button>
      {error ? <span className="field-err"> {error}</span> : null}
    </span>
  );
}
