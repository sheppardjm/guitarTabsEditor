"use client";

import { useEffect } from "react";

// Registers the workbox-generated service worker on the deployed read-only
// site only — the env check compiles to a constant, so dev never gets a SW.
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_READONLY !== "1") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {});
    // Ask Chrome not to evict the cached library under storage pressure;
    // granted silently once the PWA is installed.
    navigator.storage?.persist?.().catch(() => {});
  }, []);
  return null;
}
