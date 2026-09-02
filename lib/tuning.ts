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

const HALF_DOWN = "Eb Ab Db Gb Bb Eb";
const WHOLE_DOWN = "D G C F A D";

/**
 * Best-effort sniff of a tuning declared in the tab body (used when the
 * source site provides no tuning metadata). Only looks at the header area
 * before the first chord/tab line and only returns a tuning when the text
 * unambiguously says the guitar itself is retuned.
 */
export function detectTuningFromContent(content: string): string | null {
  const head = content.split("\n").slice(0, 40).join("\n");
  for (const line of head.split("\n")) {
    const l = line.replace(/\[\/?ch\]/g, "").trim();
    if (!l) continue;
    if (/^tun(ing|ed)\b/i.test(l)) {
      const notes = l.replace(/^tun(ing|ed)\s*:?\s*/i, "").match(/\b[A-G](?:#|b|♭|♯)?(?![A-Za-z])/g);
      if (notes && notes.length === 6) return notes.join(" ");
      if (/standard/i.test(l)) return null;
      if (/(half|1\/2|½)\s*step\s*down|down\s*(a\s*)?(half|1\/2|½)\s*step/i.test(l)) return HALF_DOWN;
      if (/(whole|full|1)\s*step\s*down|down\s*(a\s*)?(whole|full)\s*step/i.test(l)) return WHOLE_DOWN;
      if (/drop\s*d\b/i.test(l)) return "D A D G B E";
    }
    if (/^(tuned|played|the song is|this song is( played)?)\b.*\b(in|tuned)?\s*(a\s*)?(half|1\/2|½)\s*step( down)?/i.test(l)) return HALF_DOWN;
    if (/^(tuned|played)\b.*\b(whole|full)\s*step\s*down/i.test(l)) return WHOLE_DOWN;
    if (/^(standard\s+)?d\s+(standard\s+)?tuning$/i.test(l)) return WHOLE_DOWN;
    if (/^drop\s*d(\s*tuning)?$/i.test(l)) return "D A D G B E";
  }
  return null;
}
