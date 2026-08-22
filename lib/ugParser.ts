// Parsers for tab sources: Ultimate Guitar (js-store JSON) and FolkChords
// (WordPress entry-content), plus a fetch helper with a browser user agent.

export interface ParsedTab {
  title: string;
  artist: string;
  type: "Chords" | "Tab";
  capo: number | null;
  tuning: string | null;
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

  const rawType = String(tab.type ?? "");
  return {
    title: String(tab.song_name ?? "Untitled"),
    artist: String(tab.artist_name ?? "Unknown"),
    type: rawType.toLowerCase().startsWith("chord") ? "Chords" : "Tab",
    capo,
    tuning,
    content: content.replace(/\r\n/g, "\n").trim() + "\n",
  };
}

export function parseFolkChordsHtml(html: string, url: string): ParsedTab | null {
  // Title pattern: "Artist - Song Chords & Lyrics | FolkChords.com"
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  let artist = "Unknown";
  let title = "Untitled";
  if (titleMatch) {
    const t = unescapeHtml(titleMatch[1])
      .replace(/\s*Chords( & Lyrics)?\s*\|.*$/i, "")
      .trim();
    const dash = t.indexOf(" - ");
    if (dash > 0) {
      artist = t.slice(0, dash).trim();
      title = t.slice(dash + 3).trim();
    } else {
      title = t;
    }
  }

  // Prefer <pre> blocks (where chord sheets live); fall back to entry-content text.
  const preBlocks = [...html.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/gi)].map(
    (m) => m[1]
  );
  let body = preBlocks.join("\n\n");
  if (!body.trim()) {
    const entry = html.match(
      /<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i
    );
    body = entry ? entry[1] : "";
  }
  if (!body.trim()) return null;

  const text = unescapeHtml(
    body
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) return null;

  void url;
  return { title, artist, type: "Chords", capo: null, tuning: null, content: text + "\n" };
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
  if (host.includes("folkchords.com")) return parseFolkChordsHtml(html, url);
  // Unknown source: try UG-style first, then give up.
  return parseUgHtml(html);
}
