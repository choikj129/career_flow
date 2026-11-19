"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/_actions/types";
import { useToast } from "./Toast";

/**
 * 서버 액션 호출 보조. 진행 중 표시, 오류 메시지, 성공 알림을 한곳에서 처리한다.
 * 성공하면 알림을 띄우고 onOk를 부른다. 화면 갱신은 서버 액션이 refresh()로 한다.
 */
export function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  function run(fn: () => Promise<ActionResult | void>, onOk?: () => void, onFail?: () => void) {
    setError(null);
    start(async () => {
      const r = await fn();
      // redirect()로 끝나는 액션은 값이 없다. 페이지가 이동하므로 더 할 일이 없다.
      if (!r) return;
      if (!r.ok) {
        setError(r.error);
        onFail?.();
        return;
      }
      if (r.notice) toast(r.notice);
      onOk?.();
    });
  }
  return { pending, error, setError, run };
}
