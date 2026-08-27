"use client";

import { useEffect, useRef, useState } from "react";

// Deployed read-only site only: shows whether the service worker has finished
// saving the library for offline use. The precache install is all-or-nothing,
// so "ready" means every page is cached.
export default function OfflineStatus() {
  const [ready, setReady] = useState(false);
  const [supported, setSupported] = useState(true);
  const [cached, setCached] = useState<number | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const stallTicks = useRef(0);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_READONLY !== "1") return;
    if (!("serviceWorker" in navigator)) {
      setSupported(false);
      return;
    }
    let cancelled = false;
    navigator.serviceWorker.ready.then(() => {
      if (!cancelled) setReady(true);
    });
    fetch("/offline-total.json")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && typeof d.count === "number") setTotal(d.count);
      })
      .catch(() => {});
    let lastCount = -1;
    const poll = setInterval(async () => {
      try {
        const names = await caches.keys();
        let n = 0;
        for (const name of names) {
          if (!name.includes("precache")) continue;
          n += (await (await caches.open(name)).keys()).length;
        }
        if (cancelled) return;
        setCached(n);
        // If the install failed (e.g. a dropped request), no worker ever
        // activates and the count stops moving — nudge a retry.
        if (n === lastCount) {
          stallTicks.current += 1;
          if (stallTicks.current >= 10) {
            stallTicks.current = 0;
            const reg = await navigator.serviceWorker.getRegistration();
            await reg?.update();
          }
        } else {
          stallTicks.current = 0;
        }
        lastCount = n;
      } catch {}
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, []);

  if (process.env.NEXT_PUBLIC_READONLY !== "1" || !supported) return null;

  return (
    <span
      className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${
        ready
          ? "border-accent-2/40 bg-accent-2/10 text-accent-2"
          : "border-border-line bg-surface text-muted"
      }`}
    >
      {ready
        ? "✓ Offline ready"
        : cached === null
          ? "Preparing offline copy…"
          : `Saving for offline… ${cached}${total ? ` / ${total}` : ""}`}
    </span>
  );
}
