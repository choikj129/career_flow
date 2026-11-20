"use client";

import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { validDate } from "@/lib/domain/dates";

/** 숫자만 쳐도 YYYY-MM-DD 모양이 되게 하이픈을 넣는다. 숫자·하이픈 외 글자는 버린다. */
export function formatDateText(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "lang" | "value" | "onChange" | "defaultValue"> & {
  value: string;
  onChange?: (e: { target: { value: string } }) => void;
};

/**
 * 날짜 칸: 보이는 칸은 YYYY-MM-DD 텍스트이고, 오른쪽 달력 버튼이 숨긴 date 입력의 달력을 연다.
 * (브라우저의 date 입력은 한국어 Windows에서 "2026-11-20 ()"처럼 빈 요일 칸이 보여 쓰지 않는다.)
 * 값은 늘 YYYY-MM-DD이고, 완성되지 않았거나 잘못된 글자는 "" 로 알린다(폼 검증은 그 글자를 막는다).
 */
export function DateInput({ value, onChange, className, style, ...rest }: Props) {
  const [text, setText] = useState(value);
  const textRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);

  // 밖에서 값이 바뀌면(예: 주소 이동) 칸에도 반영한다. 입력 중인 미완성 글자는 건드리지 않는다.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (validDate(value) && value !== text) setText(value);
    else if (value === "" && validDate(text)) setText("");
  }

  useEffect(() => {
    textRef.current?.setCustomValidity(text && !validDate(text) ? "올바른 날짜(YYYY-MM-DD)를 입력하세요" : "");
  }, [text]);

  const emit = (next: string) => {
    setText(next);
    onChange?.({ target: { value: validDate(next) ? next : "" } });
  };

  const openPicker = () => {
    const el = pickerRef.current;
    if (!el) return;
    el.value = validDate(text) ? text : "";
    try {
      el.showPicker();
    } catch {
      el.focus();
      el.click();
    }
  };

  return (
    <span className="date-input" style={style}>
      <input
        {...rest}
        ref={textRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="YYYY-MM-DD"
        maxLength={10}
        className={className}
        value={text}
        onChange={(e) => emit(formatDateText(e.target.value))}
      />
      <button type="button" className="date-input-btn" aria-label="달력 열기" onClick={openPicker}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <rect x="2" y="3" width="12" height="11" rx="1.5" />
          <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
        </svg>
      </button>
      <input
        ref={pickerRef}
        type="date"
        className="date-input-picker"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          if (e.target.value) emit(e.target.value);
        }}
      />
    </span>
  );
}
