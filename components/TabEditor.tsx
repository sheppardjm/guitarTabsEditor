"use client";

import { useState, useTransition } from "react";
import {
  deleteTabAction,
  fetchFromUrlAction,
  saveTabAction,
} from "@/app/actions";
import TabContent from "@/components/TabContent";
import type { TabEntry } from "@/lib/library";

const inputCls =
  "w-full rounded-md border border-border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent";

export default function TabEditor({ tab }: { tab: TabEntry | null }) {
  const isNew = tab === null;
  const [title, setTitle] = useState(tab?.title ?? "");
  const [artist, setArtist] = useState(tab?.artist ?? "");
  const [type, setType] = useState<"Chords" | "Tab">(tab?.type ?? "Chords");
  const [capo, setCapo] = useState(tab?.capo?.toString() ?? "");
  const [tuning, setTuning] = useState(tab?.tuning ?? "");
  const [bpm, setBpm] = useState(tab?.bpm?.toString() ?? "");
  const [durationSec, setDurationSec] = useState(
    tab?.durationSec?.toString() ?? "210"
  );
  const [sourceUrl, setSourceUrl] = useState(tab?.sourceUrl ?? "");
  const [content, setContent] = useState(tab?.content ?? "");
  const [preview, setPreview] = useState(false);

  const [importUrl, setImportUrl] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, startImport] = useTransition();

  const doImport = () => {
    const url = importUrl.trim();
    if (!url) return;
    setImportError(null);
    startImport(async () => {
      const res = await fetchFromUrlAction(url);
      if (!res.ok) {
        setImportError(res.error);
        return;
      }
      const t = res.tab;
      setTitle(t.title);
      setArtist(t.artist);
      setType(t.type);
      setCapo(t.capo?.toString() ?? "");
      setTuning(t.tuning ?? "");
      if (t.durationSec) setDurationSec(String(t.durationSec));
      setContent(t.content);
      setSourceUrl(url);
    });
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">
        {isNew ? "Add tab" : `Edit: ${tab.title}`}
      </h1>

      {isNew ? (
        <div className="mb-8 rounded-lg border border-border-line bg-surface p-4">
          <div className="mb-2 text-sm font-semibold">
            Import from URL{" "}
            <span className="font-normal text-muted">
              (Ultimate Guitar / FolkChords)
            </span>
          </div>
          <div className="flex gap-2">
            <input
              type="url"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  doImport();
                }
              }}
              placeholder="https://tabs.ultimate-guitar.com/tab/…"
              className={inputCls}
            />
            <button
              type="button"
              onClick={doImport}
              disabled={importing}
              className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-background disabled:opacity-50"
            >
              {importing ? "Fetching…" : "Fetch"}
            </button>
          </div>
          {importError ? (
            <div className="mt-2 text-sm text-red-400">{importError}</div>
          ) : null}
        </div>
      ) : null}

      <form action={saveTabAction}>
        {!isNew ? (
          <input type="hidden" name="originalSlug" value={tab.slug} />
        ) : null}
        <input type="hidden" name="sourceUrl" value={sourceUrl} />

        <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <label className="col-span-2 block">
            <span className="mb-1 block text-xs text-muted">Title</span>
            <input
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className={inputCls}
            />
          </label>
          <label className="col-span-2 block">
            <span className="mb-1 block text-xs text-muted">Artist</span>
            <input
              name="artist"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              required
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Type</span>
            <select
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value as "Chords" | "Tab")}
              className={inputCls}
            >
              <option>Chords</option>
              <option>Tab</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Capo</span>
            <input
              name="capo"
              type="number"
              min={0}
              max={12}
              value={capo}
              onChange={(e) => setCapo(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">BPM</span>
            <input
              name="bpm"
              type="number"
              min={20}
              max={300}
              value={bpm}
              onChange={(e) => setBpm(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">
              Duration (sec)
            </span>
            <input
              name="durationSec"
              type="number"
              min={30}
              max={1800}
              value={durationSec}
              onChange={(e) => setDurationSec(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="col-span-2 block">
            <span className="mb-1 block text-xs text-muted">Tuning</span>
            <input
              name="tuning"
              value={tuning}
              onChange={(e) => setTuning(e.target.value)}
              placeholder="E A D G B E"
              className={inputCls}
            />
          </label>
        </div>

        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs text-muted">
            Content — use [ch]Am[/ch] for chords, [tab]…[/tab] for tablature,
            [Verse] for sections
          </span>
          <button
            type="button"
            onClick={() => setPreview((p) => !p)}
            className="rounded-md border border-border-line px-3 py-1 text-xs hover:bg-surface-2"
          >
            {preview ? "Edit" : "Preview"}
          </button>
        </div>

        {preview ? (
          <div className="mb-4 min-h-[24rem] rounded-md border border-border-line bg-surface p-4">
            <TabContent content={content} />
          </div>
        ) : (
          <textarea
            name="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            className="mb-4 h-[32rem] w-full rounded-md border border-border-line bg-surface p-4 font-mono text-sm leading-6 outline-none focus:border-accent"
          />
        )}
        {preview ? (
          <input type="hidden" name="content" value={content} />
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded-md bg-accent-2 px-6 py-2 text-sm font-bold text-background hover:opacity-90"
          >
            Save
          </button>
          <a
            href={isNew ? "/" : `/tab/${tab.slug}`}
            className="rounded-md border border-border-line px-4 py-2 text-sm text-muted hover:text-foreground"
          >
            Cancel
          </a>
        </div>
      </form>

      {!isNew ? (
        <form
          action={deleteTabAction}
          onSubmit={(e) => {
            if (!confirm(`Delete “${tab.title}”? This removes the file.`))
              e.preventDefault();
          }}
          className="mt-10 border-t border-border-line pt-6"
        >
          <input type="hidden" name="slug" value={tab.slug} />
          <button
            type="submit"
            className="rounded-md border border-red-400/40 px-4 py-2 text-sm font-semibold text-red-400 hover:bg-red-400/10"
          >
            Delete tab
          </button>
        </form>
      ) : null}
    </main>
  );
}
