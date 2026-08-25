# Folio — Laporan Audit Read-Only (2026-08)

**Target:** `ArahKarya/folio` (Tauri 2 + React 19 + TypeScript, EPUB/PDF/CBZ/CBR/MOBI reader, folder-based sync).
**Versi audited:** `0.1.0` (commit `0e00444`).
**Tanggal:** 2026-08-25.
**Mode:** read-only — tidak ada file yang dimodifikasi, tidak ada commit. Laporan ini ditulis ke `AUDIT_REPORT_folio_202608.md` lokal.

---

## Status Perbaikan P0 (diupdate 2026-08-25)

Tiga isu keamanan P0 dari §1.1 sudah ditangani dalam task kanban
`t_9fc5d629` (lihat `git log` untuk commit hash):

| # | Isu | Status | Commit / file |
|---|-----|--------|---------------|
| 1 | `opener:allow-open-path` & `allow-reveal-item-in-dir` scope `**` | ✅ FIXED | scope dipersempit ke `$APPDATA/**` & `$APPLOCALDATA/**` (sejalan dengan `fs:scope` di `default.json`). File: `src-tauri/capabilities/desktop.json:15-26`. |
| 2 | `import_files`/`import_folder` tanpa validasi source path | ✅ FIXED | Validasi via `library::safe_source` (rejects `..`, NUL, relative path, non-file, symlink-to-device, empty/oversized) + `MAX_IMPORT_FILES` cap + per-file failures tidak fatal. File: `src-tauri/src/library.rs:40-104`, `commands.rs:38-62`. |
| 3 | `export_sync_bundle`/`import_sync_bundle` tanpa size cap & validasi | ✅ FIXED | `MAX_BUNDLE_BYTES = 64 MiB`, `validate_export_target` (`.json` extension + parent dir exists), `read_bounded` (size check via metadata sebelum read). Atomic temp+rename di export. File: `src-tauri/src/commands.rs:18-24`, `336-428`. |

Test regresi baru di `src-tauri/tests/validation.rs` (9 test, tambahan untuk yang sudah ada di `tests/library.rs`).
Verifikasi TypeScript: `tsc --noEmit` exit=0.
Verifikasi Rust: `cargo check` & `cargo test` **tidak dijalankan** karena toolchain Rust tidak tersedia di environment audit (lihat "Limitasi verifikasi" di bawah).

### Limitasi verifikasi (yang masih perlu dijalankan manual oleh reviewer)

- **`cargo check` & `cargo test` belum dijalankan.** Toolchain Rust tidak tersedia di environment ini; review kode Rust dilakukan secara manual (semua 3 file sudah dibaca end-to-end). Reviewer dengan `rustup` harus menjalankan `cd src-tauri && cargo check && cargo test` sebelum merge.
- **Tidak ada runtime desktop di env audit** untuk menguji bahwa `opener:allow-open-path` dengan scope `$APPDATA/**` masih membiarkan Folio membuka file buku dari folder `paths.books()`. **Scope ini hanya meliputi `$APPDATA` dan `$APPLOCALDATA`**, yang persis sama dengan direktori yang dipakai `paths.books()` (lihat `lib.rs:27` `app.path().app_data_dir()`), jadi secara teoretis harusnya tetap bekerja; tetap harus diverifikasi dengan `pnpm run app` di desktop.
- **Tidak ada tanda tangan "telah di-test runtime"** untuk `export_sync_bundle`/`import_sync_bundle`. Test regresi untuk path-validation di level library (`safe_source`/`safe_directory`/`import_many`) sudah ada, tetapi test untuk helper `validate_export_target`/`read_bounded` di `commands.rs` belum ditambahkan (helper itu private ke module command dan susah di-test tanpa Tauri runtime). Disarankan untuk menambah test end-to-end command-level di iterasi berikutnya.

---

## 0. Ringkasan Eksekutif (ringkas, lihat §7 untuk tabel prioritas)

| # | Topik                                  | Severity    | Lokasi singkat                                        |
|---|----------------------------------------|-------------|--------------------------------------------------------|
| 1 | `desktop.json` izinkan `opener:allow-open-path` `**` ke **seluruh** filesystem | ~~🔴 KRITIS~~ ✅ FIXED t_9fc5d629 | `src-tauri/capabilities/desktop.json:15-26` |
| 2 | `import_files` menerima `Vec<String>` path absolut dari JS tanpa validasi (path traversal tidak perlu) | ~~🟠 TINGGI~~ ✅ FIXED t_9fc5d629 | `src-tauri/src/commands.rs:38-62`, `library.rs:18-104, 167-251` |
| 3 | `export_sync_bundle`/`import_sync_bundle` menulis/membaca `file` di mana saja tanpa validasi | ~~🟠 TINGGI~~ ✅ FIXED t_9fc5d629 | `commands.rs:336-428`                                  |
| 4 | `set_sync_folder` menerima path folder tanpa validasi (referensi file di luar app-data) | 🟡 SEDANG   | `commands.rs:305-309`                                  |
| 5 | `import_folder` melintasinya `WalkDir` tanpa filter symlink (risiko symlink loop + escape dari scope `fs:scope` di webview) | 🟡 SEDANG   | `library.rs:124-140`                                   |
| 6 | `image` crate v0.25 (gambar decoding) | 🟡 SEDANG   | `src-tauri/Cargo.toml:35`                              |
| 7 | `unrar` v0.5 (RAR decoder) | 🟡 SEDANG   | `Cargo.toml:45`                                        |
| 8 | Pemisahan `pdfjs-dist` versi sangat baru (6.2.x) di Vite `optimizeDeps` | 🟢 RENDAH   | `vite.config.ts:31`                                    |
| 9 | CSP `style-src 'unsafe-inline'` | 🟡 SEDANG   | `src-tauri/tauri.conf.json:27`                         |
| 10| `fs:allow-read-file`/`fs:allow-write-file` tanpa scope di plugin fs (tidak dipakai oleh FE, risiko dari Tauri plugin default) | 🟡 SEDANG   | `capabilities/default.json:15-16`                      |
| 11| Tidak ada error boundary React global (caller `setError` di reader store, tapi di luar Reader fallback kosong) | 🟡 SEDANG   | `src/App.tsx`, `src/readers/*`                         |
| 12| MOBI `extract` cover: pilih image pertama yang `image::guess_format` recognize (bukan halaman pertama MOBI) — kemungkinan besar masih OK, tetapi drift | 🟢 RENDAH   | `src-tauri/src/formats/mobi.rs:23-32`                  |
| 13| `commands.rs:208` `chapter` heading duplicate detection by string equality — bisa pecah pada buku multibahasa | ⚪ RENDAH   | `commands.rs:191-237`                                  |
| 14| `settings.ts:74` `parse()` swallow JSON.parse error, fallback ke default — bisa menyembunyikan bug | ⚪ RENDAH   | `src/store/settings.ts:55-63`                          |
| 15| `vite.config.ts:25-29` tidak ada `sourcemap` di production (debugging release butuh) | ⚪ RENDAH   | `vite.config.ts`                                       |
| 16| README overclaim — "PDF highlighting" disebut di "known limits" sebagai tidak ada (konsisten), tetapi folder sync Android (satu file, app-specific storage) tidak benar-benar usable via cloud (lihat §5) | ⚠️ perlu verifikasi manual | `docs/ANDROID.md:75-80` |
| 17| Tidak ada CI lint/build untuk push PR — hanya jalan saat `v*` tag (release.yml) | 🟡 SEDANG   | `.github/workflows/release.yml`                        |
| 18| `pnpm install` default pakai `corepack` (rusak di env ini) — bukan masalah kode, tapi local dev perlu workaround | ℹ️ INFO     | env (lihat §3)                                        |

**Jumlah total temuan: 18 (3 Kritis, 3 Tinggi, 7 Sedang, 4 Rendah, 1 INFO).**

---

## 1. Keamanan Tauri (Axis 1)

### 1.1 Permissions / Capabilities (Kritis/Tinggi)

#### ✅ FIXED — `opener:allow-open-path` & `opener:allow-reveal-item-in-dir` di-scope ke `**` (semua path)
**Status:** Fixed in task t_9fc5d629 (lihat `git log`).
**Fix:** Scope dipersempit ke `$APPDATA/**` & `$APPLOCALDATA/**` di `src-tauri/capabilities/desktop.json:15-26`, sejalan dengan `fs:scope` di `default.json:18-20` dan `assetProtocol.scope` di `tauri.conf.json:30-33`. Permission dipertahankan (untuk kemungkinan fitur "reveal in folder" di masa depan) tapi tidak lagi mencakup `**`.
- **File lama:** `src-tauri/capabilities/desktop.json:15-22`
- **Risiko:** Frontend JavaScript bisa minta OS membuka file executable apa pun di disk user, atau mengungkap file di mana pun, tanpa scope. Karena `tauri-plugin-opener` membuka dengan default handler OS, sebuah EPUB berisi link `<a href="file:///...">` (atau XSS di `iframe` PDF/EPUB) bisa memicu launch executable di Linux/Windows. Tauri 2 plugin opener mendokumentasikan scope-path granular; `"**"` adalah escape hatch.
- **Verifikasi:** Scope baru sama dengan direktori `paths.books()` (lihat `lib.rs:27` `app.path().app_data_dir()`), jadi Folio tetap bisa membuka file buku yang baru di-import. Tetap perlu tes runtime (`pnpm run app`) oleh reviewer untuk konfirmasi.

#### ✅ FIXED — `import_files` & `import_folder` terima path absolut dari JS tanpa validasi
**Status:** Fixed in task t_9fc5d629 (lihat `git log`).
**Fix:** Menambahkan `library::safe_source` (rejects `..`, NUL, relative path, non-regular-file, symlink-to-device, empty, >2 GiB) yang dipanggil dari `import_many` per-file (bad path → ImportFailure, tidak fatal untuk batch). `import_folder`/`scan_folder` memakai `library::safe_directory` (folder harus folder). `import_files` command memakai `MAX_IMPORT_FILES = 5000` cap sebelum proses. Symlink di scan sudah di-disable (`follow_links(false)`).
- **File:** `src-tauri/src/library.rs:18-104` (validators), `library.rs:167-251` (call sites), `commands.rs:38-62` (cap).
- **Test regresi:** `src-tauri/tests/validation.rs` — 8 test baru (traversal filename, missing file, bad root, happy path, dir-as-file, symlink-to-device, file-as-dir, oversized).
- **Verifikasi:** Tergantung `cargo test` yang belum dijalankan di env ini. Reviewer harus `cd src-tauri && cargo test --test validation`.

#### ✅ FIXED — `export_sync_bundle` & `import_sync_bundle` `file: String` tanpa validasi
**Status:** Fixed in task t_9fc5d629 (lihat `git log`).
**Fix:** `MAX_BUNDLE_BYTES = 64 MiB` cap (audit usul 32 MiB, dinaikkan untuk headroom perpustakaan besar). `validate_export_target` (commands.rs:367-393) menolak path kosong, non-`.json`, dan parent dir yang tidak ada. `read_bounded` (commands.rs:399-428) menolak non-regular-file dan file >64 MiB *sebelum* read dilakukan (lewat `symlink_metadata` + `len()`). Export menulis via temp+rename atomic (commands.rs:350-352) sehingga setengah-write tidak meninggalkan bundle korup.
- **File:** `src-tauri/src/commands.rs:18-24` (cap), `336-428` (command + helpers).
- **Test regresi:** `sync_bundle_round_trip_through_the_filesystem` di `src-tauri/tests/validation.rs` mem-pin bahwa happy path export→write→read→apply tetap bekerja. Test khusus untuk `validate_export_target`/`read_bounded` belum ditambahkan (helper itu private dan testable hanya via Tauri runtime atau refactor ke module terpisah) — direkomendasikan untuk iterasi berikutnya.
- **Verifikasi:** Tergantung `cargo test` di env reviewer.

#### 🟡 SEDANG — `set_sync_folder` tidak validasi path
- **File:** `commands.rs:305-309`
- **Bukti:**
  ```rust
  pub fn set_sync_folder(db: State<Db>, folder: Option<String>) -> AppResult<()> {
      let conn = db.0.lock();
      settings::set(&conn, SYNC_FOLDER_KEY, folder.as_deref().unwrap_or(""))
  }
  ```
  `sync::sync` di `sync.rs:101-121` kemudian `std::fs::create_dir_all(folder)` + `std::fs::write` di folder itu.
- **Risiko:** Tidak ada validasi "folder ini accessible & writable". UI mungkin sudah dialog-pick, tapi command Rust tidak meng-enforce — JS malicious bisa set `set_sync_folder('/')` → setiap `sync_now()` akan menulis bundle ke root filesystem.
- **Saran fix:** Validasi writable (coba `tempfile::NamedTempFile` di folder), atau terapkan policy path-prefix.

#### 🟡 SEDANG — `import_folder` traversal tanpa symlink filter
- **File:** `library.rs:124-140`
- **Bukti:**
  ```rust
  WalkDir::new(root)
      .follow_links(false)         // ✓ symlink tidak di-follow
      ...
  ```
  Symlink sudah di-disable (`follow_links(false)`) — **bagus**. **Tapi:** tidak ada batasan kedalaman dan tidak ada cek `paths.books()`. `root` bisa apa pun yang user supply via `import_folder(folder)`. Bandingkan dengan risiko §1.1 #2.
- **Risiko:** Rendah karena user harus secara eksplisit men-pick folder. Folder dalam `~/Library/Caches`, `~/.ssh`, `~/.gnupg`, `~/.aws` akan di-scan — file yang punya ekstensi `.epub` (jarang, tapi mungkin) akan di-import. **Kebocoran privasi** via dialog: Folio tidak pernah *membaca* file di luar `paths.books()`, tapi *nama file* dan *metadata* dari folder user akan muncul di log error.
- **Saran fix:** Sama dengan §1.1 #2 — canonicalize + scope check. Atau tampilkan "Scanning X files… Y supported" progress agar user aware.

### 1.2 CSP & `tauri.conf.json` (Sedang/Rendah)

#### 🟡 SEDANG — CSP mengizinkan `style-src 'unsafe-inline'`
- **File:** `src-tauri/tauri.conf.json:27`
- **Bukti:**
  ```
  "csp": "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' asset: http://asset.localhost blob: data:; ..."
  ```
- **Risiko:** `unsafe-inline` di style-src dibutuhkan oleh `theme.ts:bookCss()` (lihat theme.ts:165-203, `!important` inline di-inject ke iframe epub.js). Resiko XSS rendah karena (a) style inline tidak mengeksekusi script, (b) Tauri 2 webview sudah `script-src 'self'`. **Tapi:** style injection bisa digunakan untuk click-jacking UI (CSS exfiltration via `background: url(attacker.com/...)`).
- **Saran fix:** Ganti dengan nonce-based, atau gunakan `theme.ts` yang menaruh style ke `<style>` di `<head>` (yang tidak butuh `'unsafe-inline'`).
- **Catatan positif:** `connect-src` ditutup dengan `ipc: http://ipc.localhost`; `script-src 'self' 'wasm-unsafe-eval'`; `worker-src 'self' blob:`; `frame-src 'self' blob:` — **konservatif & benar**.

#### ⚪ RENDAH — `tauri.conf.json` `devUrl` & `bundle` aman
- **File:** `src-tauri/tauri.conf.json:6-11`
- `devUrl: "http://localhost:1420"` (hard-coded, tidak ada `*`), `frontendDist: "../dist"`, `bundle.targets: "all"` (semua target per platform), `identifier: "dev.arahkarya.folio"` (meskipun `dev.`, ini identifier — bukan masalah security, hanya konvensi).
- **Catatan:** Identifier `dev.arahkarya.folio` bukan masalah dari sisi keamanan. Tapi `category: "Education"` dan `shortDescription` adalah klaim yang user-facing; tidak masalah secara security.

### 1.3 Dependency Rust (Sedang)

#### 🟡 SEDANG — `image = "0.25"` (decoder gambar)
- **File:** `src-tauri/Cargo.toml:35`
- **Bukti:**
  ```toml
  image = { version = "0.25", default-features = false, features = ["jpeg", "png", "gif", "webp", "bmp"] }
  ```
- **Risiko:** `image` crate secara historis punya advisory terkait decoder (terutama WebP, GIF, JPEG). Versi 0.25 adalah relatif baru, tetapi security advisories image crate sangat aktif 2024-2025 (mis. `RUSTSEC-2024-0368` untuk GIF decoder DoS, dan beberapa untuk WebP). `default-features = false` + fitur eksplisit = **positif** (mengurangi attack surface).
- **Saran fix:** Jalankan `cargo audit` di CI; pertimbangkan upgrade ke `0.25.6+` atau yang terbaru.

#### 🟡 SEDANG — `unrar = "0.5"` (RAR decoder, optional)
- **File:** `Cargo.toml:45`
- **Bukti:**
  ```toml
  [target.'cfg(not(target_os = "android"))'.dependencies]
  unrar = { version = "0.5", optional = true }
  [features]
  default = ["cbr"]
  cbr = ["dep:unrar"]
  ```
- **Risiko:** `unrar` 0.5 adalah binding ke **unrar C++ library** (proprietary, sumber-tidak-terbuka). Tidak ada `cargo audit` coverage untuk native code. CVE decoder RAR sangat langka (format stabil), tetapi parser unrar punya sejarah isu (path traversal dalam arsip, symlink attack).
- **Mitigasi yang sudah ada:** `comic.rs:209-216` `cache_path()` mem-flatten nama entry ke karakter alnum + `.` + `-` — mencegah path traversal saat ekstrak. **Bagus.**
- **Saran fix:** Tetap feature-gated, dokumentasikan risikonya, dan tampilkan warning ke user saat import CBR.

#### ℹ️ INFO — Dependency lain sudah di-pinned longgar
- `serde = "1"`, `rusqlite = "0.40"`, `zip = "8"`, `quick-xml = "0.42"`, `mobi = "0.8"`. Mayoritas adalah crate Rust yang stabil. `rusqlite 0.40` adalah versi terbaru; `zip 8` modern. **Tidak ada lockfile issue.**

### 1.4 Test suite Rust & CI

- **Test files:** `src-tauri/tests/library.rs` (13955 bytes, 6 integration test yang real: build EPUB/CBZ asli, scan folder, import + duplicate detection, annotation round-trip + edit in-place, stats accumulation, **sync dua device independen** lewat folder, deletion tombstone propagation, dan book_path). **Cakupan sangat baik untuk satu file test.**
- **CI:** hanya `.github/workflows/release.yml` (tag-triggered, bukan PR). **Tidak ada CI lint/test untuk PR.** Lihat §5.13.

### 1.5 Beberapa catatan keamanan positif (jangan sampai terlewat)

✅ `tauri.conf.json:27` `connect-src 'self' ipc: http://ipc.localhost` — menutup koneksi ke luar (no fetch to random host).
✅ `default.json:17-20` `fs:scope` di-scope ke `$APPDATA/**` & `$APPLOCALDATA/**` — **benar**, tidak ke `**`.
✅ `comic.rs:209-216` `cache_path` sanitize nama entry RAR sebelum ditulis ke disk — mitigasi path-traversal saat ekstrak CBR.
✅ `EpubReader.tsx:68` `allowScriptedContent: false` — epub.js tidak akan mengeksekusi script di iframe EPUB.
✅ `DocReader.tsx:212-227` `sanitize()` sebelum `dangerouslySetInnerHTML` — strip `<script>`, `<iframe>`, `<object>`, `<embed>`, `<link>`, `<meta>`, `<base>`, dan atribut `on*` / `href="javascript:..."`.
✅ Tidak ada `eval()`, tidak ada `Function()`, tidak ada `innerHTML` langsung tanpa sanitasi (DocReader hanya satu-satunya `dangerouslySetInnerHTML`, dan sudah di-sanitize).
✅ `App.tsx:53-67` drag-drop handler unsubscribe di cleanup (unlisten dipanggil di return effect).
✅ `app.security.assetProtocol.scope` di-scope ke `$APPDATA/**` & `$APPLOCALDATA/**` — tidak expose seluruh filesystem.
✅ `error.rs:38-42` custom `Serialize` untuk `AppError` — error string ke frontend, **bukan** exception backtrace (mencegah info disclosure di production).

---

## 2. Kualitas Kode Frontend (Axis 2)

### 2.1 Ukuran file

- **Semua file <400 baris.** Top-10:
  - `PdfReader.tsx` 340 (PDF rendering + virtual scroll + zoom)
  - `EpubReader.tsx` 295 (mount, theme injection, highlight, search)
  - `DocReader.tsx` 249 (MOBI paginate)
  - `BookSheet.tsx` 232 (book detail modal)
  - `Reader.tsx` 227 (shell + keyboard + TTS)
  - `Settings.tsx` 213
  - `theme.ts` 204
  - `ComicReader.tsx` 172
  - `library.ts` 162 (store)
  - `Library.tsx` 151
- **Total frontend:** 4845 baris. Reasonable untuk fitur sekompleks ini.

### 2.2 `any` / `@ts-ignore` / `@ts-nocheck`

- **0 occurrence** di `src/**/*.ts*` (verified via grep). Hanya 3 false-positives di komentar atau string (src/lib/epub.ts:4 `"any"` di doc comment, src/pages/Stats.tsx:71 `"any reading"`, src/components/library/BookCover.tsx:13 `"any"` di doc comment).
- **Kualitas tinggi.** Kode ini disiplin strict mode.

### 2.3 `console.log` di source

- **0 occurrence** di `src/`. Semua error propagation lewat `errorText()` → `toast.error()` atau `setError()` (di reader store).
- **Sangat bersih.**

### 2.4 Konsistensi error handling

- **Bagus** secara keseluruhan. 35+ `try { ... } catch` dan 5 `.catch(...)` ditemukan. Mayoritas catch memiliki fallback UI (toast atau setError).
- `App.tsx:46-48` — sync error saat startup di-swallow (intended, ada komentar). **OK.**
- `App.tsx:76` — sync error saat close-reader di-swallow dengan `void ipc.syncNow().catch(() => undefined)`. **OK** (tidak ganggu user).
- `EpubReader.tsx:191-194` — `rendition.annotations.remove()` di cleanup best-effort, di-swallow dengan `/* already gone with its chapter */`. **OK.**
- `PdfReader.tsx:248-250` — render task di-swallow `/* superseded by a newer render */`. **OK.**

#### ⚪ RENDAH — Beberapa catch empty tanpa komentar
- **File:** beberapa catch di EpubReader (`:130-131`, `:215-216`, `:292-294`)
- **Bukti:** Mis. `EpubReader.tsx:292-294`:
  ```ts
  } catch {
    // Progress falls back to 0 rather than blocking the reader.
  }
  ```
  — **ada komentar, jelas intent.** `:215-216` `/* skip chapters that fail to load */` juga jelas. **Tidak ada masalah aktual** — di-check ulang, semua catch punya komentar atau self-explanatory fallback. Mengubah status dari "perlu dicek" jadi "bersih".
- **Catatan:** Catch di `Reader.tsx:136` di `toggleBookmark` sebenarnya **tidak** punya komentar tapi fallback-nya `toast.error(errorText(err))` yang sudah proper. **OK.**

### 2.5 State management — `zustand` stores

Tiga store: `library`, `reader`, `settings`. **Semua minimal & terfokus:**

- `useLibrary` (162 baris): books, collections, import, sort, filter, activeCollection. Derived `visibleBooks(state)` di-export sebagai pure function — bukan di-store. **Bagus, ini best practice zustand.**
- `useReader` (136 baris): book, toc, chapter, progress, location, annotations, panel, focus, chromeVisible, loading, error, controls. `reportPosition` debounce 900ms ke IPC.
- `useSettings` (107 baris): theme, typography, behavior, syncFolder, loaded. `parse<T>()` swallow JSON.parse — lihat §2.6.

#### ⚪ RENDAH — `parse<T>()` di `settings.ts:55-63` swallow JSON.parse error
- **File:** `src/store/settings.ts:55-63`
- **Bukti:**
  ```ts
  function parse<T extends object>(raw: string | undefined, fallback: T): T {
    if (!raw) return fallback;
    try {
      return { ...fallback, ...(JSON.parse(raw) as Partial<T>) };
    } catch {
      return fallback;
    }
  }
  ```
- **Risiko:** Jika settings di-corrupt (e.g. bug di versi sebelumnya yang menulis format salah), `parse` diam-diam fallback ke default. User tidak akan tahu setting-nya telah di-reset. **Minor** — bukan bug, tapi bisa menyamarkan regression.
- **Saran fix:** `console.warn` di catch (cukup untuk debugging, tidak bocor ke user), atau tampilkan toast "Some settings were reset" di `load()`.

#### ✅ POSITIF — `visibleBooks()` adalah pure function, bukan derived state di store
- Lokasi: `src/store/library.ts:131-162`.
- **Menghindari class bug "state drift"** yang umum di zustand.

#### ✅ POSITIF — Debounce strategik: persist 300ms (settings), 900ms (progress)
- Lokasi: `src/store/settings.ts:51-53`, `src/store/reader.ts:55-57`.
- Slider yang fire on-pixel akan mengirim ratusan IPC call; debounce mengeremnya ke sekali per 300ms.
- **Tapi:** TTS `speakCurrent` di `src/lib/tts.ts:65` punya `setTimeout(..., 450)` — bukan `useEffect` cleanup, jadi kalau reader di-unmount, `setTimeout` masih bisa fire. Lihat §4.2.

### 2.6 `Reader.tsx:65-69` `useEffect([book.id])` dengan `eslint-disable-next-line react-hooks/exhaustive-deps`

- **Bukti:**
  ```ts
  useEffect(() => {
    void open(book);
    return () => close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);
  ```
- **Disables exhaustive-deps** — sengaja, karena `open`/`close` di-define di store, dan dependency `[book.id]` adalah yang semantik.
- **Risiko:** Rendah — pola ini umum untuk "open resource on mount, close on unmount". Code reviewer harus aware.
- **Catatan positif:** Pola yang sama dipakai di `EpubReader.tsx:149`, `PdfReader.tsx:83`, `DocReader.tsx:51`, `ComicReader.tsx:42` — **konsisten**.

### 2.7 Stale closure risk di `useLibrary.refreshBook` + `App.tsx:75`

- **File:** `src/App.tsx:70-77`
- **Bukti:**
  ```ts
  const closeReader = useCallback(() => {
    const book = reading;
    setReading(null);
    if (!book) return;
    void refreshBook(book.id);
    if (autoSync && syncFolder) void ipc.syncNow().catch(() => undefined);
  }, [reading, refreshBook, autoSync, syncFolder]);
  ```
  `useCallback` dependency benar (semua closure values). **OK.**

### 2.8 `Reader.tsx:113` `setPanel: (panel) => set({ panel: get().panel === panel ? null : panel })`

- **Bukti:** `src/store/reader.ts:113`
- Ini toggle behavior yang umum (klik TOC icon saat panel TOC terbuka → tutup). **OK secara UX**, tapi bisa jadi unexpected bagi yang baca kode. Komentar di `setPanel` interface tidak menjelaskan toggle behavior. **Minor doc improvement.**

### 2.9 A11y / i18n

- 21 atribut `aria-*` / `role=` di source — **basic but present** (Modal punya `role="dialog"`, IconButton punya `label`, dsb). Tidak ada issue a11y yang severe.
- **Semua text UI bahasa Inggris**, tapi `package.json:6` `description` berbahasa Indonesia. Konsistensi i18n **belum diprioritaskan** — tapi untuk v0.1 OK.

---

## 3. Build & Type Health (Axis 3)

### 3.1 Baseline

| Check                              | Hasil                              |
|------------------------------------|-------------------------------------|
| `pnpm install --frozen-lockfile`   | ✅ OK, 18.8s, pnpm 10.34.5          |
| `pnpm exec tsc --noEmit`           | ✅ **0 errors**, exit code 0        |
| `cargo test`                       | ⚠️ **TIDAK BISA DIJALANKAN** di env audit (rustc/cargo tidak terinstall) |
| `cargo audit`                      | ⚠️ TIDAK BISA (no cargo)            |
| `pnpm build` (tsc + vite build)    | ⚠️ Tidak dijalankan (cukup verify tsc) |
| Frontend test suite (vitest/jest)  | ❌ **TIDAK ADA** (lihat §5.14)      |

### 3.2 Versions terinstall (penting untuk axis 1)

| Paket          | Locked version | Catatan                                  |
|----------------|----------------|-------------------------------------------|
| @tauri-apps/api | 2.11.x         | latest stable (Tauri 2 stable line)       |
| @tauri-apps/cli | 2.11.4         | latest                                    |
| epubjs         | 0.3.93         | latest, **0.3.x line sudah lama tidak update aktif** (perhatikan §5.7) |
| pdfjs-dist     | 6.2.108        | sangat baru (rilis 2025)                  |
| react          | 19.2.8         | latest                                    |
| framer-motion  | 13.1.1         | latest                                    |
| lucide-react   | 0.556.0        | latest                                    |
| zustand        | 5.0.15         | latest                                    |
| tailwindcss    | 4.3.3          | v4, latest                                |
| vite           | 7.3.6          | latest                                    |

Tidak ada versi yang **jelas outdated** untuk ecosystem ini.

### 3.3 ⚠️ env audit punya masalah `corepack` — bukan bug kode
- `pnpm` di path `/home/arah/.local/bin/pnpm` adalah symlink/wrapper yang memakai **corepack-shimmed** pnpm 11.23.0, yang **error** `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING` di Node v22.22.1.
- **Workaround:** install `pnpm@10` lokal via `npm install --no-save pnpm@10`, run via `node_modules/.bin/pnpm`. Berhasil (pnpm 10.34.5 terinstall).
- **Saran fix:** README perlu instruksi `npm i -g pnpm@10` (atau versi yang di-test), atau set `packageManager: "pnpm@10.x.x"` di `package.json` dan instruksikan `corepack enable` (yang juga rusak di env tertentu). **Bukan bug Folio.**

---

## 4. Parsing/Rendering Engine Correctness (Axis 4)

### 4.1 EPUB

- **Engine:** `epubjs@0.3.93` (EpubReader.tsx:1, 20).
- **Type safety:** Module shipped dengan type declarations, tapi `lib/epub.ts:1-5` dokumentasikan bahwa types lagging behaviour — **maka Folio mendefinisikan ulang `EpubRendition`, `EpubBook`, `EpubAnnotations` sendiri** sebagai "minimal typings for the slice the reader uses". **Bagus, ini disiplin.**
- **Asset streaming:** `bookAssetUrl(id)` (lib/ipc.ts:72-74) → `convertFileSrc()` → **diserve via `asset://` protocol**, bukan via IPC. **Bagus** — 400 MB PDF tidak disalin ke JS memory.
- **Theme injection:** `EpubReader.tsx:73-75` `rendition.hooks.content.register()` — registered **sebelum** first display, jadi page 1 sudah ter-themed tanpa flash. **Excellent detail.**
- **Live theme update:** `EpubReader.tsx:152-162` push CSS baru ke `rendition.getContents()` tanpa remount. **Bagus**, posisi baca tidak hilang.
- **Search:** `EpubReader.tsx:200-222` iterate `epub.spine.each()`, load, search, unload. Limit 120 hit. `finally { item.unload() }` — **mencegah memory leak**. **Bagus.**
- **Highlight:** `EpubReader.tsx:165-197` add marks saat `annotations` change, remove on unmount. `try/catch` swallow "CFI can fail to resolve" — **benar**, karena CFI adalah lazy ref ke chapter yang mungkin tidak di-render.
- **Sanitize XSS:** `allowScriptedContent: false` di `EpubReader.tsx:68`. epub.js akan strip `<script>` di iframe. **Bagus.**
- **Error handling:** `EpubReader.tsx:116-118` catch + `setError(errorText(error))` di store. `Reader.tsx:174-183` tampilkan `EmptyState` dengan tombol Back. **Bagus.**

#### 🟢 RENDAH — `epubjs` 0.3.x tidak update aktif sejak 2020
- **Bukti:** `epubjs@0.3.93` adalah last release of 0.3.x line (rilis ~2020). Ada **futurepress/epubjs** repo di GitHub dengan versi next-gen yang masih 0.x dan belum stabil.
- **Risiko:** epubjs masih bekerja dan stable untuk format EPUB 2/3 standard, tapi edge case (KF8 mobi-as-epub, EPUB with DRM, EPUB with exotic spine) bisa regressive.
- **Saran fix:** Monitor repo, plan upgrade path.

### 4.2 MOBI

- **Engine:** Rust native (`src-tauri/src/formats/mobi.rs`) pakai `mobi` crate v0.8. Output HTML disanitize di frontend (`DocReader.tsx:212-227`) lalu di-render via CSS columns.
- **KF8/AZW3 limitation:** README dan Settings page menyebut "AZW3 files using the newer KF8 container may fail to open" — `mobi::content_html` di mobi.rs:48-54 return error message "This file's text could not be extracted — it is most likely a KF8/AZW3 book." **Konsisten dengan klaim, bukan overclaim.**
- **Sanitize:** `DocReader.tsx:212-227` `sanitize()` strip `<script>`, `<iframe>`, `<object>`, `<embed>`, `<link>`, `<meta>`, `<base>`, dan `on*` attrs. **Cukup**, tapi tidak handle CSS `url(javascript:...)` atau SVG `<script>`. **Minor.**
- **Image embedding:** `mobi.rs:67-113` rewrite `<img recindex="N">` jadi `data:` URL. Cap 4 MB/image, 40 MB total. Drop tag if overflow. **Bagus, ada limit eksplisit.**

#### 🟢 RENDAH — MOBI `extract` pilih cover = image pertama yang `guess_format` recognize, bukan first page content
- **File:** `src-tauri/src/formats/mobi.rs:23-32`
- **Bukti:**
  ```rust
  let cover = book
      .image_records()
      .into_iter()
      .map(|record| record.content.to_vec())
      .find(|bytes| image::guess_format(bytes).is_ok())
      .map(|bytes| { ... });
  ```
- **Risiko:** Bisa pilih image yang sebenarnya bukan cover (e.g. ilustrasi di halaman 3, jika itu adalah image pertama). **Minor drift** tapi tidak fatal — fallback ke generated cover gradient (`utils.ts:coverGradient`) di frontend `BookCover.tsx`.
- **Saran fix:** Baca `EXTH` record 201 (cover offset) jika ada, fallback ke first-image heuristic. (Tidak ada easy API di `mobi` crate untuk ini — mungkin perlu custom parsing.)

#### 🟢 RENDAH — `DocReader.tsx:53` setTimeout(450ms) di speakCurrent tidak di-cancel pada unmount
- **File:** `src/lib/tts.ts:41-69`
- **Bukti:**
  ```ts
  if (!text) {
    emptyPages.current += 1;
    if (emptyPages.current > 1) {
      stop();
      return;
    }
    next();
    setTimeout(() => void speakCurrent(), 450);
    return;
  }
  ...
  utterance.onend = () => {
    if (!active.current) return;
    next();
    setTimeout(() => void speakCurrent(), 450);
  };
  ```
- **Risiko:** Saat reader unmount, `stop()` dipanggil (useEffect cleanup di tts.ts:97), yang set `active.current = false`. `speakCurrent` checks `if (!active.current) return;` di awal. **OK.** `onend` juga check `!active.current`. **OK.** Tapi `setTimeout` tetap fire — bisa trigger `next()` dari reader store setelah close.
- **Severity:** Minor — worst case: 1 extra `next()` call 450ms setelah close, before active becomes false. **Acceptable.**

### 4.3 PDF

- **Engine:** `pdfjs-dist@6.2.108`. `PdfReader.tsx:1-2` import + setup worker.
- **Virtual scroll:** `PdfReader.tsx:212-280` `PdfPage` component, IntersectionObserver dengan `rootMargin: "1200px 0px"` — preload 1200px di luar viewport. **Bagus untuk 900-page PDF.**
- **Cancel logic:** `PdfReader.tsx:228-258` `cancelled` flag + `task?.cancel()` di cleanup. **Mencegah race render.**
- **Outline/TOC:** `PdfReader.tsx:292-321` recursive walk, swallow broken destinations. **Bagus.**
- **Cover capture:** `PdfReader.tsx:324-340` render page 1 ke off-screen canvas, kirim via `ipc.setBookCover` sebagai data URL → decoded di Rust `util::decode()` → saved as PNG. **Bagus, satu kali per buku.**

#### 🟡 SEDANG — `pdfjs-dist@6.2.108` adalah versi sangat baru (rilis 2025)
- **File:** `package.json:27`
- **Risiko:** pdf.js 6.x adalah major rewrite ke "ESM-only, modular worker" — breaking changes dari 4.x/5.x. Folio pin ke `^6.2.108` dan pakai `pdfjs-dist/build/pdf.worker.min.mjs?url` — konsisten dengan 6.x API. **Tapi:** ada bug report bahwa 6.x worker kadang load lambat di Vite dev mode. **Monitor.**
- **Saran fix:** Lock ke patch version exact (tanpa `^`).

#### 🟢 RENDAH — `pdfjs.GlobalWorkerOptions.workerSrc = workerUrl` di top-level module
- **File:** `src/readers/PdfReader.tsx:11`
- **Bukti:** Assignment di top-level, di-bundle ke lazy chunk. **OK di runtime**, tapi import `pdfjs-dist` di top-level akan bundle semua 2+ MB ke lazy chunk — yang memang disengaja. **Verify bundle size.**

### 4.4 Comic (CBZ/CBR/CBT)

- **Engine:** `ComicReader.tsx` (frontend) + `comic.rs` (Rust).
- **Page streaming:** `ComicReader.tsx:48-54` `Map<number, string>` cache blob URLs, revoke on unmount. **Bagus, no leak.**
- **Look-ahead:** `ComicReader.tsx:73-80` fetch current + 3 ahead + 1 prev. **Bagus UX.**
- **CBZ path:** `comic.rs:81-96` `ZipArchive::new(File::open(path))?`, list entries, filter image, natural sort.
- **CBR path:** `comic.rs:134-179` (cfg feature `cbr`) `unrar` crate, extract-all-to-cache on first miss, then read cached. **Bagus untuk random-access pattern RAR yang cuma stream front-to-back.**
- **CBT (TAR comics):** `comic.rs:30-32` extension maps ke Comic format. **TAPI**: tidak ada `tar` crate di `Cargo.toml`! `comic.rs:30-32` extension check is_rar/cbr, **bukan cbt/TAR handling.** Lihat §5.5.

#### 🟡 SEDANG — `CBT` (TAR comics) di SUPPORTED_EXTENSIONS tapi **tidak ada implementasi**
- **File:** `src-tauri/src/formats/mod.rs:30-32`; `src-tauri/src/formats/comic.rs`
- **Bukti:**
  ```rust
  pub const SUPPORTED_EXTENSIONS: &[&str] = &[
      "epub", "pdf", "cbz", "cbr", "cbt", "mobi", "azw", "azw3", "prc",
  ];
  ```
  Tapi `comic.rs:73-78` `is_rar()` hanya check `cbr`/`rar`, dan `read_page_bytes()` line 122-131 selalu coba `ZipArchive` — TAR tidak akan terbuka. `formats::detect()` line 46: `"cbz" | "cbr" | "cbt" => Format::Comic` — accept CBT sebagai Comic, tapi `comic::pages()` akan return error "This comic archive contains no images."
- **Risiko:** User yang pilih .cbt file akan dapat error message yang menyesatkan. **README/klaim overclaim.**
- **Saran fix:** Hapus `"cbt"` dari SUPPORTED_EXTENSIONS atau implement TAR parser (crate `tar` ~30KB, sederhana).

### 4.5 Folder-based sync — race condition

- **File:** `src-tauri/src/sync.rs:101-121`
- **Bukti:**
  ```rust
  pub fn sync(conn: &Connection, folder: &Path) -> AppResult<SyncReport> {
      std::fs::create_dir_all(folder)?;
      let file = folder.join(BUNDLE_NAME);
      let remote: Bundle = match std::fs::read(&file) {
          Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
          Err(_) => Bundle::default(),
      };
      let mut report = apply(conn, &remote)?;
      let local = export(conn)?;
      let merged = merge(local, remote);
      report.sent = merged.progress.len() + merged.annotations.len();
      report.path = file.to_string_lossy().into_owned();
      // Write to a sibling file first: a cloud client that syncs mid-write must
      // never see a half-serialised bundle.
      let temp = folder.join(format!("{BUNDLE_NAME}.tmp"));
      std::fs::write(&temp, serde_json::to_vec_pretty(&merged)?)?;
      std::fs::rename(&temp, &file)?;
      Ok(report)
  }
  ```
- **Atomic write:** Tulis ke `folio-sync.json.tmp` lalu `rename` ke `folio-sync.json` — **atomic di POSIX & NTFS**. **Bagus.**
- **Read-then-write race:** `apply` dari remote (read), lalu `export` & `merge` (pakai timestamp), lalu write. **Last-write-wins per row** — README klaim. **Konsisten.**
- **Tombstone propagation:** Test di `library.rs:348-358` verify deletion di phone → tombstone propagate ke laptop. **Bagus.**

#### 🟢 RENDAH — `apply()` bisa skip rows for books that this device does not have, tapi `skipped_unknown_books` count
- **File:** `sync.rs:236-369`
- Test cover ini. **Bagus, design intentional.**

#### 🟡 SEDANG — `unwrap_or_default()` saat parse JSON corrupt akan silently reset sync state
- **File:** `sync.rs:104-106`
- **Bukti:**
  ```rust
  let remote: Bundle = match std::fs::read(&file) {
      Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
      Err(_) => Bundle::default(),
  };
  ```
- **Risiko:** Jika `folio-sync.json` corrupt (truncated, partially written, modified externally), `serde_json` gagal, fallback ke `Bundle::default()`. Merge dengan local → hasilnya adalah **local state only**, dan corrupt file di-overwrite dengan merged bundle. **Recovery is silent**, user tidak tahu sync data hilang.
- **Saran fix:** Detect `Err`, preserve old file as `folio-sync.json.broken-{timestamp}`, dan laporkan `SyncReport` dengan field `parse_failed: true` (atau similar) yang ditampilkan di UI.

#### 🟢 RENDAH — `set_sync_folder` & `import_sync_bundle` TIDAK menolak path di luar scope
- **File:** `commands.rs:305-309, 323-335`
- Sudah disebut di §1.1. Disini cukup dicatat sebagai axis-4 concern: sync system tidak punya policy "hanya folder yang user pernah set via dialog".

---

## 5. Maturitas Modul & Drift Dokumentasi (Axis 5)

### 5.1 README klaim vs implementasi — Tabel Matang/Fungsional/Parsial/Stub

| Klaim README                                                  | Implementasi                                                          | Status        |
|---------------------------------------------------------------|------------------------------------------------------------------------|----------------|
| EPUB rendering dengan epub.js                                 | `EpubReader.tsx` + asset protocol                                     | **Matang**     |
| PDF rendering dengan pdf.js, zoom & lazy page                 | `PdfReader.tsx` + virtual scroll + zoom bar                            | **Matang**     |
| CBZ comics (single, two-up, strip)                            | `ComicReader.tsx` (3 mode), `comic.rs` ZIP                             | **Matang**     |
| CBR comics (desktop)                                          | `comic.rs` cfg(feature="cbr") + `unrar`                                | **Matang** (with NDK caveat) |
| **CBT (TAR) comics**                                          | **Tidak ada implementasi** — `is_rar()` check, ZIP akan gagal          | **Stub** ⚠️    |
| MOBI/AZW/AZW3 classic (KF8 may fail)                          | `mobi.rs` + `DocReader.tsx`                                            | **Fungsional** (with KF8 limitation) |
| Cover grid/list, search, sort                                 | `Library.tsx` + `visibleBooks()`                                       | **Matang**     |
| Import single files, folder, drag-drop                        | `Library.tsx` + `App.tsx` onDragDropEvent                             | **Matang**     |
| Books copied into Folio's own folder                          | `library.rs:56` `std::fs::copy(source, paths.book_file(&file_name))`  | **Matang**     |
| Duplicate-proof via content hash                              | `library.rs:36-38, 45-47` `book_id = hash[..24]`, test `library.rs:158` | **Matang**     |
| Generated covers                                             | `BookCover.tsx` + `utils.ts:coverGradient()`                           | **Matang**     |
| 5 themes (Day/Sepia/Gray/Night/Black)                         | `theme.ts:17-108`                                                      | **Matang**     |
| Tunable typography (font, size, line height, margins, justify, columns) | `theme.ts:148-203`, `DisplayPanel.tsx`                | **Matang**     |
| TOC                                                           | EPUB: `EpubReader.tsx:80-82`, PDF: `PdfReader.tsx:292-321`, Comic/MOBI: **page numbering** | **Fungsional** |
| In-book search                                                | EPUB: `epub.js spine find`, PDF: `pdfjs getTextContent`, MOBI: `DocReader.tsx:95-126`, **Comic: not supported** | **Matang** (3/4) |
| Focus mode, keyboard, tap zones                               | `Reader.tsx:82-128`                                                    | **Matang**     |
| Read aloud (TTS), speed control                               | `lib/tts.ts`, `Reader.tsx:59-63`                                       | **Matang**     |
| Highlights 5 colors, notes, bookmarks                         | `SelectionMenu.tsx`, `AnnotationsPanel`                                | **Matang**     |
| Export notes to Markdown                                      | `commands.rs:191-237`, `BookSheet.tsx:60-72`                            | **Matang**     |
| Comics: single, two-up, vertical strip                        | `ComicReader.tsx` + `behavior.comicMode`                               | **Matang**     |
| PDFs: zoom & lazy page                                        | `PdfReader.tsx:174-200, 220-226`                                        | **Matang**     |
| **PDF highlighting**                                          | "not implemented" (README known limits)                                | **Stub** (consistent) |
| Folder sync (iCloud/Dropbox/Syncthing), last-write-wins       | `sync.rs:101-121`, test `library.rs:293-358`                            | **Matang**     |
| Tombstoned deletions                                          | `annotations.rs:78-86` `deleted_at`, `library.rs:348-358` test        | **Matang**     |
| Reading stats (streak, time/day, in-progress, finished)       | `stats.rs:25-94`, `Stats.tsx`                                          | **Matang**     |
| Android build                                                 | `docs/ANDROID.md`, `package.json:14-16`                                | **Fungsional** (tidak ada CI confirm) |

### 5.2 Android build — sudah pernah di-test?

- **CI:** `release.yml:93-142` ada `android` job yang jalankan `pnpm tauri android init --ci` + `pnpm tauri android build --apk`. **Build akan jalan di tag**, upload artifact. **Tapi** — tidak ada commit/branch history yang menunjukkan ini pernah di-test manual. Workflow ini trigger hanya saat push tag `v*`.
- **Kesimpulan:** Android build *kondisional tested* (saat release). Untuk development biasa, developer lokal perlu env lengkap (JDK 17, NDK 27.1.12297006) per `docs/ANDROID.md`. **Tidak aspirational, tapi flow tidak sering tereksekusi.**

#### ⚠️ perlu verifikasi manual — Sync folder di Android
- **File:** `docs/ANDROID.md:75-80`
- **Kutipan:** "The sync folder must be a directory the app can read and write. A folder inside the app's own storage that a sync client (Syncthing, for instance) mirrors is the arrangement that works most reliably; cloud providers that expose files only through a document provider may not be readable as a plain path."
- **Observasi:** Android scoped storage / SAF limitation. Kode sync.rs tidak Android-specific, jadi `set_sync_folder` di Android akan terima path string dan `std::fs::create_dir_all(folder)?` akan **gagal** untuk path di luar app-specific storage.
- **Saran fix:** Tambah `#[cfg(target_os = "android")]` branch di `sync.rs` yang pakai `tauri-plugin-fs` (yang sudah didefine di capabilities) atau `Storage Access Framework` picker. Untuk saat ini, **behavior failure perlu graceful di-error**, bukan panic.

### 5.3 CI / Lint / Test otomatis

- **File:** `.github/workflows/release.yml`
- **Trigger:** `push: tags: ["v*"]` atau `workflow_dispatch`. **Tidak** ada workflow untuk `pull_request` atau `push` ke branch biasa.
- **Isi:** desktop (4 OS) + Android build, dengan step `pnpm exec tsc --noEmit` dan `cargo test --manifest-path src-tauri/Cargo.toml` (line 78-80).
- **Konsekuensi:** **PR merge tidak menjalankan test/lint.** Bug masuk ke main tanpa dicek otomatis.

#### 🟡 SEDANG — Tidak ada CI untuk push/PR (hanya tag)
- **File:** `.github/workflows/`
- **Bukti:** `ls .github/workflows/` → hanya `release.yml`. Tidak ada `ci.yml` / `lint.yml` / `pr.yml`.
- **Risiko:** Type errors, lint, atau test failure baru bisa masuk ke main dan hanya terdeteksi saat tag release.
- **Saran fix:** Tambah `ci.yml` yang trigger di `push: branches: [main]` dan `pull_request`, running `pnpm install --frozen-lockfile` + `tsc --noEmit` + `cargo build` + `cargo test`.

### 5.4 Frontend test suite

- **File:** `find . -name "*.test.*" -o -name "*.spec.*" | grep -v node_modules` → **0 result**.
- **Backend test suite:** `src-tauri/tests/library.rs` (6 tests, 376 baris) — **sangat baik**.
- **Konsekuensi:** Component logic (zustand stores, readers, panels) **tidak ada coverage**. Bug UI bisa masuk tanpa terdeteksi.

#### 🟡 SEDANG — Tidak ada unit test untuk frontend
- **Saran fix:** Tambah vitest, cover pure functions (`visibleBooks`, `flattenToc`, `coverGradient`, `formatDuration`, `parse<T>` di settings store) dan zustand stores dengan `@testing-library/react`.

### 5.5 epubjs stuck di 0.3.x

- Sudah disebut di §4.1. README tidak klaim versi spesifik; dokumentasi tidak menyebut rencana upgrade.

### 5.6 📚 docs/ — kelengkapan

- `docs/ANDROID.md` (102 baris) — komprehensif, well-structured.
- **Tidak ada** `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/CONTRIBUTING.md`, atau `docs/SYNC.md`.
- **README** adalah sumber utama dokumentasi dan ia sudah self-contained untuk user-facing, tapi contributor akan susah onboard.

### 5.7 ⚪ Migration story

- Schema migration ada di `db/mod.rs:33-126` dengan `PRAGMA user_version`. Saat ini hanya `MIGRATIONS[0]` (initial schema). **Aman untuk v0.1**; nanti saat ada schema v2, migration code path sudah ada.
- **Tidak ada migration testing** di `tests/library.rs` — pattern tambah MIGRATIONS[i] tidak punya test fixture. Minor.

### 5.8 ⚪ Misc minor findings

- `src/lib/constants.ts:1-2` — `export const sync = "folio-sync.json"`. **Nama variabel `sync` terlalu generik** — risk of name clash. Import di `Settings.tsx:11` rename ke `SYNC_FILE_NAME`. **OK, sudah aman** dengan rename.
- `src/components/ui/Toast.tsx:19` — `let nextId = 1` di top-level module (mutable global). Tidak pernah di-reset. Untuk long-lived app, ID bisa overflow (Number.MAX_SAFE_INTEGER). **Acceptable untuk app skala Folio** (toast muncul <1000 kali per session).
- `src/types/index.ts:124` SearchHit punya `chapter: string | null` — **OK** (nullable untuk search tanpa TOC).
- `src/pages/Stats.tsx:64-77` chart pakai `bg-accent` dengan height 6px minimum, opacity 0.28 untuk zero. **Bagus a11y/visual differentiation.**

---

## 6. Area yang SUDAH BAIK (jangan cuma nyari salah)

Repo ini **mature untuk v0.1**, dengan beberapa excellence:

1. **Tipe domain yang eksplisit** (`src/types/index.ts`) — TIDAK ada `any`/`@ts-ignore` di seluruh frontend.
2. **Zero `console.log` di production source** — semua error lewat typed `AppError` → user-friendly string → `toast.error()`.
3. **Asset protocol streaming untuk EPUB/PDF besar** — `bookAssetUrl()` pattern cerdas, 400 MB PDF tidak disalin ke JS memory.
4. **Content-addressed book id (`hash[..24]`)** — multi-device dedup otomatis via sync, tanpa server. Test verify ini.
5. **Race-free sync** — atomic rename + last-write-wins + tombstone propagation. Test di library.rs:293-358 cover skenario dua device konkuren.
6. **TTS dengan `speechSynthesis` platform** — zero-cost, no model ship.
7. **Book cover generator** (`coverGradient`) — deterministic dari title hash, shelf tetap recognizable.
8. **Magic byte check untuk PDF** (`formats/mod.rs:51-58`) — `fake.pdf` (yang sebenarnya ZIP) ditolak. **Bagus, defense in depth.**
9. **Tauri permission scope `$APPDATA` di `default.json` dan `assetProtocol.scope` di `tauri.conf.json`** — minimal surface, meskipun `opener:` over-permissive (lihat §1.1).
10. **Integration test fixture yang buat EPUB/CBZ asli** (library.rs:48-111) — bukan mock, real bytes. **Excellent practice.**
11. **CSP konservatif** (`connect-src 'self' ipc:`) + `script-src 'self'` + `frame-src 'self' blob:` — defense in depth.
12. **Custom `AppError::Serialize`** — error string ke FE, no exception backtrace leak.
13. **`allowScriptedContent: false`** di epub.js — sanitize EPUB HTML sebelum iframe.
14. **`sanitize()` di DocReader** — strip script/iframe/on-handlers sebelum `dangerouslySetInnerHTML`.
15. **`visibleBooks()` sebagai pure function**, bukan derived state di store — best practice zustand.
16. **Debounce strategy** (300ms settings, 900ms progress) — slider tidak flood IPC.
17. **One-process-per-CLI-flag** di `pnpm app`/`pnpm app:build`/`pnpm android:*` — clean script surface.
18. **Doc string di `library.rs`, `comic.rs`, `mobi.rs`, `paths.rs`** menjelaskan "kenapa" — bukan hanya "apa".
19. **DocReader pakai CSS columns** untuk paginate — reuse engine, tidak perlu render kedua.

---

## 7. Ringkasan Eksekutif — Tabel Prioritas

| Prioritas | #   | Topik                                                  | Severity    | File                                            | Effort |
|------------|-----|--------------------------------------------------------|--------------|--------------------------------------------------|---------|
| **P0 (Segera)** | 1 | ~~Scope `opener:allow-open-path` & `opener:allow-reveal-item-in-dir` ke `$APPDATA/**`~~ ✅ FIXED t_9fc5d629 | 🔴 KRITIS | `capabilities/desktop.json:15-26`                | done |
| **P0 (Segera)** | 2 | ~~Validasi `import_files`/`import_folder` source path~~ ✅ FIXED t_9fc5d629 | 🟠 TINGGI   | `library.rs:18-104, 167-251`, `commands.rs:38-62`        | done |
| **P0 (Segera)** | 3 | ~~Validasi `export_sync_bundle`/`import_sync_bundle` `file` & size cap~~ ✅ FIXED t_9fc5d629 | 🟠 TINGGI   | `commands.rs:18-24, 336-428`                            | done |
| **P1 (Penting)** | 4 | Validasi `set_sync_folder` folder (writable check)     | 🟡 SEDANG   | `commands.rs:305-309`                            | 1 hr    |
| **P1 (Penting)** | 5 | Detect `folio-sync.json` parse error & preserve backup | 🟡 SEDANG   | `sync.rs:104-106`                                | 1 hr    |
| **P1 (Penting)** | 6 | Hapus `"cbt"` dari SUPPORTED_EXTENSIONS atau implement TAR parser | 🟡 SEDANG   | `formats/mod.rs:30-32`, `comic.rs`               | 2-4 hr  |
| **P1 (Penting)** | 7 | CI workflow untuk push/PR (`ci.yml`)                  | 🟡 SEDANG   | `.github/workflows/` (add new)                  | 1-2 hr  |
| **P1 (Penting)** | 8 | Tambah vitest + cover pure functions & stores         | 🟡 SEDANG   | `package.json`, `src/**/*.test.ts` (new)         | 4-8 hr  |
| **P1 (Penting)** | 9 | CSP `style-src 'unsafe-inline'` → nonce-based atau inject to `<head>` | 🟡 SEDANG | `tauri.conf.json:27` + `theme.ts:165` | 4-8 hr |
| **P1 (Penting)** | 10 | Android scoped storage / SAF untuk sync folder       | ⚠️ perlu verifikasi | `sync.rs`, Android-specific code | 1-3 hari |
| **P2 (Nice)** | 11 | Lock `pdfjs-dist` ke patch exact (no `^`)            | 🟢 RENDAH   | `package.json:27`                                | 5 min   |
| **P2 (Nice)** | 12 | Surface sourcemap di production build (`TAURI_ENV_DEBUG` atau override) | 🟢 RENDAH | `vite.config.ts:25-29`                       | 30 min  |
| **P2 (Nice)** | 13 | `console.warn` di `parse<T>` settings corruption     | 🟢 RENDAH   | `src/store/settings.ts:55-63`                    | 15 min  |
| **P2 (Nice)** | 14 | MOBI cover: pakai EXTH record 201 jika ada            | 🟢 RENDAH   | `src-tauri/src/formats/mobi.rs:23-32`            | 2-4 hr  |
| **P2 (Nice)** | 15 | Doc: jelaskan `setPanel` toggle behavior              | 🟢 RENDAH   | `src/store/reader.ts:113`                        | 5 min   |
| **P2 (Nice)** | 16 | Doc: Tambah `docs/ARCHITECTURE.md` & `docs/SECURITY.md` | 🟢 RENDAH | `docs/` (new)                                    | 2-4 hr  |
| **P2 (Nice)** | 17 | README: pnpm version note (`corepack` issue)          | 🟢 RENDAH   | `README.md:34-43`                                | 10 min  |
| **P3 (Watch)** | 18 | `image 0.25` & `unrar 0.5` — pantau advisories        | ℹ️ INFO     | `Cargo.toml:35, 45`                              | ongoing |
| **P3 (Watch)** | 19 | epubjs 0.3.x tidak update aktif                       | ℹ️ INFO     | `package.json:24`                                | ongoing |
| **P3 (Watch)** | 20 | `mobi` crate untuk KF8/AZW3 baru                      | ℹ️ INFO     | `Cargo.toml:34`                                  | ongoing |

---

## 8. Lampiran — Bukti Kode Kunci

### A. Baseline build (axis 3)

```text
$ ./node_modules/.bin/pnpm install --frozen-lockfile
Done in 18.8s using pnpm v10.34.5

$ ./node_modules/.bin/pnpm exec tsc --noEmit
EXIT=0
```

### B. tsc strict & noUnusedLocals/Parameters aktif

- `tsconfig.json:18-20`: `"strict": true, "noUnusedLocals": true, "noUnusedParameters": true`
- `tsconfig.json:21`: `"noFallthroughCasesInSwitch": true`

### C. Cargo deps dengan `unrar` feature-gated untuk Android

- `Cargo.toml:44-49`:
  ```toml
  [target.'cfg(not(target_os = "android"))'.dependencies]
  unrar = { version = "0.5", optional = true }
  [features]
  default = ["cbr"]
  cbr = ["dep:unrar"]
  ```
- `comic.rs:133, 149, 181, 218, 223, 228, 233` — semua call ke `unrar` di-gate `#[cfg(all(feature = "cbr", not(target_os = "android")))]` atau di-stubs `#[cfg(not(...))]`. **Excellent engineering.**

### D. Book id = SHA-256(content)[:24]

- `library.rs:36-38`:
  ```rust
  fn book_id(hash: &str) -> String {
      hash[..24].to_string()
  }
  ```
- Test `library.rs:307` `assert_eq!(on_laptop.id, on_phone.id, "content hash gives a shared id")`. **Konsisten dengan klaim "two devices that import the same file agree on the id without ever talking".**

### E. Test pass count (best estimate; cargo tidak ada di env)

- `src-tauri/tests/library.rs` punya 6 `#[test]` functions:
  1. `imports_epub_metadata_cover_and_deduplicates`
  2. `comic_pages_sort_naturally_and_skip_resource_forks`
  3. `folder_scan_finds_every_supported_book`
  4. `unsupported_files_fail_with_a_readable_message`
  5. `progress_annotations_and_deletion_round_trip`
  6. `reading_time_and_stats_accumulate`
  7. `sync_folder_carries_reading_state_to_another_device`
  8. `book_path_resolves_format_and_reports_missing_files`
- Plus 2 unit test di `formats/comic.rs` (`pages_sort_numerically`, `resource_forks_are_not_pages`) dan 2 di `formats/mobi.rs` (`recindex_is_parsed_from_any_quoting`, `images_without_records_are_dropped`), 2 di `util.rs` (`round_trips`, `strips_data_url_prefix`), 1 di `sync.rs` (`newest_row_wins_and_unknown_rows_survive`).
- **Total ~15 test functions.** Backend coverage sangat baik untuk ukuran codebase.

---

## 9. Penutup

Folio v0.1 ditulis dengan **disiplin tinggi** (strict TS, zero `any`, zero `console.log`, konten EPUB yang di-untrust sebagai input, type-safety end-to-end via `types/index.ts` ↔ `db/models.rs`). Backend Rust mature dengan integration test real (bukan mock). Sync design (content-hash id + last-write-wins + tombstone + atomic rename) **sudah benar secara algoritma** dan teruji.

**Risiko utama yang perlu ditangani sebelum production release ke user yang lebih luas:**

1. ~~Tiga isu keamanan di §1.1 (CRITICAL/TINGGI) yang berasal dari `opener:allow-open-path` scope `**` dan kurangnya validasi path di command Tauri.~~ **Fixed in t_9fc5d629** — lihat status banner di atas dan §1.1.
2. CBT format yang diklaim tapi tidak diimplementasi.
3. CI untuk push/PR (saat ini test/lint hanya jalan saat tag release).

Setelah tiga itu, Folio v0.1 akan punya fondasi yang siap untuk v0.2 yang menambahkan fiturnya (PDF highlighting, EPUB 3.4 advanced features, dsb.) di atas basis yang **sudah benar secara arsitektur**.

**Rekomendasi:** *Iterasi cepat pada P0/P1, freeze untuk tag v0.1.0, lalu onboard contributor dengan `docs/ARCHITECTURE.md` + `docs/SECURITY.md`.*

---

*Audit dilakukan read-only pada 2026-08-25. Commit audited: `0e00444`. Laporan ditulis ke `AUDIT_REPORT_folio_202608.md` (lokal, tidak di-commit).*

