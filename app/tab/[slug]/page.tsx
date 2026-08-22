import Link from "next/link";
import { notFound } from "next/navigation";
import { getTab } from "@/lib/library";
import TabContent from "@/components/TabContent";
import TabPlayer from "@/components/TabPlayer";

export const dynamic = "force-dynamic";

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default async function TabPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tab = getTab(slug);
  if (!tab) notFound();

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-40 pt-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-muted hover:text-foreground">
            ← Library
          </Link>
          <h1 className="mt-1 text-2xl font-bold">{tab.title}</h1>
          <div className="text-muted">{tab.artist}</div>
        </div>
        <Link
          href={`/tab/${tab.slug}/edit`}
          className="rounded-md border border-border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-surface-2"
        >
          Edit
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
        <span
          className={`font-semibold ${tab.type === "Chords" ? "text-accent" : "text-accent-2"}`}
        >
          {tab.type}
        </span>
        {tab.capo ? <span>Capo {tab.capo}</span> : null}
        {tab.tuning ? <span>Tuning {tab.tuning}</span> : null}
        {tab.bpm ? <span>{tab.bpm} bpm</span> : null}
        <span>{fmtDuration(tab.durationSec)}</span>
        {tab.sourceUrl ? (
          <a
            href={tab.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-border-line underline-offset-2 hover:text-foreground"
          >
            source
          </a>
        ) : null}
      </div>

      {tab.status === "stub" || !tab.content.trim() ? (
        <div className="rounded-lg border border-border-line bg-surface p-6 text-center">
          <p className="mb-3 text-muted">
            No content imported for this song yet.
          </p>
          {tab.sourceUrl ? (
            <p className="mb-4 text-sm">
              <a
                href={tab.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline underline-offset-2"
              >
                Open the original page
              </a>{" "}
              and paste the tab in the editor.
            </p>
          ) : null}
          <Link
            href={`/tab/${tab.slug}/edit`}
            className="inline-block rounded-md bg-accent-2 px-4 py-2 text-sm font-semibold text-background"
          >
            Paste content
          </Link>
        </div>
      ) : (
        <TabPlayer
          slug={tab.slug}
          durationSec={tab.durationSec}
          initialAdjust={tab.scrollAdjust}
        >
          <TabContent content={tab.content} />
        </TabPlayer>
      )}
    </main>
  );
}
