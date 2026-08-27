"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  DEFAULT_DURATION_SEC,
  deleteTab,
  getTab,
  makeSlug,
  writeTab,
  type TabMeta,
  type TabType,
} from "@/lib/library";
import { fetchTabFromUrl, type ParsedTab } from "@/lib/ugParser";

function num(v: FormDataEntryValue | null): number | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function saveTabAction(formData: FormData): Promise<void> {
  const originalSlug = str(formData.get("originalSlug"));
  const title = str(formData.get("title")) || "Untitled";
  const artist = str(formData.get("artist")) || "Unknown";
  const type: TabType = formData.get("type") === "Tab" ? "Tab" : "Chords";
  const content = (formData.get("content") as string | null) ?? "";

  const existing = originalSlug ? getTab(originalSlug) : null;
  const slug = existing ? existing.slug : makeSlug(artist, title, type);

  const meta: TabMeta = {
    title,
    artist,
    type,
    capo: num(formData.get("capo")),
    tuning: str(formData.get("tuning")) || null,
    bpm: num(formData.get("bpm")),
    durationSec: num(formData.get("durationSec")) ?? DEFAULT_DURATION_SEC,
    scrollAdjust: existing?.scrollAdjust ?? 1.0,
    sourceUrl: str(formData.get("sourceUrl")) || existing?.sourceUrl || null,
    addedAt: existing?.addedAt ?? new Date().toISOString().slice(0, 10),
    status: content.trim() ? "ok" : "stub",
  };

  writeTab(slug, meta, content);
  revalidatePath("/");
  revalidatePath(`/tab/${slug}`);
  redirect(`/tab/${slug}`);
}

export async function deleteTabAction(formData: FormData): Promise<void> {
  const slug = str(formData.get("slug"));
  if (slug) deleteTab(slug);
  revalidatePath("/");
  redirect("/");
}

export type FetchFromUrlResult =
  | { ok: true; tab: ParsedTab }
  | { ok: false; error: string };

export async function fetchFromUrlAction(
  url: string
): Promise<FetchFromUrlResult> {
  try {
    const parsed = await fetchTabFromUrl(url);
    if (!parsed) return { ok: false, error: "Could not find tab content on that page." };
    return { ok: true, tab: parsed };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fetch failed." };
  }
}
