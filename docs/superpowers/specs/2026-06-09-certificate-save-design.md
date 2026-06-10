# Certificate Save/Restore — Design

**Date:** 2026-06-09
**Status:** Approved (autonomous session — decisions made with sensible defaults)

## Problem

Typing Adventure keeps progress (per-theme level, word position, scores) in
`sessionStorage`, which is lost when the tab closes. Kids — often on shared
school computers — need a way to carry progress between sessions and machines.

## Goal

Let a player download their progress as a **certificate** and upload it later
to pick up exactly where they left off.

## Approach

A single PNG file that is both a keepsake and a save file:

- The game renders a decorative **certificate image** on an offscreen canvas
  (player name, date, per-theme level + score, total score).
- The full save state is embedded in the PNG as a `tEXt` metadata chunk
  (keyword `typingAdventureSave`, value = base64-encoded UTF-8 JSON).
- Uploading the PNG parses the chunk, validates the payload, and restores
  state in place — no server, no dependencies, works offline.

Alternatives considered:

- **Plain JSON download** — simpler and equally robust, but it is a
  "certificate" in name only; rejected for being joyless.
- **JSON + separate decorative modal** — two artifacts to manage; rejected.

Known limitation: screenshots or re-encoded copies of the certificate lose the
metadata. Downloading and re-uploading the same file preserves it. The upload
error message explains this in kid-friendly terms.

## Save payload (v1)

```json
{
  "kind": "typingAdventureSave",
  "v": 1,
  "name": "Super Typist",
  "savedAt": "2026-06-09",
  "score": 0,
  "score_cloud": 0, "score_soup": 0, "score_unicorn": 0,
  "progress_cloud":   {"level": 0, "wordIdx": 0, "wordList": null},
  "progress_soup":    {"level": 0, "wordIdx": 0, "wordList": null},
  "progress_unicorn": {"level": 0, "wordIdx": 0, "wordList": null}
}
```

Mirrors the existing `saveState()` shape plus `kind`, `v`, `name`, `savedAt`.

## Components (all inside index.html)

1. **PNG chunk core (DOM-free, marked `CERT-CORE-START/END` for testing)**
   - `crc32(bytes)` — table-based CRC-32 (PNG chunk checksums).
   - `pngInsertText(bytes, keyword, text)` — returns new `Uint8Array` with a
     `tEXt` chunk inserted before `IEND`.
   - `pngExtractText(bytes, keyword)` — scans chunks, returns the text for
     `keyword` or `null` (also `null` for non-PNG bytes).
   - `b64EncodeUtf8(str)` / `b64DecodeUtf8(b64)` — ASCII-safe payload
     (PNG `tEXt` is Latin-1 only).

2. **Certificate renderer** — `drawCertificate(c, W, H, data)` draws the
   certificate art using the game's start-screen palette.

3. **Save flow** — `downloadCertificate()`: `prompt()` for the player's name
   (default "Super Typist"), render canvas → PNG blob → insert chunk →
   trigger `<a download>` of `typing-adventure-certificate.png`.

4. **Load flow** — hidden `<input type="file" accept="image/png,.png">` +
   `loadCertificate(file)`: read bytes → extract chunk → decode → validate
   (`kind`, clamp `level` to `0..LEVELS.length-1`, coerce numbers, check
   `wordList` is null or string array) → assign globals → `saveState()` +
   `updateScoreUI()` → success message. Any failure shows a friendly error;
   state is untouched on failure.

5. **Start-screen UI** — a row with "📜 Save Certificate" and
   "📤 Load Certificate" buttons below the theme buttons, plus a transient
   status message line.

## Error handling

- Upload of a PNG without the chunk, a non-PNG file, or a corrupt payload →
  "Hmm, that doesn't look like a Typing Adventure certificate" message; no
  state change.
- `prompt()` cancelled → save proceeds with default name (cancel ≠ abort,
  keeps the flow one-tap for kids). Name trimmed, capped at 24 chars.
- File input value reset after each upload so the same file can be re-chosen.

## Testing

- Node test harness (`tests/cert-core.test.mjs`) extracts the marked
  CERT-CORE block from index.html and verifies: chunk insert/extract
  roundtrip on a real 1×1 PNG, signature + IEND preserved, `null` for
  missing chunk and non-PNG input, UTF-8 names survive the base64 leg.
- `node --check` on the full extracted script block (syntax regression).
- Manual: save → reload page → upload → progress card matches.

## Out of scope (YAGNI)

- JSON fallback uploads, multiple save slots, server sync, signature/
  anti-tamper, auto-load on page open.
