"use client";

import { useEffect, useState } from "react";
import { BellRing, Loader2, Smartphone, X } from "lucide-react";
import { ensureMobileDeviceRegistered } from "@/lib/mobile/client-device";
import { MobileNotificationPreferences } from "@/components/mobile/mobile-notification-preferences";

interface Device {
  id: string;
  name: string;
  clientKind: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

function applicationServerKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

export function MobileDeviceSettings() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [busy, setBusy] = useState(false);
  const [pushState, setPushState] = useState<"unknown" | "enabled" | "disabled" | "unavailable">("unknown");
  const [message, setMessage] = useState<string | null>(null);
  const [showAllDevices, setShowAllDevices] = useState(false);

  const refreshDevices = async () => {
    await ensureMobileDeviceRegistered();
    const response = await fetch("/api/v1/mobile/devices");
    const payload = await response.json() as { devices?: Device[] };
    setDevices(payload.devices ?? []);
  };

  useEffect(() => {
    void refreshDevices();
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushState("unavailable");
      return;
    }
    void Promise.all([
      navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription()),
      fetch("/api/v1/mobile/push-subscriptions").then((response) => response.json() as Promise<{ enabled?: boolean }>),
    ]).then(([subscription, config]) => setPushState(subscription ? "enabled" : config.enabled ? "disabled" : "unavailable"));
  }, []);

  const enablePush = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await ensureMobileDeviceRegistered();
      const configResponse = await fetch("/api/v1/mobile/push-subscriptions");
      const config = await configResponse.json() as { enabled?: boolean; publicKey?: string | null };
      if (!config.enabled || !config.publicKey) throw new Error("服务端尚未配置 Web Push 密钥");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("你没有允许系统通知");
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(config.publicKey) });
      const response = await fetch("/api/v1/mobile/push-subscriptions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
      if (!response.ok) throw new Error("保存推送订阅失败");
      setPushState("enabled");
      setMessage("系统通知已开启");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "开启通知失败");
    } finally {
      setBusy(false);
    }
  };

  const activeDevices = devices.filter((device) => !device.revokedAt);
  const visibleDevices = showAllDevices ? activeDevices : activeDevices.slice(0, 5);
  return <section className="mt-7 space-y-3"><div className="rounded-2xl bg-slate-50 p-4"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><BellRing className="h-4 w-4 text-blue-600" /><div><p className="text-sm font-semibold text-slate-800">系统通知</p><p className="mt-0.5 text-[11px] text-slate-400">指派、完成与异常提醒</p></div></div><button type="button" disabled={busy || pushState === "enabled" || pushState === "unavailable"} onClick={enablePush} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-blue-700 shadow-sm disabled:text-slate-400">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : pushState === "enabled" ? "已开启" : pushState === "unavailable" ? "待配置" : "开启"}</button></div>{message ? <p className="mt-3 text-xs text-slate-500">{message}</p> : null}</div><MobileNotificationPreferences /><div className="rounded-2xl border border-slate-200 p-4"><div className="mb-3 flex items-center gap-2"><Smartphone className="h-4 w-4 text-slate-500" /><p className="text-sm font-semibold text-slate-800">已绑定设备</p></div><div className="divide-y divide-slate-100">{visibleDevices.map((device) => <div key={device.id} className="flex items-center justify-between py-3"><div><p className="text-sm font-medium text-slate-700">{device.name}</p><p className="mt-0.5 text-[10px] text-slate-400">{device.lastUsedAt ? `最近使用 ${new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(device.lastUsedAt))}` : "尚未使用"}</p></div><button type="button" aria-label={`撤销 ${device.name}`} className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400" onClick={async () => { if (!confirm(`确认撤销「${device.name}」？`)) return; await fetch(`/api/v1/mobile/devices/${device.id}`, { method: "DELETE" }); await refreshDevices(); }}><X className="h-4 w-4" /></button></div>)}</div>{activeDevices.length > 5 ? <button type="button" className="mt-3 text-xs font-semibold text-blue-700" onClick={() => setShowAllDevices((value) => !value)}>{showAllDevices ? "收起设备" : `查看其余 ${activeDevices.length - 5} 台`}</button> : null}</div></section>;
}
