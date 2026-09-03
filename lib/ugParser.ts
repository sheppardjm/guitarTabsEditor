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

export function parseUgHtml(html: string): ParsedTab | null {
  const m = html.match(/class="js-store" data-content="([\s\S]*?)"><\/div>/);
  if (!m) return null;
  let store: unknown;
  try {
    store = JSON.parse(unescapeHtml(m[1]));
  } catch {
    return null;
  }
  const page = (store as any)?.store?.page?.data;
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
