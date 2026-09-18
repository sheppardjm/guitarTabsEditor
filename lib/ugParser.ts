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
  content: string;
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

  const body = content.replace(/\r\n/g, "\n").trim() + "\n";
  if (!tuning) tuning = detectTuningFromContent(body);

  const rawType = String(tab.type ?? "");
  return {
    title: String(tab.song_name ?? "Untitled"),
    artist: String(tab.artist_name ?? "Unknown"),
    type: rawType.toLowerCase().startsWith("chord") ? "Chords" : "Tab",
    capo,
    tuning,
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
