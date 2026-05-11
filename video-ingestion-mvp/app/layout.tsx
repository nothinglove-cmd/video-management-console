import type { Metadata } from "next";

import "@/app/globals.css";
import { getRuntimeAppConfig } from "@/lib/app-config/runtime-config";

const { theme } = getRuntimeAppConfig();

export const metadata: Metadata = {
  title: theme.appName,
  description: "video-ingestion-mvp local video material ingestion MVP"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
