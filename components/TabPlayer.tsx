"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { updateScrollAdjustAction } from "@/app/actions";

// Autoscroll: the page scrolls its full height over durationSec seconds,
// scaled by an adjustable multiplier that is persisted per song.

export default function TabPlayer({
  slug,
  durationSec,
  initialAdjust,
  children,
}: {
  slug: string;
  durationSec: number;
  initialAdjust: number;
  children: ReactNode;
}) {
  const [playing, setPlaying] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [adjust, setAdjust] = useState(initialAdjust);

  const adjustRef = useRef(adjust);
  adjustRef.current = adjust;
  const savedAdjustRef = useRef(initialAdjust);
  const rafRef = useRef<number | null>(null);
  const fracRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);
  const countdownTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const persistAdjust = useCallback(() => {
    const value = adjustRef.current;
    if (Math.abs(value - savedAdjustRef.current) < 0.001) return;
    savedAdjustRef.current = value;
    void updateScrollAdjustAction(slug, value);
  }, [slug]);

  const stopScrolling = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    lastTsRef.current = null;
    for (const t of countdownTimers.current) clearTimeout(t);
    countdownTimers.current = [];
    setCountdown(null);
    setPlaying(false);
    persistAdjust();
  }, [persistAdjust]);

  const startScrolling = useCallback(() => {
    const step = (ts: number) => {
      const last = lastTsRef.current;
      lastTsRef.current = ts;
      if (last !== null) {
        const dt = (ts - last) / 1000;
        const total =
          document.documentElement.scrollHeight - window.innerHeight;
        const pxPerSec = (total / Math.max(10, durationSec)) * adjustRef.current;
        fracRef.current += pxPerSec * dt;
        const whole = Math.floor(fracRef.current);
        if (whole >= 1) {
          fracRef.current -= whole;
          window.scrollBy(0, whole);
        }
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 1) {
          stopScrolling();
          return;
        }
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, [durationSec, stopScrolling]);

  const play = useCallback(() => {
    setPlaying(true);
    setCountdown(3);
    countdownTimers.current = [
      setTimeout(() => setCountdown(2), 1000),
      setTimeout(() => setCountdown(1), 2000),
      setTimeout(() => {
        setCountdown(null);
        startScrolling();
      }, 3000),
    ];
  }, [startScrolling]);

  const toggle = useCallback(() => {
    if (playing) stopScrolling();
    else play();
  }, [playing, play, stopScrolling]);

  const nudge = useCallback((dir: 1 | -1) => {
    setAdjust((a) =>
      Math.min(4, Math.max(0.25, Number((a * (dir === 1 ? 1.1 : 1 / 1.1)).toFixed(3))))
    );
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (e.code === "Space") {
        e.preventDefault();
        toggle();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        nudge(1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        nudge(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, nudge]);

  // Persist a changed multiplier even if the user never pauses.
  useEffect(() => {
    const t = setTimeout(persistAdjust, 1500);
    return () => clearTimeout(t);
  }, [adjust, persistAdjust]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      for (const t of countdownTimers.current) clearTimeout(t);
    };
  }, []);

  const effectiveDuration = durationSec / adjust;
  const m = Math.floor(effectiveDuration / 60);
  const s = Math.round(effectiveDuration % 60);

  return (
    <>
      {children}

      {countdown !== null ? (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center">
          <div className="rounded-2xl bg-background/85 px-14 py-8 text-8xl font-bold text-accent-2">
            {countdown}
          </div>
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-4 py-3">
          <button
            onClick={toggle}
            className={`rounded-md px-5 py-2 text-sm font-bold ${
              playing
                ? "bg-red-400/20 text-red-300"
                : "bg-accent-2 text-background"
            }`}
          >
            {playing ? "Pause" : "Play"}
          </button>
          <button
            onClick={() => {
              stopScrolling();
              window.scrollTo({ top: 0 });
            }}
            className="rounded-md border border-border-line px-3 py-2 text-sm text-muted hover:text-foreground"
            title="Back to top"
          >
            ⇤ Top
          </button>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <button
              onClick={() => nudge(-1)}
              className="rounded-md border border-border-line px-3 py-2 hover:bg-surface-2"
              title="Slower (↓)"
            >
              −
            </button>
            <span className="w-24 text-center text-muted">
              {adjust.toFixed(2)}× · {m}:{String(s).padStart(2, "0")}
            </span>
            <button
              onClick={() => nudge(1)}
              className="rounded-md border border-border-line px-3 py-2 hover:bg-surface-2"
              title="Faster (↑)"
            >
              +
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
