"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { TabEntry } from "@/lib/library";

type TabListItem = Omit<TabEntry, "content">;
type SortKey = "artist" | "title" | "recent";

export default function LibraryBrowser({ tabs }: { tabs: TabListItem[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("artist");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = tabs;
    if (q) {
      list = tabs.filter(
        (t) =>
          t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
      );
    }
    const sorted = [...list];
    if (sort === "artist") {
      sorted.sort(
        (a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title)
      );
    } else if (sort === "title") {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
    } else {
      sorted.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    }
    return sorted;
  }, [tabs, query, sort]);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">
          Tabs <span className="text-muted text-base font-normal">({tabs.length})</span>
        </h1>
        <Link
          href="/new"
          className="rounded-md bg-accent-2 px-4 py-2 text-sm font-semibold text-background hover:opacity-90"
        >
          + Add tab
        </Link>
      </div>

      <div className="mb-6 flex gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title or artist…"
          autoFocus
          className="w-full rounded-md border border-border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-md border border-border-line bg-surface px-2 py-2 text-sm"
        >
          <option value="artist">By artist</option>
          <option value="title">By title</option>
          <option value="recent">Recently added</option>
        </select>
      </div>

      <ul className="divide-y divide-border-line rounded-lg border border-border-line bg-surface">
        {filtered.map((t) => (
          <li key={t.slug}>
            <Link
              href={`/tab/${t.slug}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{t.title}</div>
                <div className="truncate text-sm text-muted">{t.artist}</div>
              </div>
              {t.capo ? (
                <span className="shrink-0 text-xs text-muted">capo {t.capo}</span>
              ) : null}
              <span
                className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${
                  t.type === "Chords"
                    ? "bg-accent/15 text-accent"
                    : "bg-accent-2/15 text-accent-2"
                }`}
              >
                {t.type}
              </span>
              {t.status === "stub" ? (
                <span className="shrink-0 rounded bg-red-400/15 px-2 py-0.5 text-xs font-semibold text-red-400">
                  stub
                </span>
              ) : null}
            </Link>
          </li>
        ))}
        {filtered.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-muted">
            {tabs.length === 0
              ? "Library is empty — run the import script or add a tab."
              : "No matches."}
          </li>
        ) : null}
      </ul>
    </main>
  );
}
