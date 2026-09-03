// One-time importer: reads the Chrome "Tabs" bookmark folder (id 682,
// Profile 3), scrapes each tab page, and writes library/*.md entries.
// Idempotent: URLs already present in the library are skipped.
//
// Run from the repo root with Node >= 22.18 (native type stripping):
//   node scripts/import-bookmarks.ts
//   node scripts/import-bookmarks.ts --refetch folkchords.com
//     re-fetches bookmarks whose URL contains the given text (e.g. after a
//     parser fix) and rewrites the existing library entry in place, keeping
//     addedAt, bpm and scrollAdjust from the current file.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_DURATION_SEC,
  listTabs,
  makeSlug,
  writeTab,
  type TabEntry,
  type TabMeta,
} from "../lib/library.ts";
import { fetchTabFromUrl, type ParsedTab } from "../lib/ugParser.ts";

const BOOKMARKS_PATH = path.join(
  os.homedir(),
  "Library/Application Support/Google/Chrome/Profile 3/Bookmarks"
);
const FOLDER_ID = "682";

// --refetch <substring>: re-import bookmarks whose URL contains it.
const refetchIdx = process.argv.indexOf("--refetch");
const REFETCH = refetchIdx > 0 ? process.argv[refetchIdx + 1] ?? "" : "";
if (refetchIdx > 0 && !REFETCH) {
  console.error("--refetch needs a URL substring, e.g. --refetch folkchords.com");
  process.exit(1);
}

interface Bookmark {
  name: string;
  url: string;
}

function findFolder(node: any, id: string): any | null {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = findFolder(child, id);
    if (found) return found;
  }
  return null;
}

function collectBookmarks(node: any, out: Bookmark[] = []): Bookmark[] {
  for (const child of node?.children ?? []) {
    if (child.type === "folder") collectBookmarks(child, out);
    else if (child.type === "url") out.push({ name: child.name, url: child.url });
  }
  return out;
}

// Canonical key for deduping: UG tab id when present, else normalized URL.
function canonicalKey(url: string): string {
  const ugId = url.match(/ultimate-guitar\.com\/.*?(\d{4,})(?:[/?#]|$)/);
  if (ugId) return `ug:${ugId[1]}`;
  return url.replace(/^http:/, "https:").replace(/[#?].*$/, "").replace(/\/$/, "");
}

// Best-effort title/artist from a bookmark name like
// "WASTE CHORDS by Brand New @ Ultimate-Guitar.Com"
function metaFromBookmarkName(name: string): { title: string; artist: string; type: "Chords" | "Tab" } {
  let n = name
    .replace(/^\(\d+\)\s*/, "")
    .replace(/@ Ultimate-Guitar\.Com.*$/i, "")
    .replace(/for guitar.*at Ultimate-Guitar.*$/i, "")
    .replace(/Chords & Lyrics \| FolkChords\.com.*$/i, "")
    .replace(/Lyrics & Meanings \| SongMeanings.*$/i, "")
    .trim();
  const type: "Chords" | "Tab" = /\bTABS?\b/i.test(n) && !/\bCHORDS\b/i.test(n) ? "Tab" : "Chords";
  let title = n;
  let artist = "Unknown";
  const byMatch = n.match(/^(.*?)\s+by\s+(.+?)$/i);
  const dashMatch = n.match(/^(.+?)\s+-\s+(.+)$/);
  if (byMatch) {
    title = byMatch[1];
    artist = byMatch[2];
  } else if (dashMatch) {
    artist = dashMatch[1];
    title = dashMatch[2];
  }
  title = title
    .replace(/\b(chords|tabs?|acoustic chords|acoustic tab|intro tab)\b/gi, "")
    .replace(/\(ver \d+\)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim() || n;
  return { title: titleCase(title), artist: artist.trim(), type };
}

function titleCase(s: string): string {
  if (s !== s.toUpperCase()) return s; // already mixed case
  return s
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetries(url: string): Promise<ParsedTab | null> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fetchTabFromUrl(url);
    } catch (e) {
      lastErr = e;
      if (attempt < 3) await sleep(2000 * attempt);
    }
  }
  throw lastErr;
}

async function main() {
  const raw = JSON.parse(fs.readFileSync(BOOKMARKS_PATH, "utf8"));
  let folder: any = null;
  for (const root of Object.values<any>(raw.roots)) {
    if (root && typeof root === "object") {
      folder = findFolder(root, FOLDER_ID);
      if (folder) break;
    }
  }
  if (!folder) {
    console.error(`Bookmark folder id ${FOLDER_ID} not found in ${BOOKMARKS_PATH}`);
    process.exit(1);
  }

  const bookmarks = collectBookmarks(folder);
  console.log(`Found ${bookmarks.length} bookmarks in "${folder.name}"`);

  const existingByKey = new Map<string, TabEntry>();
  for (const t of listTabs()) {
    if (t.sourceUrl) existingByKey.set(canonicalKey(t.sourceUrl), t);
  }

  const seen = new Set<string>();
  let imported = 0;
  let refetched = 0;
  let stubs = 0;
  let dupes = 0;
  let already = 0;
  const failures: string[] = [];

  for (const [i, bm] of bookmarks.entries()) {
    const key = canonicalKey(bm.url);
    if (seen.has(key)) {
      dupes++;
      continue;
    }
    seen.add(key);
    const existing = existingByKey.get(key) ?? null;
    const refetch = !!existing && !!REFETCH && bm.url.includes(REFETCH);
    if (existing && !refetch) {
      already++;
      continue;
    }

    const fallback = metaFromBookmarkName(bm.name);
    const progress = `[${i + 1}/${bookmarks.length}]`;
    const isTabSite = /ultimate-guitar\.com|folkchords\.com/.test(bm.url);

    let parsed: ParsedTab | null = null;
    let error: string | null = null;
    if (isTabSite) {
      try {
        parsed = await fetchWithRetries(bm.url);
        if (!parsed) error = "no tab content found on page";
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      await sleep(1000);
    } else {
      error = "unsupported site (link kept on stub)";
    }

    const base: Omit<TabMeta, "status"> = {
      title: parsed?.title ?? fallback.title,
      artist: parsed?.artist ?? fallback.artist,
      type: parsed?.type ?? fallback.type,
      capo: parsed?.capo ?? null,
      tuning: parsed?.tuning ?? null,
      bpm: existing?.bpm ?? null,
      durationSec: parsed?.durationSec ?? existing?.durationSec ?? DEFAULT_DURATION_SEC,
      scrollAdjust: existing?.scrollAdjust ?? 1.0,
      sourceUrl: bm.url,
      addedAt: existing?.addedAt ?? new Date().toISOString().slice(0, 10),
    };

    if (parsed) {
      const slug = existing?.slug ?? makeSlug(base.artist, base.title, base.type);
      writeTab(slug, { ...base, status: "ok" }, parsed.content);
      if (existing) refetched++;
      else imported++;
      console.log(`${progress} ${existing ? "REFETCHED" : "ok"}    ${base.artist} — ${base.title}`);
    } else if (existing) {
      // Re-fetch failed: keep the current file untouched.
      failures.push(`${base.artist} — ${base.title}: ${error} (existing entry kept)`);
      console.log(`${progress} KEPT  ${base.artist} — ${base.title} (${error})`);
    } else {
      const slug = makeSlug(base.artist, base.title, base.type);
      writeTab(slug, { ...base, status: "stub" }, "");
      stubs++;
      failures.push(`${base.artist} — ${base.title}: ${error}`);
      console.log(`${progress} STUB  ${base.artist} — ${base.title} (${error})`);
    }
  }

  console.log("\n=== Import report ===");
  console.log(`Imported:            ${imported}`);
  if (REFETCH) console.log(`Re-fetched:          ${refetched}`);
  console.log(`Stubs (fetch/parse): ${stubs}`);
  console.log(`Duplicate bookmarks: ${dupes}`);
  console.log(`Already in library:  ${already}`);
  if (failures.length) {
    console.log("\nStub details:");
    for (const f of failures) console.log(`  - ${f}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
