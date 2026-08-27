// Maps chord names as they appear in tabs ("Am7", "D/F#", "Bbsus4") to
// fingering positions from @tombatossals/chords-db. The db is ~600 KB so it
// is loaded lazily on first use and cached.

export type ChordPosition = {
  frets: number[]; // 6 entries, low E → high e; -1 muted, 0 open
  fingers: number[];
  baseFret: number;
  barres: number[];
  capo?: boolean;
};

type ChordEntry = { key: string; suffix: string; positions: ChordPosition[] };
type GuitarDb = { chords: Record<string, ChordEntry[]> };

// chords-db keys spell sharps as "Csharp"/"Fsharp" and prefer flats elsewhere.
const KEY_MAP: Record<string, string> = {
  C: "C", "B#": "C",
  "C#": "Csharp", Db: "Csharp",
  D: "D",
  "D#": "Eb", Eb: "Eb",
  E: "E", Fb: "E",
  F: "F", "E#": "F",
  "F#": "Fsharp", Gb: "Fsharp",
  G: "G",
  "G#": "Ab", Ab: "Ab",
  A: "A",
  "A#": "Bb", Bb: "Bb",
  B: "B", Cb: "B",
};

// The db's slash suffixes use sharp spellings except Bb ("/F#", "/Bb").
const BASS_MAP: Record<string, string> = {
  Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", "A#": "Bb",
};

const SUFFIX_ALIASES: Record<string, string> = {
  "": "major", M: "major", maj: "major", major: "major",
  m: "minor", min: "minor", "-": "minor", minor: "minor",
  sus: "sus4", sus4: "sus4", sus2: "sus2",
  "7sus": "7sus4", "7sus4": "7sus4",
  dim: "dim", o: "dim", "°": "dim",
  dim7: "dim7", "°7": "dim7",
  aug: "aug", "+": "aug", "+5": "aug",
  "6": "6", "6/9": "69", "69": "69",
  "7": "7", m7: "m7", min7: "m7",
  maj7: "maj7", M7: "maj7", "Δ": "maj7", "Δ7": "maj7",
  "7b5": "7b5", "7#5": "aug7", aug7: "aug7",
  "9": "9", m9: "m9", maj9: "maj9", M9: "maj9",
  add9: "add9", "(add9)": "add9", madd9: "madd9", "m(add9)": "madd9",
  "11": "11", m11: "m11", maj11: "maj11",
  "13": "13", maj13: "maj13",
  m6: "m6", "m6/9": "m69", m69: "m69",
  m7b5: "m7b5", "ø": "m7b5", "ø7": "m7b5",
  mmaj7: "mmaj7", mM7: "mmaj7", "m(maj7)": "mmaj7",
  "7b9": "7b9", "7#9": "7#9", "9b5": "9b5", "9#11": "9#11", aug9: "aug9",
};

let dbPromise: Promise<GuitarDb> | null = null;

function loadDb(): Promise<GuitarDb> {
  if (!dbPromise) {
    dbPromise = import("@tombatossals/chords-db/lib/guitar.json").then(
      (mod) => (mod as { default?: GuitarDb }).default ?? (mod as unknown as GuitarDb)
    );
  }
  return dbPromise;
}

function normalizeAccidentals(s: string): string {
  return s.replace(/♯/g, "#").replace(/♭/g, "b");
}

export type ChordMatch = {
  name: string;
  positions: ChordPosition[];
};

export async function findChord(rawName: string): Promise<ChordMatch | null> {
  const name = normalizeAccidentals(rawName.trim());
  const m = name.match(/^([A-G][#b]?)(.*)$/);
  if (!m) return null;

  const root = m[1];
  let rest = m[2];
  let bass: string | null = null;
  // A trailing "/<note>" is a bass note; suffixes like "6/9" are not.
  const slash = rest.match(/^(.*)\/([A-G][#b]?)$/);
  if (slash) {
    rest = slash[1];
    bass = slash[2];
  }

  const key = KEY_MAP[root];
  if (!key) return null;
  const db = await loadDb();
  const entries = db.chords[key];
  if (!entries) return null;

  const suffix = SUFFIX_ALIASES[rest] ?? rest;
  const candidates: string[] = [];
  if (bass) {
    const b = BASS_MAP[bass] ?? bass;
    if (suffix === "major") candidates.push(`/${b}`);
    if (suffix === "minor") candidates.push(`m/${b}`);
  }
  candidates.push(suffix);

  for (const c of candidates) {
    const entry = entries.find((e) => e.suffix === c);
    if (entry) return { name, positions: entry.positions };
  }
  return null;
}
