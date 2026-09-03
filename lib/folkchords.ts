// Parser for FolkChords.com song pages.
//
// Two body sources. The WordPress REST body (wp-json .../posts?slug=) is
// preferred because it keeps every section header ([Verse 1], [Instrumental]);
// the rendered page only emits [Chorus]-style headers. Both are converted to
// the same token stream, so layout code is shared.
//
// REST shape: <p>[Verse 1]<br />\n<svg/>. Prophecies and a <svg/>small-town<br />...</p>
//   "." right after a chord / at line edges / in runs = spacer, "~" = decorative
//   marker inside a word (drop), <svg> = chord, one <p> per section.
//
// Page shape (inside <div id="fc-lyrics">):
//   <div class="fc-section">[Chorus]</div>          section header
//   <div class="fc-line"> ... </div>                one lyric line, with chords
//     inline right before the syllable they land on, each as
//     <span class="csf|cssb|cst"><svg><path d="..."/></svg></span>
//     (csf = line start, cssb = after a space, cst = "tight": mid-word or
//     hard against the next word), plus <i class="csp"></i> spacers.
// Chord names are SVG glyph outlines (see folkchordsGlyphs.ts). Output uses the
// library's Ultimate Guitar conventions: a [ch]..[/ch] chord line column-aligned
// above the lyric line, the pair wrapped in [tab]..[/tab].

import { decodeChordPath } from "./folkchordsGlyphs.ts";
import { detectTuningFromContent } from "./tuning.ts";
import type { ParsedTab } from "./ugParser.ts";

function unescapeHtml(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#8217;/g, "’")
    .replace(/&#8216;/g, "‘")
    .replace(/&#8220;/g, "“")
    .replace(/&#8221;/g, "”")
    .replace(/&#8230;/g, "…")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

type Token =
  | { kind: "text"; text: string }
  | { kind: "chord"; name: string };

// Any chord SVG (page: wrapped in <span class="csf|cssb|cst">, REST: bare).
const CHORD_RE = /(?:<span class="(?:csf|cssb|cst)">)?<svg[^>]*><path[^>]*\sd="([^"]+)"[^>]*\/?>(?:<\/path>)?<\/svg>(?:<\/span>)?/g;

function tokenizeLine(html: string, cleanText: (s: string) => string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  for (const m of html.matchAll(CHORD_RE)) {
    if (m.index > last) tokens.push({ kind: "text", text: html.slice(last, m.index) });
    tokens.push({ kind: "chord", name: decodeChordPath(m[1]) });
    last = m.index + m[0].length;
  }
  if (last < html.length) tokens.push({ kind: "text", text: html.slice(last) });
  return tokens.map((t) =>
    t.kind === "text" ? { kind: "text", text: cleanText(t.text) } : t
  );
}

const cleanPageText = (s: string): string => unescapeHtml(s.replace(/<[^>]+>/g, ""));

// REST text: strip tags, drop "~" markers, turn spacer dots into spaces. A "."
// counts as a spacer when it touches a chord (line/segment edge), another ".",
// or sits at the segment start; a sentence period (letter before, space after)
// is kept.
const cleanRestText = (s: string): string =>
  unescapeHtml(s.replace(/<[^>]+>/g, ""))
    .replace(/~/g, "")
    .replace(/^\.+|\.+$|\.{2,}/g, (m) => " ".repeat(m.length));

/** Render one fc-line into either a lyric line, a chord line, or a [tab] pair. */
function renderLine(html: string, cleanText: (s: string) => string): string {
  let lyric = "";
  let chordLine = "";
  let chordCols = 0; // visible width of chordLine (without [ch] markup)
  let hasChord = false;
  for (const t of tokenizeLine(html, cleanText)) {
    if (t.kind === "text") {
      // Drop leading whitespace (line-start chords are followed by a spacer).
      lyric += lyric ? t.text : t.text.trimStart();
      continue;
    }
    hasChord = true;
    const visibleLyric = lyric.replace(/\s+/g, " ");
    let col = visibleLyric.length;
    if (chordCols > 0) col = Math.max(col, chordCols + 1);
    chordLine += " ".repeat(col - chordCols) + `[ch]${t.name}[/ch]`;
    chordCols = col + t.name.length;
  }
  lyric = lyric.replace(/\s+/g, " ").trimEnd();
  if (!hasChord) return lyric;
  if (!lyric.trim()) return chordLine;
  return `[tab]${chordLine}\n${lyric}[/tab]`;
}

function metaFromJsonLd(html: string): { title: string | null; artist: string | null } {
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const data: unknown = JSON.parse(m[1]);
      const nodes: unknown[] = Array.isArray(data) ? data : [data];
      for (const n of nodes) {
        if (!n || typeof n !== "object") continue;
        const o = n as { "@type"?: unknown; name?: unknown; byArtist?: { name?: unknown } };
        if (o["@type"] === "MusicRecording") {
          return {
            title: typeof o.name === "string" ? o.name : null,
            artist: typeof o.byArtist?.name === "string" ? o.byArtist.name : null,
          };
        }
      }
    } catch {
      // ignore malformed blocks
    }
  }
  return { title: null, artist: null };
}

function metaFromTitleTag(html: string): { title: string; artist: string } {
  // "Artist - Song Chords & Lyrics | FolkChords.com"
  const m = html.match(/<title>([^<]+)<\/title>/i);
  if (!m) return { title: "Untitled", artist: "Unknown" };
  const t = unescapeHtml(m[1]).replace(/\s*Chords( & Lyrics)?\s*\|.*$/i, "").trim();
  const dash = t.indexOf(" - ");
  if (dash > 0) return { artist: t.slice(0, dash).trim(), title: t.slice(dash + 3).trim() };
  return { title: t, artist: "Unknown" };
}

function pushHeader(out: string[], header: string): void {
  if (out.length && out[out.length - 1] !== "") out.push("");
  out.push(header);
}

/** Body from the rendered page's fc-line / fc-section markup. */
function bodyFromPage(html: string): string | null {
  const start = html.indexOf('id="fc-lyrics"');
  if (start < 0) return null;
  let end = html.length;
  for (const marker of ['class="fc-related', "</article>"]) {
    const i = html.indexOf(marker, start);
    if (i > 0 && i < end) end = i;
  }
  const body = html.slice(start, end);

  const blocks = [
    ...body.matchAll(/<div class="(fc-section|fc-line)">([\s\S]*?)<\/div>/g),
  ];
  if (!blocks.some((b) => b[1] === "fc-line")) return null;

  const out: string[] = [];
  for (const b of blocks) {
    if (b[1] === "fc-section") pushHeader(out, cleanPageText(b[2]).trim());
    else out.push(renderLine(b[2], cleanPageText));
  }
  return out.join("\n");
}

/** Body from the WordPress REST `content.rendered` HTML. */
export function bodyFromRest(rendered: string): string | null {
  const out: string[] = [];
  let sawLine = false;
  for (const p of rendered.matchAll(/<p>([\s\S]*?)<\/p>/g)) {
    if (out.length && out[out.length - 1] !== "") out.push("");
    for (const raw of p[1].split(/<br\s*\/?>\r?\n?/)) {
      const line = raw.replace(/^\s+|\s+$/g, "");
      if (!line) continue;
      const plain = cleanRestText(line).trim();
      if (/^\[[^\]]+\]$/.test(plain) && !line.includes("<svg")) {
        pushHeader(out, plain);
      } else {
        out.push(renderLine(line, cleanRestText));
        sawLine = true;
      }
    }
  }
  return sawLine ? out.join("\n") : null;
}

export function parseFolkChordsHtml(
  html: string,
  restContent?: string | null
): ParsedTab | null {
  const body = (restContent ? bodyFromRest(restContent) : null) ?? bodyFromPage(html);
  if (!body) return null;
  const content = body.replace(/\n{3,}/g, "\n\n").trim() + "\n";

  const ld = metaFromJsonLd(html);
  const tt = metaFromTitleTag(html);
  const capoMatch = html.match(/id="fc-capo"[^>]*>\s*Capo:\s*(\d+)/i);
  const durMatch = html.match(/fcData\s*=\s*\{[^}]*"videoDuration"\s*:\s*"?(\d+)"?/);

  return {
    title: ld.title ?? tt.title,
    artist: ld.artist ?? tt.artist,
    type: "Chords",
    capo: capoMatch ? parseInt(capoMatch[1], 10) : null,
    tuning: detectTuningFromContent(content),
    durationSec: durMatch ? parseInt(durMatch[1], 10) : null,
    content,
  };
}
