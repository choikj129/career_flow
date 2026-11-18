"use client";

import { useState } from "react";
import { provideTextAction } from "@/app/_actions/postings";
import { useAction } from "@/app/_components/useAction";

/** 본문을 붙여넣어 다시 분석한다(본문 추출 실패, 공고 원문 탭의 [본문 다시 붙여넣기]). */
export function PasteForm({
  postingId,
  buttonLabel = "이 내용으로 분석",
  placeholder = "공고 페이지에서 본문을 복사해 붙여넣으세요.",
}: {
  postingId: number;
  buttonLabel?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const { pending, error, run } = useAction();
  return (
    <form
      className="mini-form"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => provideTextAction(postingId, text),
          () => setText(""),
        );
      }}
    >
      <textarea
        className="field-area"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label="공고 본문"
      />
      <div>
        <button type="submit" className="btn primary" disabled={pending || !text.trim()}>
          {buttonLabel}
        </button>
      </div>
      {error ? <p className="field-err">{error}</p> : null}
    </form>
  );
}
