"use client";

import { useEffect } from "react";

// Registers the workbox-generated service worker on the deployed read-only
// site only — the env check compiles to a constant, so dev never gets a SW.
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_READONLY !== "1") return;
    if (!("serviceWorker" in navigator)) return;
    let registration: ServiceWorkerRegistration | null = null;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        registration = reg;
      })
      .catch(() => {});
    // The browser only checks for a new sw.js on a full page load, so an
    // installed PWA that stays open (or only navigates client-side) can serve
    // the precached library long after a deploy. Re-check whenever the app
    // comes back into the foreground.
    const checkForUpdate = () => {
      if (document.visibilityState !== "visible") return;
      registration?.update().catch(() => {});
    };
    document.addEventListener("visibilitychange", checkForUpdate);
    window.addEventListener("focus", checkForUpdate);
    // When an updated service worker takes over (new deploy finished
    // caching), reload once so the page runs the new version. The guard
    // skips the initial claim on a first visit.
    let hadController = !!navigator.serviceWorker.controller;
    const onControllerChange = () => {
      if (!hadController) {
        hadController = true;
        return;
      }
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange
    );
    // Ask Chrome not to evict the cached library under storage pressure;
    // granted silently once the PWA is installed.
    navigator.storage?.persist?.().catch(() => {});
    return () => {
      document.removeEventListener("visibilitychange", checkForUpdate);
      window.removeEventListener("focus", checkForUpdate);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange
      );
    };
  }, []);
  return null;
}
