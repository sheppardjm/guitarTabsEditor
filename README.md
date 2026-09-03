# Guitar Tabs Editor

A personal CMS for guitar chords and tabs: browse your library, play a tab with
autoscroll paced to the song, edit anything, and add new tabs by pasting an
Ultimate Guitar URL.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

Or a production build:

```bash
npm run build && npm start
```

## Library storage

Every tab is a plain markdown file in `library/` with YAML frontmatter — easy to
grep, back up, or edit in any text editor:

```
---
title: Between The Bars
artist: Elliott Smith
type: Chords          # Chords | Tab
capo: 2
tuning: E A D G B E
bpm: 92               # optional
durationSec: 141      # drives autoscroll speed
scrollAdjust: 1.0     # your saved live-nudge multiplier
sourceUrl: https://tabs.ultimate-guitar.com/...
addedAt: 2026-08-19
status: ok            # ok | stub (stub = content not imported yet)
---
<tab text — [ch]Am[/ch] chords, [tab]…[/tab] tablature, [Verse] sections>
```

## Playing a tab

- **Play / spacebar** starts a 3-2-1 countdown, then the page scrolls its full
  length over the song's `durationSec`.
- **+ / − buttons or ↑ / ↓ keys** nudge the speed live; the multiplier is saved
  per song automatically.
- **Edit** opens the editor: metadata form + raw content with live preview.

## Adding tabs

- **+ Add tab → Import from URL**: paste an Ultimate Guitar (or FolkChords)
  link and hit Fetch — the form prefills with the parsed tab.
- Or paste/write content manually.

## Bookmark import

`scripts/import-bookmarks.ts` did the initial import from the Chrome "Tabs"
bookmark folder (Profile 3, folder id 682). It is idempotent — rerun it after
adding new bookmarks and it only imports URLs not already in the library:

```bash
npm run import
```

Pages that fail to fetch/parse become `status: stub` entries that keep the
source link so you can paste the content manually.

After a parser fix, re-import entries from one site in place (keeps `addedAt`,
`bpm` and the saved scroll multiplier):

```bash
node scripts/import-bookmarks.ts --refetch folkchords.com
```

### FolkChords chord glyphs

FolkChords draws chord names as SVG outlines instead of text. `lib/folkchords.ts`
decodes them with a table of known character outlines in
`lib/folkchordsGlyphs.ts` and lays the chords out above the lyrics in the
Ultimate Guitar style. If a chord shows a `?`, the site used a character the
table does not know yet: run

```bash
node scripts/folkchords-glyphs.ts --sitemap
```

which scans every song on the site (cached under `.folkchords-cache/`) and
writes `.folkchords-cache/unknown-glyphs.html`; open it, read off each glyph,
and add the printed line to `GLYPH_TABLE` with the right character.
