import { parseFolkChordsHtml } from "./folkchords.ts";
import { detectTuningFromContent } from "./tuning.ts";
// Parsers for tab sources: Ultimate Guitar (js-store JSON) here, FolkChords
// (SVG-glyph chords) in folkchords.ts, plus a fetch helper with a browser UA.

export interface ParsedTab {
  title: string;
  artist: string;
  type: "Chords" | "Tab";
  capo: number | null;
  tuning: string | null;
  /** Song length in seconds when the source provides it. */
  durationSec?: number | null;
  /** Strumming patterns when the source provides them ([] = none listed). */
  strumming?: StrumPattern[];
  content: string;
}

/**
 * One strumming pattern as Ultimate Guitar encodes it. `strokes` holds one
 * UG stroke code per subdivision slot:
 *   1 down   2 down muted   3 down accented
 * 101 up   102 up muted   103 up accented
 * 201 palm-muted   202 no stroke (let ring)   203 rest
 * `division` is the note value of a slot (4/8/16); `triplet` makes it a
 * triplet of that value (3 slots where there would be 2).
 */
export interface StrumPattern {
  part: string;
  bpm: number;
  division: 4 | 8 | 16;
  triplet: boolean;
  strokes: number[];
}

export const STRUM_CODES = new Set([1, 2, 3, 101, 102, 103, 201, 202, 203]);

export function coerceStrumPatterns(raw: unknown): StrumPattern[] | null {
  if (!Array.isArray(raw)) return null;
  const out: StrumPattern[] = [];
  for (const p of raw as Record<string, unknown>[]) {
    if (!p || typeof p !== "object") continue;
    const bpm = Number(p.bpm);
    const division = Number(p.division);
    const strokes = Array.isArray(p.strokes)
      ? p.strokes.map(Number).filter((c) => STRUM_CODES.has(c))
      : [];
    if (!Number.isFinite(bpm) || bpm <= 0) continue;
    if (division !== 4 && division !== 8 && division !== 16) continue;
    if (!strokes.length) continue;
    out.push({
      part: typeof p.part === "string" ? p.part : "",
      bpm: Math.round(bpm),
      division,
      triplet: !!p.triplet,
      strokes,
    });
  }
  return out;
}

/** One entry from Ultimate Guitar's "versions" list for a song. */
export interface UgVersion {
  id: number;
  version: number;
  type: "Chords" | "Tab";
  url: string;
  rating: number;
  votes: number;
  difficulty: string | null;
  description: string | null;
}

/** Numeric tab id at the end of an Ultimate Guitar tab URL, or null. */
export function ugTabId(url: string | null | undefined): number | null {
  if (!url || !/ultimate-guitar\.com/.test(url)) return null;
  const m = url.match(/-(\d{4,})(?:[/?#]|$)/);
  return m ? Number(m[1]) : null;
}

export const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// Attribute-level unescape for the js-store blob (&amp; last, on purpose).
function unescapeHtml(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  rsquo: "\u2019", lsquo: "\u2018", rdquo: "\u201d", ldquo: "\u201c",
  sbquo: "\u201a", bdquo: "\u201e", prime: "\u2032",
  ndash: "\u2013", mdash: "\u2014", hellip: "\u2026", middot: "\u00b7", bull: "\u2022",
  deg: "\u00b0", times: "\u00d7", copy: "\u00a9", reg: "\u00ae", trade: "\u2122",
  or: "\u2228", and: "\u2227", darr: "\u2193", uarr: "\u2191", larr: "\u2190", rarr: "\u2192",
  flat: "\u266d", sharp: "\u266f", natural: "\u266e",
  eacute: "\u00e9", egrave: "\u00e8", aacute: "\u00e1", agrave: "\u00e0", iacute: "\u00ed",
  oacute: "\u00f3", uacute: "\u00fa", ntilde: "\u00f1", ccedil: "\u00e7", uuml: "\u00fc",
  ouml: "\u00f6", auml: "\u00e4", Eacute: "\u00c9", szlig: "\u00df",
};

/** Decode HTML entities left inside tab text (named, decimal and hex). */
export function decodeEntities(s: string): string {
  if (!s.includes("&")) return s;
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, body: string) => {
    if (body[0] === "#") {
      const code = body[1].toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()] ?? m;
  });
}

// Untyped JSON from UG's page store; fields are validated where they are read.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UgRaw = any;

// The `store.page.data` object from UG's embedded js-store JSON blob.
function ugPageData(html: string): UgRaw | null {
  const m = html.match(/class="js-store" data-content="([\s\S]*?)"><\/div>/);
  if (!m) return null;
  try {
    return JSON.parse(unescapeHtml(m[1]))?.store?.page?.data ?? null;
  } catch {
    return null;
  }
}

function ugVersionFromRaw(v: UgRaw): UgVersion | null {
  const rawType = String(v?.type ?? "").toLowerCase();
  // Skip Official/Pro/Bass/Ukulele/etc.: paywalled or not guitar chords/tab.
  const type: UgVersion["type"] | null =
    rawType === "chords" ? "Chords" : rawType === "tab" ? "Tab" : null;
  const id = Number(v?.id);
  const url = typeof v?.tab_url === "string" ? v.tab_url : null;
  if (!type || !Number.isFinite(id) || !url) return null;
  const desc = typeof v.version_description === "string" ? v.version_description.trim() : "";
  const diff = typeof v.difficulty === "string" ? v.difficulty.trim() : "";
  return {
    id,
    version: Number(v.version) || 1,
    type,
    url,
    rating: Number(v.rating) || 0,
    votes: Number(v.votes) || 0,
    difficulty: diff || null,
    description: desc || null,
  };
}

export interface UgVersionList {
  /** The tab the page itself shows (null if it is not a Chords/Tab type). */
  current: UgVersion | null;
  /** Every other Chords/Tab version of the same song, best-voted first. */
  others: UgVersion[];
}

export function parseUgVersions(html: string): UgVersionList | null {
  const page = ugPageData(html);
  if (!page?.tab) return null;
  const current = ugVersionFromRaw(page.tab);
  const raw: unknown[] = Array.isArray(page.tab_view?.versions) ? page.tab_view.versions : [];
  const others = raw
    .map(ugVersionFromRaw)
    .filter((v): v is UgVersion => v !== null && v.id !== current?.id)
    .sort((a, b) => b.votes - a.votes || b.rating - a.rating || a.version - b.version);
  return { current, others };
}

export async function fetchUgVersions(url: string): Promise<UgVersionList | null> {
  const res = await fetch(url, {
    headers: { "User-Agent": BROWSER_UA, Accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseUgVersions(await res.text());
}

// UG's tab_view.strummings -> our StrumPattern[] (drops malformed entries).
function ugStrummings(page: UgRaw): StrumPattern[] {
  const raw: UgRaw[] = Array.isArray(page?.tab_view?.strummings) ? page.tab_view.strummings : [];
  return (
    coerceStrumPatterns(
      raw.map((s) => ({
        part: s?.part,
        bpm: s?.bpm,
        division: s?.denuminator,
        triplet: !!s?.is_triplet,
        strokes: Array.isArray(s?.measures)
          ? s.measures.map((m: UgRaw) => (typeof m === "number" ? m : m?.measure))
          : [],
      }))
    ) ?? []
  );
}

export function parseUgHtml(html: string): ParsedTab | null {
  const page = ugPageData(html);
  const tab = page?.tab;
  const content: string | undefined = page?.tab_view?.wiki_tab?.content;
  if (!tab || typeof content !== "string" || !content.trim()) return null;

  const meta = page?.tab_view?.meta ?? {};
  let tuning: string | null = null;
  if (typeof meta.tuning === "string") tuning = meta.tuning;
  else if (meta.tuning && typeof meta.tuning.value === "string")
    tuning = meta.tuning.value;

  const capoRaw = meta.capo;
  const capo =
    typeof capoRaw === "number" && capoRaw > 0
      ? capoRaw
      : typeof capoRaw === "string" && parseInt(capoRaw, 10) > 0
        ? parseInt(capoRaw, 10)
        : null;

  const body = decodeEntities(content.replace(/\r\n/g, "\n").trim()) + "\n";
  if (!tuning) tuning = detectTuningFromContent(body);

  const rawType = String(tab.type ?? "");
  return {
    title: decodeEntities(String(tab.song_name ?? "Untitled")),
    artist: decodeEntities(String(tab.artist_name ?? "Unknown")),
    type: rawType.toLowerCase().startsWith("chord") ? "Chords" : "Tab",
    capo,
    tuning,
    strumming: ugStrummings(page),
    content: body,
  };
}

// FolkChords' WordPress REST body keeps every section header, unlike the page.
async function fetchFolkChordsRest(url: string): Promise<string | null> {
  const slug = new URL(url).pathname.split("/").filter(Boolean).pop();
  if (!slug) return null;
  const api = `https://folkchords.com/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&_fields=content`;
  const res = await fetch(api, {
    headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return null;
  const posts: unknown = await res.json();
  const first = Array.isArray(posts) ? posts[0] : null;
  const rendered = (first as { content?: { rendered?: unknown } } | null)?.content?.rendered;
  return typeof rendered === "string" && rendered.trim() ? rendered : null;
}

export async function fetchTabFromUrl(url: string): Promise<ParsedTab | null> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const host = new URL(url).hostname;
  if (host.includes("ultimate-guitar.com")) return parseUgHtml(html);
  if (host.includes("folkchords.com")) {
    const rest = await fetchFolkChordsRest(url).catch(() => null);
    return parseFolkChordsHtml(html, rest);
  }
  // Unknown source: try UG-style first, then give up.
  return parseUgHtml(html);
}
