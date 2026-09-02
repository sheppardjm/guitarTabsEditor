/**
 * Turn a raw tuning string ("Eb Ab Db Gb Bb Eb", "D A D G B E", "DADGAD")
 * into a short human label, or null when it's standard / unrecognisable.
 * Pure and dependency-free so it can run on the client.
 */

const NOTE_SEMITONE: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};
const NOTE_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const STANDARD = [4, 9, 2, 7, 11, 4]; // E A D G B E, low to high

function parseNotes(raw: string): number[] | null {
  const tokens = raw.match(/[A-Ga-g](?:#|b|♭|♯)?/g);
  if (!tokens || tokens.length !== 6) return null;
  return tokens.map((t) => {
    let n = NOTE_SEMITONE[t[0].toUpperCase()];
    const acc = t.slice(1);
    if (acc === "#" || acc === "♯") n += 1;
    if (acc === "b" || acc === "♭") n -= 1;
    return ((n % 12) + 12) % 12;
  });
}

function stepsLabel(halfSteps: number): string {
  const dir = halfSteps < 0 ? "down" : "up";
  const n = Math.abs(halfSteps);
  const whole = Math.floor(n / 2);
  const half = n % 2;
  const amount =
    whole === 0 ? "½" : half ? `${whole}½` : String(whole);
  return `${amount} step${whole >= 2 || (whole === 1 && half) ? "s" : ""} ${dir}`;
}

/** Signed shortest semitone distance from b to a, in (-6, 6]. */
function delta(a: number, b: number): number {
  const d = ((a - b) % 12 + 12) % 12;
  return d > 6 ? d - 12 : d;
}

export function tuningLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const notes = parseNotes(raw);
  if (!notes) {
    // Not six notes — surface whatever the file says, trimmed.
    const s = raw.trim();
    return /standard/i.test(s) ? null : s;
  }
  const offsets = notes.map((n, i) => delta(n, STANDARD[i]));
  const [low, ...rest] = offsets;
  const uniform = rest.every((o) => o === rest[0]);
  if (uniform && low === rest[0]) {
    return low === 0 ? null : stepsLabel(low);
  }
  if (uniform && low === rest[0] - 2) {
    return `Drop ${NOTE_NAMES[notes[0]]}`;
  }
  return notes.map((n) => NOTE_NAMES[n]).join("");
}
