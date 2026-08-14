import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

import { ThemeProvider } from "@/components/theme-provider";
import { ScaleProvider } from "@/components/scale-provider";

export const metadata: Metadata = {
  title: "Quản lý cửa hàng - Hàng hóa và mã QR",
  description: "Hệ thống quản lý hàng hóa, tồn kho, ảnh sản phẩm và quét mã QR cho cửa hàng.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-slate-50 dark:bg-slate-50 dark:bg-[#090d16] text-slate-900 dark:text-slate-100 selection:bg-indigo-500 selection:text-slate-900 dark:text-white transition-colors duration-300">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <ScaleProvider>{children}</ScaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
