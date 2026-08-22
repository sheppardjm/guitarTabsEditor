import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export type TabType = "Chords" | "Tab";
export type TabStatus = "ok" | "stub";

export interface TabMeta {
  title: string;
  artist: string;
  type: TabType;
  capo: number | null;
  tuning: string | null;
  bpm: number | null;
  durationSec: number;
  scrollAdjust: number;
  sourceUrl: string | null;
  addedAt: string;
  status: TabStatus;
}

export interface TabEntry extends TabMeta {
  slug: string;
  content: string;
}

export const DEFAULT_DURATION_SEC = 210;

export function libraryDir(): string {
  const dir = path.join(process.cwd(), "library");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "untitled";
}

export function makeSlug(artist: string, title: string, type: TabType): string {
  const base = `${slugify(artist)}__${slugify(title)}__${type.toLowerCase()}`;
  let slug = base;
  let n = 2;
  while (fs.existsSync(entryPath(slug))) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

function entryPath(slug: string): string {
  return path.join(libraryDir(), `${slug}.md`);
}

function coerceMeta(data: Record<string, unknown>): TabMeta {
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  return {
    title: typeof data.title === "string" ? data.title : "Untitled",
    artist: typeof data.artist === "string" ? data.artist : "Unknown",
    type: data.type === "Tab" ? "Tab" : "Chords",
    capo: num(data.capo),
    tuning: typeof data.tuning === "string" && data.tuning ? data.tuning : null,
    bpm: num(data.bpm),
    durationSec: num(data.durationSec) ?? DEFAULT_DURATION_SEC,
    scrollAdjust: num(data.scrollAdjust) ?? 1.0,
    sourceUrl:
      typeof data.sourceUrl === "string" && data.sourceUrl ? data.sourceUrl : null,
    addedAt:
      typeof data.addedAt === "string"
        ? data.addedAt
        : new Date().toISOString().slice(0, 10),
    status: data.status === "stub" ? "stub" : "ok",
  };
}

export function listTabs(): TabEntry[] {
  const dir = libraryDir();
  const entries: TabEntry[] = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".md")) continue;
    try {
      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      const { data, content } = matter(raw);
      entries.push({
        slug: file.replace(/\.md$/, ""),
        ...coerceMeta(data),
        content: content.replace(/^\n/, ""),
      });
    } catch {
      // skip unreadable entries rather than breaking the whole library
    }
  }
  entries.sort(
    (a, b) =>
      a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title)
  );
  return entries;
}

export function getTab(slug: string): TabEntry | null {
  const p = entryPath(slug);
  if (!fs.existsSync(p)) return null;
  const { data, content } = matter(fs.readFileSync(p, "utf8"));
  return { slug, ...coerceMeta(data), content: content.replace(/^\n/, "") };
}

export function writeTab(slug: string, meta: TabMeta, content: string): void {
  const file = matter.stringify("\n" + content.replace(/\r\n/g, "\n"), meta);
  fs.writeFileSync(entryPath(slug), file, "utf8");
}

export function deleteTab(slug: string): void {
  const p = entryPath(slug);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

export function findBySourceUrl(sourceUrl: string): TabEntry | null {
  return listTabs().find((t) => t.sourceUrl === sourceUrl) ?? null;
}
