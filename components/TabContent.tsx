"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import ChordPopover, { POPOVER_WIDTH } from "@/components/ChordPopover";
import { findChord, type ChordPosition } from "@/lib/chordLookup";

// Renders raw tab text using Ultimate Guitar conventions:
//   [ch]Am[/ch]        -> highlighted chord (click for a fingering diagram)
//   [tab]...[/tab]     -> tablature block (kept verbatim)
//   [Verse 1] on a line by itself -> section header
// Whitespace is significant everywhere (chords align above lyrics).

type ChordClick = (name: string, el: HTMLElement) => void;

function renderInline(
  text: string,
  keyBase: string,
  onChord: ChordClick
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /\[ch\]([\s\S]*?)\[\/ch\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const name = m[1];
    nodes.push(
      <span
        key={`${keyBase}-ch${i++}`}
        className="chord"
        role="button"
        tabIndex={0}
        onClick={(e) => onChord(name, e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onChord(name, e.currentTarget);
        }}
      >
        {name}
      </span>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const CHORD_RE = /\[ch\]([\s\S]*?)\[\/ch\]/g;

// Text as it renders (markup stripped), for column arithmetic.
function visibleText(line: string): string {
  return line.replace(CHORD_RE, "$1");
}

function isChordLine(line: string): boolean {
  return /\[ch\]/.test(line) && visibleText(line).trim().length > 0;
}

function isLyricLine(line: string): boolean {
  return line.trim().length > 0 && !/\[ch\]/.test(line) && !/^\s*\[[^\]\n]+\]\s*$/.test(line);
}

// Visible columns at which each chord starts.
function chordColumns(line: string): number[] {
  const cols: number[] = [];
  let visible = 0;
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(CHORD_RE.source, "g");
  while ((m = re.exec(line)) !== null) {
    visible += m.index - last;
    cols.push(visible);
    visible += m[1].length;
    last = m.index + m[0].length;
  }
  return cols;
}

// Slice a marked-up chord line by visible columns, keeping [ch] tags whole.
function sliceChordLine(line: string, from: number, to: number): string {
  let out = "";
  let visible = 0;
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(CHORD_RE.source, "g");
  const take = (text: string, raw: string) => {
    const start = visible;
    const end = visible + text.length;
    visible = end;
    if (end <= from || start >= to) return;
    // Plain text can be cut; a chord token is emitted whole if it starts in range.
    if (raw === text) out += text.slice(Math.max(from - start, 0), Math.min(to - start, text.length));
    else if (start >= from) out += raw;
  };
  while ((m = re.exec(line)) !== null) {
    take(line.slice(last, m.index), line.slice(last, m.index));
    take(m[1], m[0]);
    last = m.index + m[0].length;
  }
  take(line.slice(last), line.slice(last));
  return out;
}

// A chord line over a lyric line, split at each chord into segments that
// wrap as a unit, so long lines fold at the viewport without losing the
// chord-over-syllable alignment (monospace keeps columns equal).
function renderPair(
  chordLine: string,
  lyricLine: string,
  key: string,
  onChord: ChordClick
): React.ReactNode {
  const cols = chordColumns(chordLine);
  const cuts = [0, ...cols.filter((c) => c > 0), Infinity];
  const segments: React.ReactNode[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const from = cuts[i];
    const to = cuts[i + 1];
    const chordPart = sliceChordLine(chordLine, from, to);
    const lyricPart = lyricLine.slice(from, to === Infinity ? undefined : to);
    if (!chordPart && !lyricPart) continue;
    segments.push(
      <span key={i} className="pair-seg">
        <span className="pair-chord">
          {chordPart ? renderInline(chordPart, `${key}-c${i}`, onChord) : "\u00a0"}
        </span>
        <span className="pair-lyric">{lyricPart || "\u00a0"}</span>
      </span>
    );
  }
  return (
    <div key={key} className="tab-pair">
      {segments}
    </div>
  );
}

function renderTextBlock(
  text: string,
  keyBase: string,
  onChord: ChordClick,
  pairLines = true
): React.ReactNode[] {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const key = `${keyBase}-l${i}`;
    const header = line.match(/^\s*\[([^\]\n]+)\]\s*$/);
    if (header && !/^(ch|\/ch|tab|\/tab)$/i.test(header[1])) {
      out.push(
        <div key={key} className="section-header">
          {header[1]}
        </div>
      );
      continue;
    }
    const next = lines[i + 1];
    if (pairLines && isChordLine(line) && next !== undefined && isLyricLine(next)) {
      out.push(renderPair(line, next, key, onChord));
      i++;
      continue;
    }
    out.push(
      <div key={key} className="tab-line">
        {line ? renderInline(line, key, onChord) : " "}
      </div>
    );
  }
  return out;
}

type OpenPopover = {
  name: string;
  positions: ChordPosition[] | null;
  left: number;
  top: number;
};

export default function TabContent({ content }: { content: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [popover, setPopover] = useState<OpenPopover | null>(null);
  const openForRef = useRef<string | null>(null);

  const onChord = useCallback(async (name: string, el: HTMLElement) => {
    const container = containerRef.current;
    if (!container) return;
    // Tapping the already-open chord closes it.
    const anchorId = `${name}@${el.offsetTop}:${el.offsetLeft}`;
    if (openForRef.current === anchorId) {
      openForRef.current = null;
      setPopover(null);
      return;
    }
    const match = await findChord(name).catch(() => null);
    const cRect = container.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    const left = Math.min(
      Math.max(rect.left - cRect.left + rect.width / 2 - POPOVER_WIDTH / 2, 0),
      Math.max(cRect.width - POPOVER_WIDTH, 0)
    );
    const top = rect.bottom - cRect.top + 6;
    openForRef.current = anchorId;
    setPopover({ name, positions: match?.positions ?? null, left, top });
  }, []);

  useEffect(() => {
    if (!popover) return;
    const close = (e: Event) => {
      const t = e.target as HTMLElement | null;
      // Chord clicks handle themselves; clicks inside the popover (variant
      // arrows) must not dismiss it.
      if (t?.closest(".chord") || t?.closest(".chord-popover")) return;
      openForRef.current = null;
      setPopover(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        openForRef.current = null;
        setPopover(null);
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [popover]);

  const parts: React.ReactNode[] = [];
  const re = /\[tab\]([\s\S]*?)\[\/tab\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) {
      parts.push(...renderTextBlock(content.slice(last, m.index), `t${i}`, onChord));
    }
    const inner = m[1].replace(/^\n+|\n+$/g, "");
    // Only box real tablature (string lines like e|---0---). UG also wraps
    // chord-over-lyric pairs in [tab] to keep them together; render those flat.
    const isTablature = /(^|\n)\s*[A-Ga-g][#b]?\s*\|.*-/.test(inner);
    parts.push(
      isTablature ? (
        <div key={`tab${i}`} className="tab-block">
          {renderTextBlock(inner, `tb${i}`, onChord, false)}
        </div>
      ) : (
        <React.Fragment key={`tab${i}`}>
          {renderTextBlock(inner, `tb${i}`, onChord)}
        </React.Fragment>
      )
    );
    last = m.index + m[0].length;
    i++;
  }
  if (last < content.length) {
    parts.push(...renderTextBlock(content.slice(last), `t-end`, onChord));
  }

  return (
    <div ref={containerRef} className="tab-content relative font-mono">
      {parts}
      {popover ? <ChordPopover key={`${popover.name}-${popover.top}-${popover.left}`} {...popover} /> : null}
    </div>
  );
}
