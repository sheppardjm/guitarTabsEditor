"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StrumPattern } from "@/lib/ugParser";

// Plays Ultimate Guitar strumming patterns with a synthesized guitar strum
// (Web Audio, no samples, so it works in the offline build) and shows the
// pattern as arrows with the current slot highlighted while it loops.

interface Stroke {
  dir: "down" | "up" | "pm" | "none" | "rest";
  effect: "none" | "mute" | "accent";
}

function decode(code: number): Stroke {
  switch (code) {
    case 1: return { dir: "down", effect: "none" };
    case 2: return { dir: "down", effect: "mute" };
    case 3: return { dir: "down", effect: "accent" };
    case 101: return { dir: "up", effect: "none" };
    case 102: return { dir: "up", effect: "mute" };
    case 103: return { dir: "up", effect: "accent" };
    case 201: return { dir: "pm", effect: "none" };
    case 203: return { dir: "rest", effect: "none" };
    default: return { dir: "none", effect: "none" };
  }
}

// Slots per beat: 8ths = 2, 16ths = 4, triplets add half again.
function slotsPerBeat(p: StrumPattern): number {
  return (p.division / 4) * (p.triplet ? 1.5 : 1);
}

function slotSeconds(p: StrumPattern, bpm: number): number {
  return 60 / bpm / slotsPerBeat(p);
}

function divisionLabel(p: StrumPattern): string {
  const name = p.division === 4 ? "quarter" : p.division === 8 ? "8th" : "16th";
  return p.triplet ? `${name} triplets` : `${name}s`;
}

// Open-string pitches, low to high (standard tuning).
const STRINGS = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63];

// --- synth -----------------------------------------------------------------

function pluck(
  ctx: AudioContext,
  out: AudioNode,
  freq: number,
  at: number,
  gain: number,
  decay: number,
  cutoff: number
) {
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.value = freq;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(cutoff, at);
  filter.frequency.exponentialRampToValueAtTime(Math.max(200, cutoff / 6), at + decay);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(gain, at + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0005, at + decay);
  osc.connect(filter).connect(env).connect(out);
  osc.start(at);
  osc.stop(at + decay + 0.02);
}

function noiseBurst(ctx: AudioContext, out: AudioNode, at: number, gain: number) {
  const len = Math.floor(ctx.sampleRate * 0.08);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1800;
  filter.Q.value = 0.7;
  const env = ctx.createGain();
  env.gain.value = gain;
  src.connect(filter).connect(env).connect(out);
  src.start(at);
}

function playStroke(ctx: AudioContext, out: AudioNode, s: Stroke, at: number) {
  if (s.dir === "none" || s.dir === "rest") return;
  const accent = s.effect === "accent" ? 1.5 : 1;
  if (s.effect === "mute") {
    noiseBurst(ctx, out, at, 0.5 * accent);
    return;
  }
  const order = s.dir === "up" ? [...STRINGS].reverse().slice(0, 4) : STRINGS;
  const base = s.dir === "up" ? 0.13 : 0.17;
  const decay = s.dir === "pm" ? 0.14 : 0.9;
  const cutoff = s.dir === "pm" ? 900 : 2600;
  order.forEach((f, i) => {
    pluck(ctx, out, f, at + i * 0.009, base * accent, decay, cutoff);
  });
  if (s.dir === "pm") noiseBurst(ctx, out, at, 0.15);
}

// --- component -------------------------------------------------------------

export default function StrumPlayer({ patterns }: { patterns: StrumPattern[] }) {
  const [active, setActive] = useState<number | null>(null);
  const [slot, setSlot] = useState<number>(-1);
  const [bpmOverride, setBpmOverride] = useState<Record<number, number>>({});

  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number | null>(null);
  const scheduledRef = useRef<{ time: number; slot: number }[]>([]);
  const nextRef = useRef({ time: 0, slot: 0 });
  const runRef = useRef<{ pattern: StrumPattern; bpm: number } | null>(null);

  const bpmFor = useCallback(
    (i: number) => bpmOverride[i] ?? patterns[i].bpm,
    [bpmOverride, patterns]
  );

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    timerRef.current = null;
    rafRef.current = null;
    runRef.current = null;
    scheduledRef.current = [];
    setActive(null);
    setSlot(-1);
  }, []);

  const start = useCallback(
    (i: number) => {
      stop();
      const pattern = patterns[i];
      const bpm = bpmFor(i);
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = ctxRef.current ?? new AC();
      ctxRef.current = ctx;
      void ctx.resume();
      const master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(ctx.destination);

      runRef.current = { pattern, bpm };
      const strokes = pattern.strokes.map(decode);
      nextRef.current = { time: ctx.currentTime + 0.1, slot: 0 };
      setActive(i);

      // Look-ahead scheduler: queue audio ~120 ms ahead on a 25 ms tick.
      timerRef.current = setInterval(() => {
        const run = runRef.current;
        if (!run) return;
        while (nextRef.current.time < ctx.currentTime + 0.12) {
          const { time, slot } = nextRef.current;
          playStroke(ctx, master, strokes[slot], time);
          scheduledRef.current.push({ time, slot });
          // Tempo is read per slot so +/- takes effect without restarting.
          const dur = slotSeconds(pattern, run.bpm);
          nextRef.current = { time: time + dur, slot: (slot + 1) % strokes.length };
        }
      }, 25);

      // Visual cursor follows the audio clock.
      const tick = () => {
        const q = scheduledRef.current;
        while (q.length > 1 && q[1].time <= ctx.currentTime) q.shift();
        if (q.length && q[0].time <= ctx.currentTime) setSlot(q[0].slot);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [patterns, bpmFor, stop]
  );

  useEffect(() => () => stop(), [stop]);

  const changeBpm = (i: number, delta: number) => {
    const next = Math.min(240, Math.max(40, bpmFor(i) + delta));
    setBpmOverride((o) => ({ ...o, [i]: next }));
    if (active === i && runRef.current) runRef.current.bpm = next;
  };

  if (!patterns.length) return null;

  return (
    <div className="mb-6 rounded-lg border border-border-line bg-surface p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
        Strumming
      </div>
      <div className="space-y-3">
        {patterns.map((p, i) => {
          const playing = active === i;
          const bpm = bpmFor(i);
          const perBeat = slotsPerBeat(p);
          const groupSize = Number.isInteger(perBeat) ? perBeat : 3;
          return (
            <div key={i} className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <button
                onClick={() => (playing ? stop() : start(i))}
                className={`rounded-md px-4 py-2 text-sm font-bold ${
                  playing ? "bg-red-400/20 text-red-300" : "bg-accent-2 text-background"
                }`}
              >
                {playing ? "Stop" : "Play"}
              </button>
              <div className="flex items-center gap-1 text-sm">
                <button
                  onClick={() => changeBpm(i, -4)}
                  className="rounded-md border border-border-line px-2 py-1 hover:bg-surface-2"
                  title="Slower"
                >
                  −
                </button>
                <span className="w-16 text-center text-muted">{bpm} bpm</span>
                <button
                  onClick={() => changeBpm(i, 4)}
                  className="rounded-md border border-border-line px-2 py-1 hover:bg-surface-2"
                  title="Faster"
                >
                  +
                </button>
              </div>
              <span className="text-sm text-muted">
                {p.part ? `${p.part} · ` : ""}
                {divisionLabel(p)}
              </span>
              <div className="flex w-full flex-wrap gap-x-3 gap-y-1 font-mono">
                {chunk(p.strokes.map(decode), groupSize).map((beat, b) => (
                  <div key={b} className="flex gap-0.5">
                    {beat.map((s, k) => {
                      const idx = b * groupSize + k;
                      const current = playing && slot === idx;
                      return <Slot key={k} s={s} current={current} />;
                    })}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function Slot({ s, current }: { s: Stroke; current: boolean }) {
  const glyph =
    s.dir === "down" ? "↓" : s.dir === "up" ? "↑" : s.dir === "pm" ? "pm" : s.dir === "rest" ? "•" : "–";
  const silent = s.dir === "none" || s.dir === "rest";
  return (
    <span
      className={`relative flex h-9 w-7 items-center justify-center rounded text-base ${
        current ? "bg-accent-2 text-background" : silent ? "text-muted/50" : "text-foreground"
      } ${s.effect === "accent" ? "font-bold" : ""} ${s.effect === "mute" ? "line-through decoration-2" : ""} ${
        s.dir === "pm" ? "text-[10px]" : ""
      }`}
      title={
        s.dir === "down" ? "down" : s.dir === "up" ? "up" : s.dir === "pm" ? "palm mute" : s.dir === "rest" ? "rest" : "let ring"
      }
    >
      {glyph}
      {s.effect === "accent" ? (
        <span className="absolute -top-0.5 right-0.5 text-[9px] leading-none">&gt;</span>
      ) : null}
    </span>
  );
}
