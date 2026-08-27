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

function renderTextBlock(
  text: string,
  keyBase: string,
  onChord: ChordClick
): React.ReactNode[] {
  return text.split("\n").map((line, i) => {
    const key = `${keyBase}-l${i}`;
    const header = line.match(/^\s*\[([^\]\n]+)\]\s*$/);
    if (header && !/^(ch|\/ch|tab|\/tab)$/i.test(header[1])) {
      return (
        <div key={key} className="section-header">
          {header[1]}
        </div>
      );
    }
    return (
      <div key={key} className="tab-line">
        {line ? renderInline(line, key, onChord) : " "}
      </div>
    );
  });
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
      if (t?.closest(".chord")) return; // chord clicks handle themselves
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
          {renderTextBlock(inner, `tb${i}`, onChord)}
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
