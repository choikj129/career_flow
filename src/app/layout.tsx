import type { Metadata } from "next";
import localFont from "next/font/local";
import { Suspense } from "react";
import { Nav } from "./_components/Nav";
import { ToastProvider } from "./_components/Toast";
import "./globals.css";

const pretendard = localFont({
  src: "../../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  variable: "--font-pretendard",
  weight: "45 920",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Career Flow",
  description: "개인 취업 활동 관리·분석 도구",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={pretendard.variable}>
      <body>
        <ToastProvider>
          <Suspense fallback={null}>
            <Nav />
          </Suspense>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
