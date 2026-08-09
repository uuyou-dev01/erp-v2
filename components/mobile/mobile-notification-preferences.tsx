"use client";

import { useEffect, useState } from "react";
import { Check, Clock3, Loader2 } from "lucide-react";

type Preference = {
  pushEnabled: boolean;
  digestMode: "IMMEDIATE" | "HOURLY" | "DAILY";
  quietStart: string | null;
  quietEnd: string | null;
  mutedTypes: string[];
};

const defaults: Preference = { pushEnabled: true, digestMode: "IMMEDIATE", quietStart: null, quietEnd: null, mutedTypes: [] };

export function MobileNotificationPreferences() {
  const [preference, setPreference] = useState(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void fetch("/api/v1/mobile/notification-preferences")
      .then((response) => response.json())
      .then((payload: { preference?: Preference }) => setPreference(payload.preference ?? defaults))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    const response = await fetch("/api/v1/mobile/notification-preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(preference),
    });
    setSaving(false);
    if (response.ok) {
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    }
  };

  if (loading) return <div className="mt-3 flex h-24 items-center justify-center rounded-2xl border border-slate-200"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>;

  return <section className="mt-3 rounded-2xl border border-slate-200 p-4"><div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-slate-500" /><div><p className="text-sm font-semibold text-slate-800">提醒节奏</p><p className="mt-0.5 text-[11px] text-slate-400">站内通知始终保留，这里只控制系统推送</p></div></div><label className="mt-4 flex items-center justify-between text-sm text-slate-700"><span>允许系统推送</span><input type="checkbox" checked={preference.pushEnabled} onChange={(event) => setPreference((value) => ({ ...value, pushEnabled: event.target.checked }))} className="h-5 w-5 accent-blue-600" /></label><label className="mt-4 block text-xs font-medium text-slate-500">发送频率<select value={preference.digestMode} onChange={(event) => setPreference((value) => ({ ...value, digestMode: event.target.value as Preference["digestMode"] }))} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800"><option value="IMMEDIATE">及时提醒</option><option value="HOURLY">每小时汇总</option><option value="DAILY">每日 09:00 汇总</option></select></label><div className="mt-4 grid grid-cols-2 gap-3"><label className="text-xs font-medium text-slate-500">静默开始<input type="time" value={preference.quietStart ?? ""} onChange={(event) => setPreference((value) => ({ ...value, quietStart: event.target.value || null, quietEnd: event.target.value && !value.quietEnd ? "08:00" : value.quietEnd }))} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-800" /></label><label className="text-xs font-medium text-slate-500">静默结束<input type="time" value={preference.quietEnd ?? ""} onChange={(event) => setPreference((value) => ({ ...value, quietEnd: event.target.value || null, quietStart: event.target.value && !value.quietStart ? "22:00" : value.quietStart }))} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-800" /></label></div><button type="button" onClick={save} disabled={saving} className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 text-sm font-semibold text-white disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}{saved ? "已保存" : "保存提醒设置"}</button></section>;
}
