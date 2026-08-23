# Folio

A calm, multi-format reading app for Linux, macOS, Windows and Android — one
codebase, built on [Tauri 2](https://tauri.app), React 19 and Rust.

Folio reads **EPUB**, **PDF**, **CBZ/CBR comics** and **MOBI**, keeps a visual
library with covers and collections, saves highlights and notes, and carries your
reading position between devices through a folder you already sync.

## What it does

**Library**
- Cover grid or list, search by title, author or series, sort by what you were last reading
- Import single files, whole folders, or drag books onto the window
- Books are **copied into Folio's own folder** on import, so moving the originals later is safe
- Duplicate-proof: a book's identity is the hash of its contents, so importing the same file twice is a no-op
- Collections, editable metadata, generated covers for books that ship without artwork

**Reader**
- Five themes — Day, Sepia, Gray, Night, Black — applied to the app *and* the page, with no white flash on switch
- Typeface, text size, line height, paragraph spacing, letter spacing, margins, justification, one or two columns
- Table of contents, in-book search, focus mode, keyboard and tap-zone page turns
- Read aloud through the platform speech synthesiser, with speed control
- Highlights in five colours, notes, bookmarks, and one-click export of every note to Markdown
- Comics read single page, two-up, or as a vertical strip; PDFs get zoom and lazy page rendering

**Between devices**
- Point Folio at any folder your devices already share — iCloud Drive, Dropbox, Syncthing
- Reading positions, highlights, notes, collections and settings travel; book files stay put, so the synced folder stays tiny
- Conflicts resolve last-write-wins per item, and deletions are tombstoned so a removed highlight stays removed

**Reading stats** — streak, time read per day, books in progress and finished.

## Running it

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

`sample-books/` holds a small EPUB, PDF and CBZ used while building the app —
handy for a first run.

For Android, see [docs/ANDROID.md](docs/ANDROID.md).

## Tests

```bash
cd src-tauri && cargo test      # unit + end-to-end library, reading and sync tests
pnpm build                      # type-checks the frontend and builds it
```

The integration tests in `src-tauri/tests/library.rs` build real EPUB and CBZ
files, import them, annotate them and sync two independent libraries through a
folder — the same path the app takes, without the window.

## How it is put together

```
src/                    React 19 + TypeScript + Tailwind v4
├── pages/              Library, Reader, Settings, Stats
├── readers/            One component per format, behind a shared control interface
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

Rust owns the catalogue: metadata, covers, archives, the database, and sync.
Rendering happens in the webview, where the mature engines live — epub.js for
EPUB, pdf.js for PDF. Books are streamed to those engines over Tauri's asset
protocol rather than pushed through IPC, so opening a 400 MB PDF does not copy
it into JavaScript memory. Comic pages come back as binary IPC responses.

Everything Folio owns lives in the platform app-data directory, which is also
the only path the asset protocol is allowed to serve.

## Known limits

- **PDF highlighting** is not implemented. PDFs support bookmarks and page notes.
- **AZW3** files using the newer KF8 container may fail to open; converting them
  to EPUB with Calibre works. Classic MOBI is supported.
- **CBR (RAR) comics** need the `cbr` Cargo feature, which is on by default for
  desktop and off for Android — the RAR decoder is C++ and is a cross-compile
  hazard against the NDK. CBZ works everywhere.
- **DRM-protected books** are not supported and will not be.

## Licence

MIT.
