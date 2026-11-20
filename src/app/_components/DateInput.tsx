import type { InputHTMLAttributes } from "react";

/**
 * 날짜 선택 칸. 한국어 Windows에서 브라우저가 시스템 날짜 형식의 요일 칸을 비워 "2026-11-20 ()"처럼 보이는 일이 있어,
 * 칸의 언어를 en-CA(yyyy-mm-dd, 요일 없음)로 지정한다. 값은 늘 YYYY-MM-DD다.
 */
export function DateInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "lang">) {
  return <input {...props} type="date" lang="en-CA" />;
}
