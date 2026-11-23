import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";
import { ToastProvider } from "@/components/Toast";
import BottomNav from "@/components/BottomNav";
import OrderWatcher from "@/components/LazyOrderWatcher";
import StreamStatus from "@/components/StreamStatus";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "주식 AI 분석기",
  description: "한국 주식 기술적 분석 + AI 예측",
  // iOS 홈 화면 앱: 아이콘 아래 이름, 브라우저 UI 없이 실행 (아이콘은 app/apple-icon.png)
  appleWebApp: { capable: true, title: "stock", statusBarStyle: "default" },
};

export const viewport = { themeColor: "#F0F4F8" };

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AuthProvider>
          <ToastProvider>
            {children}
            <BottomNav />
            <OrderWatcher />
            <StreamStatus />
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}