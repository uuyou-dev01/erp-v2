"use client";

import { useEffect } from "react";

export function MobilePwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      void Promise.all([
        navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(
          registrations
            .filter((registration) => registration.active?.scriptURL.endsWith("/sw.js"))
            .map((registration) => registration.unregister()),
        )),
        "caches" in window
          ? caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("erp-companion-")).map((key) => caches.delete(key))))
          : Promise.resolve([]),
      ]);
      return;
    }
    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((registration) => registration.update());
  }, []);
  return null;
}
