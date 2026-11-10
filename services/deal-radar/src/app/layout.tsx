import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "全球优惠雷达 · PT Universe",
  description: "每两小时聚合 Epic 官方活动、软件优惠、社区福利与美国折扣。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f8fa",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-dvh bg-[#f7f8fa] font-sans text-[#292d34] antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
