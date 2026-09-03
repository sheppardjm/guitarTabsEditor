// Glyph harvesting / labelling helper for the FolkChords parser.
//
// FolkChords draws chord names as SVG outlines; lib/folkchordsGlyphs.ts decodes
// them with a table of known character outlines. This script finds outlines
// the table does not know yet and renders them into an HTML contact sheet so a
// human can label them and add `{ ch: "x", d: "..." }` lines to GLYPH_TABLE.
//
//   node scripts/folkchords-glyphs.ts --sitemap            all songs on the site
//   node scripts/folkchords-glyphs.ts <url|file.html> ...  specific pages
//
// Fetched pages are cached under --cache <dir> (default .folkchords-cache, git
// ignored) so re-runs are offline. Output: <cache>/unknown-glyphs.html plus a
// summary of every chord name containing "?" per page.

import fs from "node:fs";
import path from "node:path";
import { parseFolkChordsHtml } from "../lib/folkchords.ts";
import { unknownGlyphs } from "../lib/folkchordsGlyphs.ts";
import { BROWSER_UA } from "../lib/ugParser.ts";

const args = process.argv.slice(2);
const flag = (name: string): string | null => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] ?? null : null;
};
const useSitemap = args.includes("--sitemap");
const cacheDir = flag("--cache") ?? ".folkchords-cache";
const inputs = args.filter(
  (a, i) => !a.startsWith("--") && args[i - 1] !== "--cache"
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": BROWSER_UA, Accept: "text/html,application/xml" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function loadPage(src: string): Promise<{ name: string; html: string }> {
  if (!/^https?:/.test(src)) {
    return { name: path.basename(src), html: fs.readFileSync(src, "utf8") };
  }
  const slug = new URL(src).pathname.replace(/^\/|\/$/g, "").replace(/[^a-z0-9-]/gi, "_");
  const file = path.join(cacheDir, `${slug}.html`);
  if (fs.existsSync(file) && fs.statSync(file).size > 0) {
    return { name: slug, html: fs.readFileSync(file, "utf8") };
  }
  const html = await fetchText(src);
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(file, html, "utf8");
  await sleep(1000);
  return { name: slug, html };
}

async function main() {
  let sources = inputs;
  if (useSitemap) {
    const xml = await fetchText("https://folkchords.com/sitemap.xml");
    const urls = [...xml.matchAll(/<loc>([^<]*-chords\/)<\/loc>/g)].map((m) => m[1]);
    console.log(`sitemap: ${urls.length} song pages`);
    sources = [...urls, ...sources];
  }
  if (!sources.length) {
    console.error("usage: node scripts/folkchords-glyphs.ts [--sitemap] [--cache dir] [url|file ...]");
    process.exit(1);
  }

  const chordNames = new Map<string, number>();
  const pagesWithUnknown: string[] = [];
  let pages = 0;
  for (const src of sources) {
    let page: { name: string; html: string };
    try {
      page = await loadPage(src);
    } catch (e) {
      console.log(`FAIL ${src}: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    const tab = parseFolkChordsHtml(page.html);
    pages++;
    if (!tab) {
      console.log(`no tab content: ${page.name}`);
      continue;
    }
    const names = [...tab.content.matchAll(/\[ch\]([^[]*)\[\/ch\]/g)].map((m) => m[1]);
    for (const n of names) chordNames.set(n, (chordNames.get(n) ?? 0) + 1);
    const bad = [...new Set(names.filter((n) => n.includes("?")))];
    if (bad.length) pagesWithUnknown.push(`${page.name}: ${bad.join(" ")}`);
  }

  const unknown = unknownGlyphs();
  console.log(`\npages parsed: ${pages}`);
  console.log(`distinct chord names: ${chordNames.size}`);
  console.log(
    [...chordNames.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([n, c]) => `${n}×${c}`)
      .join("  ")
  );
  if (pagesWithUnknown.length) {
    console.log(`\npages with undecoded chords (${pagesWithUnknown.length}):`);
    for (const p of pagesWithUnknown) console.log(`  ${p}`);
  }
  console.log(`\nunknown glyphs: ${unknown.length}`);
  if (unknown.length) {
    const cells = unknown.map(
      (g, i) =>
        `<div class="g"><div class="n">#${i}</div>` +
        `<svg width="40" height="18" viewBox="-1 0 20 18"><path d="${g.d}"/></svg>` +
        `<pre>{ ch: "?", d: "${g.d}" },</pre></div>`
    );
    const html =
      `<!doctype html><meta charset="utf-8"><title>Unknown FolkChords glyphs</title>` +
      `<style>body{font-family:sans-serif}.g{margin:12px 0;padding:8px;border:1px solid #ccc}` +
      `svg{transform:scale(3);transform-origin:left top;margin:0 0 40px 0;display:block}` +
      `pre{white-space:pre-wrap;word-break:break-all;font-size:11px;user-select:all}</style>` +
      `<p>Label each glyph, replace <code>"?"</code> with the character, and paste the line into GLYPH_TABLE in lib/folkchordsGlyphs.ts.</p>` +
      cells.join("\n");
    fs.mkdirSync(cacheDir, { recursive: true });
    const out = path.join(cacheDir, "unknown-glyphs.html");
    fs.writeFileSync(out, html, "utf8");
    console.log(`contact sheet: ${out}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
