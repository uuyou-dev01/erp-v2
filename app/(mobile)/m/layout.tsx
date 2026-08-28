import type { Metadata, Viewport } from "next";
import { MobileNav } from "@/components/mobile/mobile-nav";
import { MobilePwaRegister } from "@/components/mobile/mobile-pwa-register";
import { MobileDeviceBootstrap } from "@/components/mobile/mobile-device-bootstrap";

export const metadata: Metadata = {
  title: "ERP 随身助手",
  description: "采集、待办与现场节点确认",
  appleWebApp: { capable: true, title: "ERP 助手", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f8fafc",
};

export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 sm:py-6">
      <MobilePwaRegister />
      <MobileDeviceBootstrap />
      <div className="mx-auto min-h-screen max-w-[520px] bg-white pb-24 shadow-[0_0_40px_rgba(15,23,42,0.08)] sm:min-h-[calc(100vh-3rem)] sm:overflow-hidden sm:rounded-[28px]">
        {children}
      </div>
      <MobileNav />
    </div>
  );
}
