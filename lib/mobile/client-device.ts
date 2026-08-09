export function createInstallationId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function installationId() {
  const key = "erp-mobile-installation-id";
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
  } catch {
    // Storage can be unavailable in restricted/private browser contexts.
  }
  const value = createInstallationId();
  try {
    localStorage.setItem(key, value);
  } catch {
    // A temporary installation id still allows the page to remain usable.
  }
  return value;
}

let registration: Promise<void> | null = null;

export function ensureMobileDeviceRegistered() {
  if (registration) return registration;
  registration = Promise.resolve()
    .then(() => fetch("/api/v1/mobile/devices/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        installationId: installationId(),
        name: /iPhone/i.test(navigator.userAgent) ? "iPhone" : /iPad/i.test(navigator.userAgent) ? "iPad" : "移动浏览器",
        clientKind: "MOBILE_PWA",
      }),
    }))
    .then(async (response) => {
      if (!response.ok) {
        registration = null;
        const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(payload?.error?.message || "移动设备绑定失败");
      }
    });
  return registration;
}
