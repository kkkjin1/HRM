import type { Metadata, Viewport } from "next";
import "./globals.css";
import { MembersProvider } from "@/lib/MembersProvider";

export const metadata: Metadata = {
  title: "인사관리팀",
  description: "인사관리팀 공용 업무 기록",
  // 폰에서 "홈 화면에 추가"로 열면 주소창 없이 앱처럼 — 야구 위젯 가로 풀화면 몰입용
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "인사관리팀", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" style={{ colorScheme: "light" }} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/static/pretendard.css" />
      </head>
      <body className="antialiased font-sans" suppressHydrationWarning>
        <MembersProvider>{children}</MembersProvider>
      </body>
    </html>
  );
}
