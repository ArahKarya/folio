<div align="center">

# Folio — Calm, Cross-Platform Reading

**One codebase, every format — EPUB, PDF, comics and MOBI, in sync across your devices.**

[![Status](https://img.shields.io/badge/Status-Active%20Development-16C79A?style=flat-square)](https://github.com/ArahKarya/folio)
[![License](https://img.shields.io/badge/License-MIT-0F3460?style=flat-square)](LICENSE)

[![Stack](https://img.shields.io/badge/Tauri%202-React%2019%20%2B%20Rust-0F3460?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app)
[![Platforms](https://img.shields.io/badge/Linux%20%C2%B7%20macOS%20%C2%B7%20Windows%20%C2%B7%20Android-FF6F61?style=flat-square)](#running-it)

</div>

> A product of **Arah Karya Sinergi (AKS)**.

Folio is a calm, multi-format reading app for Linux, macOS, Windows and Android — one
codebase, built on [Tauri 2](https://tauri.app), React 19 and Rust.

Folio reads **EPUB**, **PDF**, **CBZ/CBR comics** and **MOBI**, keeps a visual library
with covers and collections, saves highlights and notes, and carries your reading
position between devices through a folder you already sync.

## ✨ What it does

**Library**
- **Continue reading** at the top: the book you were last in, with a progress ring and one button
- Smart shelves — Reading, Unread, Finished, Favourites — alongside your own collections
- Cover grid or list, search by title, author or series, sort by title, author, progress or series
- Series are grouped under their own headings when you sort by them
- Select several books at once for batch favourite, finish, collect or delete; right-click any book for the same actions
- Import single files, whole folders, or drag books onto the window
- Books are **copied into Folio's own folder** on import, so moving the originals later is safe
- Duplicate-proof: a book's identity is the hash of its contents, so importing the same file twice is a no-op
- Full keyboard navigation, and **⌘K** to jump to any book or run any command

**Reader**
- Eight themes and eight accent colours, applied to the app *and* the page, with no white flash on switch — or follow the system and let it pick between a light and a dark theme you choose
- Typeface, text size, line height, paragraph spacing, letter spacing, margins, justification, one or two columns
- Real page-turn animations: slide, fade or none, honouring reduced-motion
- Table of contents with chapter marks on the progress bar, chapter position, in-book search, focus mode, keyboard and tap-zone page turns
- Read aloud through the platform speech synthesiser, with speed control and a sleep timer
- Auto-scroll for PDFs and vertical comic strips
- **Highlights in every format, PDF included** — five colours, notes and bookmarks, all exportable to Markdown
- Comics read single page, two-up, or as a vertical strip; PDFs get zoom and lazy page rendering

**Between devices**
- Point Folio at any folder your devices already share — iCloud Drive, Dropbox, Syncthing
- Reading positions, highlights, notes, collections, favourites, finished marks and settings travel; book files stay put, so the synced folder stays tiny
- Conflicts resolve last-write-wins per item, and deletions are tombstoned so a removed highlight stays removed

**Notes** — every highlight, note and bookmark across the whole library on one screen: searchable, filterable by kind and colour, and one click from the page it came from.

**Reading stats** — a daily goal ring, current and longest streak, a year-long calendar heatmap, and which books took the most time.

## 🏛️ How it is put together

```
src/                    React 19 + TypeScript + Tailwind v4
├── pages/              Library, Reader, Notes, Settings, Stats
├── readers/            One component per format, behind a shared control interface
│   └── pdf/            Page canvas, selectable text layer, highlight overlay
├── components/         ui/ primitives, library/ shelf, reader/ chrome and panels
├── store/              zustand: library, settings, reader
└── lib/                ipc.ts (the single frontend↔Rust contract), theme, tts, utils

src-tauri/src/
├── db/                 SQLite schema, migrations, and one module per table
├── formats/            EPUB, comic archive and MOBI parsing; format detection
├── library.rs          Import, folder scan, cover handling, deletion
├── sync.rs             The folder-sync bundle and its merge rules
└── commands.rs         Every command the frontend can call
```

PDF highlights are stored as rectangles expressed as fractions of the page, not
as pixels, which is what lets a highlight made at 100% come back in exactly the
right place at 250% or in a resized window.

Rust owns the catalogue: metadata, covers, archives, the database, and sync.
Rendering happens in the webview, where the mature engines live — epub.js for EPUB,
pdf.js for PDF. Books are streamed to those engines over Tauri's asset protocol rather
than pushed through IPC, so opening a 400 MB PDF does not copy it into JavaScript
memory. Comic pages come back as binary IPC responses.

Everything Folio owns lives in the platform app-data directory, which is also the only
path the asset protocol is allowed to serve.

## 🚀 Running it

Requires [Node](https://nodejs.org) 20+, [pnpm](https://pnpm.io) and a
[Rust toolchain](https://rustup.rs).

```bash
pnpm install
pnpm app          # development, with hot reload
pnpm app:build    # a signed-if-configured bundle for the current platform
```

Linux also needs the usual WebKitGTK build dependencies:

```bash
sudo apt install libwebkit2gtk-4.1-dev librsvg2-dev patchelf build-essential
```

`sample-books/` holds a small EPUB, PDF and CBZ used while building the app — handy
for a first run.

For Android, see [docs/ANDROID.md](docs/ANDROID.md).

## ✅ Tests

```bash
cd src-tauri && cargo test      # unit + end-to-end library, reading and sync tests
pnpm build                      # type-checks the frontend and builds it
```

The integration tests in `src-tauri/tests/library.rs` build real EPUB and CBZ files,
import them, annotate them and sync two independent libraries through a folder — the
same path the app takes, without the window. `src-tauri/tests/validation.rs` covers
path/size hardening on import and sync-bundle handling (traversal, oversized files,
symlink-to-device, dir/file confusion).

## 🧱 Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Tailwind v4, zustand |
| Shell | Tauri 2 (Rust) |
| Rendering | epub.js (EPUB), pdf.js (PDF), native comic-page decode |
| Storage | SQLite (catalogue), folder-based sync bundle (cross-device state) |
| Platforms | Linux, macOS, Windows, Android |

## ⚠️ Known limits

- **AZW3** files using the newer KF8 container may fail to open; converting them to
  EPUB with Calibre works. Classic MOBI is supported.
- **CBR (RAR) comics** need the `cbr` Cargo feature, which is on by default for desktop
  and off for Android — the RAR decoder is C++ and is a cross-compile hazard against
  the NDK. CBZ works everywhere.
- **DRM-protected books** are not supported and will not be.
- **Comics cannot be annotated** — there is no text to select in a page image.

## 📜 Licence

MIT — see [LICENSE](LICENSE).

---

<div align="center">
<sub>© 2026 Arah Karya Sinergi (AKS)</sub>
</div>
