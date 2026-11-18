"use client";

import { useRouter } from "next/navigation";

/** 눌러서 다른 화면으로 가는 표 행(키보드 Enter도 된다) */
export function ClickableRow({
  href,
  dim,
  children,
}: {
  href: string;
  dim?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <tr
      className={`row-link${dim ? " dim" : ""}`}
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === "Enter") router.push(href);
      }}
    >
      {children}
    </tr>
  );
}
