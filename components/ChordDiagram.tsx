import type { ChordPosition } from "@/lib/chordLookup";

// SVG chord box: 6 strings (low E leftmost), 4 frets, dots with finger
// numbers, barres, open/muted markers, and a base-fret label when the
// shape sits up the neck.

const STRINGS = 6;
const FRETS = 4;
const X0 = 18;
const Y0 = 26;
const SX = 13; // string spacing
const SY = 19; // fret spacing
const W = X0 + SX * (STRINGS - 1) + 18;
const H = Y0 + SY * FRETS + 8;

export default function ChordDiagram({ position }: { position: ChordPosition }) {
  const { frets, fingers, baseFret, barres } = position;
  const sx = (i: number) => X0 + i * SX;
  const fy = (f: number) => Y0 + (f - 0.5) * SY;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W * 1.35}
      height={H * 1.35}
      role="img"
      className="block"
    >
      {/* nut or base fret label */}
      {baseFret === 1 ? (
        <rect x={X0 - 1} y={Y0 - 3.5} width={SX * (STRINGS - 1) + 2} height={3.5} rx={1} fill="var(--foreground)" />
      ) : (
        <text x={X0 - 6} y={fy(1) + 3.5} textAnchor="end" fontSize="9" fill="var(--muted)">
          {baseFret}fr
        </text>
      )}

      {/* grid */}
      {Array.from({ length: STRINGS }, (_, i) => (
        <line key={`s${i}`} x1={sx(i)} y1={Y0} x2={sx(i)} y2={Y0 + SY * FRETS} stroke="var(--muted)" strokeWidth="0.8" />
      ))}
      {Array.from({ length: FRETS + 1 }, (_, f) => (
        <line key={`f${f}`} x1={X0} y1={Y0 + f * SY} x2={X0 + SX * (STRINGS - 1)} y2={Y0 + f * SY} stroke="var(--muted)" strokeWidth="0.8" />
      ))}

      {/* open / muted markers */}
      {frets.map((f, i) =>
        f === 0 ? (
          <circle key={`o${i}`} cx={sx(i)} cy={Y0 - 10} r={3.2} fill="none" stroke="var(--muted)" strokeWidth="1.2" />
        ) : f === -1 ? (
          <text key={`x${i}`} x={sx(i)} y={Y0 - 7} textAnchor="middle" fontSize="9" fill="var(--muted)">
            ×
          </text>
        ) : null
      )}

      {/* barres */}
      {barres.map((b) => {
        const on = frets
          .map((f, i) => (f === b ? i : -1))
          .filter((i) => i >= 0);
        if (on.length < 2) return null;
        const from = Math.min(...on);
        const to = Math.max(...on);
        return (
          <rect
            key={`b${b}`}
            x={sx(from) - 4.5}
            y={fy(b) - 4.5}
            width={sx(to) - sx(from) + 9}
            height={9}
            rx={4.5}
            fill="var(--accent)"
            opacity={0.85}
          />
        );
      })}

      {/* dots */}
      {frets.map((f, i) =>
        f > 0 ? (
          <g key={`d${i}`}>
            <circle cx={sx(i)} cy={fy(f)} r={5} fill="var(--accent)" />
            {fingers[i] > 0 ? (
              <text x={sx(i)} y={fy(f) + 2.8} textAnchor="middle" fontSize="7.5" fontWeight="700" fill="var(--background)">
                {fingers[i]}
              </text>
            ) : null}
          </g>
        ) : null
      )}
    </svg>
  );
}
