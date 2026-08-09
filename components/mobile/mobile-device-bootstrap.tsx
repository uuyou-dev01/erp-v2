"use client";

import { useEffect } from "react";
import { ensureMobileDeviceRegistered } from "@/lib/mobile/client-device";

export function MobileDeviceBootstrap() {
  useEffect(() => {
    void ensureMobileDeviceRegistered().catch(() => {
      // Device binding is an enhancement and must never prevent the mobile UI
      // from loading on browsers with restricted storage or Web Crypto APIs.
    });
  }, []);
  return null;
}
