import type { Metadata } from "next";
import "./globals.css";
import { ActionFeedback } from "@/components/feedback/action-feedback";

export const metadata: Metadata = {
  title: "跨境贸易 ERP",
  description: "Cross-border trading ERP system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen font-sans antialiased">
        {children}
        <ActionFeedback />
      </body>
    </html>
  );
}
