import Link from "next/link";
import { notFound } from "next/navigation";
import { importVersionAction } from "@/app/actions";
import { getTab, listTabs } from "@/lib/library";
import { fetchUgVersions, ugTabId, type UgVersion } from "@/lib/ugParser";

// Local-only: lists every Chords/Tab version of this song on Ultimate Guitar
// (read live from the source page) and adds one to the library on tap.
export const dynamic = "force-dynamic";

function stars(rating: number): string {
  const n = Math.round(rating);
  return "★".repeat(n) + "☆".repeat(Math.max(0, 5 - n));
}

export default async function VersionsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tab = getTab(slug);
  if (!tab) notFound();
  if (!tab.sourceUrl || !ugTabId(tab.sourceUrl)) notFound();

  let list: Awaited<ReturnType<typeof fetchUgVersions>> = null;
  let error: string | null = null;
  try {
    list = await fetchUgVersions(tab.sourceUrl);
    if (!list) error = "Could not read the versions list from the source page.";
  } catch (e) {
    error = e instanceof Error ? e.message : "Fetch failed.";
  }

  // UG tab id -> library slug, so versions already imported link instead of re-adding.
  const inLibrary = new Map<number, string>();
  for (const t of listTabs()) {
    const id = ugTabId(t.sourceUrl);
    if (id) inLibrary.set(id, t.slug);
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6">
      <Link href={`/tab/${tab.slug}`} className="text-sm text-muted hover:text-foreground">
        ← {tab.title}
      </Link>
      <h1 className="mt-1 text-2xl font-bold">Other versions</h1>
      <div className="mb-6 text-muted">
        {tab.artist} — {tab.title}
        {list?.current ? (
          <span className="ml-2 text-sm">
            (you have {list.current.type.toLowerCase()} ver {list.current.version})
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-400/40 bg-surface p-4 text-sm text-red-400">
          {error}
        </div>
      ) : list && list.others.length === 0 ? (
        <div className="rounded-lg border border-border-line bg-surface p-6 text-center text-muted">
          Ultimate Guitar has no other guitar versions of this song.
        </div>
      ) : list ? (
        <ul className="divide-y divide-border-line rounded-lg border border-border-line bg-surface">
          {list.others.map((v) => (
            <VersionRow key={v.id} v={v} fromSlug={tab.slug} haveSlug={inLibrary.get(v.id) ?? null} />
          ))}
        </ul>
      ) : null}
    </main>
  );
}

function VersionRow({
  v,
  fromSlug,
  haveSlug,
}: {
  v: UgVersion;
  fromSlug: string;
  haveSlug: string | null;
}) {
  return (
    <li className="flex items-center gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span
            className={`font-semibold ${v.type === "Chords" ? "text-accent" : "text-accent-2"}`}
          >
            {v.type} ver {v.version}
          </span>
          <span className="text-sm text-muted" title={`${v.rating.toFixed(2)} / 5`}>
            {stars(v.rating)} {v.votes.toLocaleString()} votes
          </span>
          {v.difficulty ? (
            <span className="text-sm capitalize text-muted">{v.difficulty}</span>
          ) : null}
          <a
            href={v.url}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-muted underline decoration-border-line underline-offset-2 hover:text-foreground"
          >
            view on UG
          </a>
        </div>
        {v.description ? (
          <p className="mt-1 line-clamp-2 text-sm text-muted">{v.description}</p>
        ) : null}
      </div>
      {haveSlug ? (
        <Link
          href={`/tab/${haveSlug}`}
          className="shrink-0 rounded-md border border-border-line px-4 py-2 text-sm font-semibold text-muted hover:bg-surface-2"
        >
          In library
        </Link>
      ) : (
        <form action={importVersionAction} className="shrink-0">
          <input type="hidden" name="fromSlug" value={fromSlug} />
          <input type="hidden" name="url" value={v.url} />
          <input type="hidden" name="version" value={v.version} />
          <button
            type="submit"
            className="rounded-md bg-accent-2 px-4 py-2 text-sm font-semibold text-background hover:opacity-90"
          >
            Add
          </button>
        </form>
      )}
    </li>
  );
}
