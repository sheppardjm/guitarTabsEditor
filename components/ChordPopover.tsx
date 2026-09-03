"use client";

import { useState } from "react";
import ChordDiagram from "@/components/ChordDiagram";
import type { ChordPosition } from "@/lib/chordLookup";

// Overlay anchored near a clicked chord. Coordinates are relative to the
// positioned TabContent container, so the popover scrolls with the text
// (including during autoscroll).

export const POPOVER_WIDTH = 168;

export default function ChordPopover({
  name,
  positions,
  left,
  top,
}: {
  name: string;
  positions: ChordPosition[] | null;
  left: number;
  top: number;
}) {
  const [variant, setVariant] = useState(0);
  const total = positions?.length ?? 0;
  const pos = positions?.[Math.min(variant, total - 1)] ?? null;

  return (
    <div
      className="chord-popover absolute z-50 rounded-lg border border-border-line bg-surface-2 px-3 py-2 font-sans shadow-xl shadow-black/50"
      style={{ left, top, width: POPOVER_WIDTH }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="font-bold text-accent">{name}</span>
        {total > 1 ? (
          <span className="flex items-center gap-1 text-xs text-muted">
            <button
              onClick={() => setVariant((v) => (v - 1 + total) % total)}
              className="rounded border border-border-line px-1.5 py-0.5 hover:bg-surface"
              aria-label="Previous shape"
            >
              ‹
            </button>
            {Math.min(variant, total - 1) + 1}/{total}
            <button
              onClick={() => setVariant((v) => (v + 1) % total)}
              className="rounded border border-border-line px-1.5 py-0.5 hover:bg-surface"
              aria-label="Next shape"
            >
              ›
            </button>
          </span>
        ) : null}
      </div>
      {pos ? (
        <div className="flex justify-center">
          <ChordDiagram position={pos} />
        </div>
      ) : (
        <p className="py-3 text-center text-xs text-muted">
          No diagram available
        </p>
      )}
    </div>
  );
}
