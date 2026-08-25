use rusqlite::Connection;
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

use crate::db::models::{Book, ImportFailure, ImportReport};
use crate::db::{books, now_ms};
use crate::error::{AppError, AppResult};
use crate::formats::{self, Format, SUPPORTED_EXTENSIONS};
use crate::paths::AppPaths;

/// Covers are stored at reading-list size, not at the publisher's 3000px
/// original: the grid never shows more, and a 500-book library would otherwise
/// carry a gigabyte of thumbnails.
const COVER_MAX_WIDTH: u32 = 640;

/// Maximum number of files accepted in a single import batch. A reader who
/// points the folder picker at `~/Library/Caches` would otherwise be asked to
/// index tens of thousands of files; the scanner already filters by extension,
/// but the cap is the safety net.
pub const MAX_IMPORT_FILES: usize = 5_000;

/// Hard cap on a single source book file. EPUB libraries occasionally ship
/// DRM-free reference volumes north of this; the cap exists so a misnamed
/// disk image or a corrupt blob cannot fill the library folder.
const MAX_SOURCE_BYTES: u64 = 2 * 1024 * 1024 * 1024; // 2 GiB

/// Validates a path the frontend supplied as the source of an import. Returns
/// the canonical, absolute path on success, or a reader-friendly error.
///
/// Two things are checked: the path is well-formed (no `..` components, no
/// NUL, no trailing junk that would change its meaning after `canonicalize`),
/// and once resolved it is a real, regular file we can read. This stops
/// obvious traversal strings (`../../etc/passwd`), special files (`/dev/zero`,
/// character devices), and symlinks that point at things outside the folder
/// the user actually picked. It does not try to enforce an allowed-root list,
/// because the user is allowed to pick any file in their own home directory —
/// the audit's concern was *unguarded* paths, not *arbitrary* paths.
pub fn safe_source(raw: &Path) -> AppResult<PathBuf> {
    let checked = safe_path(raw)?;
    let metadata = std::fs::symlink_metadata(&checked)?;
    if !metadata.file_type().is_file() {
        return Err(AppError::msg(
            "Folio can only import regular files, not folders or devices.",
        ));
    }
    if metadata.len() == 0 {
        return Err(AppError::msg("This file is empty."));
    }
    if metadata.len() > MAX_SOURCE_BYTES {
        return Err(AppError::msg(format!(
            "This file is too large to import (limit is {} MB).",
            MAX_SOURCE_BYTES / (1024 * 1024)
        )));
    }
    Ok(checked)
}

/// Validates the *root* of a folder scan: must be an existing, readable
/// directory. Files inside it are still subject to the per-file `safe_source`
/// check via `import_many`.
pub fn safe_directory(raw: &Path) -> AppResult<PathBuf> {
    let checked = safe_path(raw)?;
    let metadata = std::fs::symlink_metadata(&checked)?;
    if !metadata.is_dir() {
        return Err(AppError::msg(
            "Pick a folder, not a file.",
        ));
    }
    Ok(checked)
}

/// The path-level checks shared by `safe_source` and `safe_directory`. The
/// path must be representable as UTF-8 (so we can tell the reader what is
/// wrong), free of NUL bytes, free of `..` components, and absolute. It is
/// then canonicalized so the caller sees the same path the kernel does.
fn safe_path(raw: &Path) -> AppResult<PathBuf> {
    let text = raw.to_str().ok_or_else(|| {
        AppError::msg("This file path is not valid on the current system.")
    })?;

    if text.contains('\0') {
        return Err(AppError::msg(
            "This file path is not valid on the current system.",
        ));
    }
    if raw.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
        return Err(AppError::msg(
            "File paths cannot contain '..' segments.",
        ));
    }
    if !raw.is_absolute() {
        return Err(AppError::msg(
            "Folio needs a full file path. Pick the file from the file picker.",
        ));
    }

    std::fs::canonicalize(raw).map_err(|err| {
        AppError::msg(format!(
            "Could not read this file: {err}"
        ))
    })
}

/// Content hash, streamed so a 900 MB PDF does not land in memory.
pub fn hash_file(path: &Path) -> AppResult<String> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 128 * 1024];
    loop {
        let read = file.read(&mut buf)?;
        if read == 0 {
            break;
        }
        hasher.update(&buf[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// The book id *is* the content hash, truncated. Two devices that import the
/// same file agree on the id without ever talking to each other — which is what
/// makes folder sync able to match progress and highlights across machines.
fn book_id(hash: &str) -> String {
    hash[..24].to_string()
}

pub fn import_one(conn: &Connection, paths: &AppPaths, source: &Path) -> AppResult<Book> {
    let format = formats::detect(source)?;
    let hash = hash_file(source)?;
    let id = book_id(&hash);

    if books::exists(conn, &id)? {
        return Err(AppError::msg("Already in your library"));
    }

    let extension = source
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("bin")
        .to_ascii_lowercase();
    let file_name = format!("{id}.{extension}");
    let destination = paths.book_file(&file_name);
    std::fs::copy(source, &destination)?;

    // Metadata failures must not lose the book: fall back to the file name and
    // let the reader fix it in the edit sheet.
    let metadata = formats::extract(&destination, format).unwrap_or_default();
    let cover = metadata
        .cover
        .as_ref()
        .and_then(|(bytes, ext)| write_cover(paths, &id, bytes, ext).ok());

    let size = std::fs::metadata(&destination).map(|m| m.len() as i64).unwrap_or(0);
    let now = now_ms();
    let book = Book {
        id,
        title: metadata
            .title
            .filter(|t| !t.trim().is_empty())
            .unwrap_or_else(|| formats::title_from_path(source)),
        author: metadata.author,
        format: format.as_str().to_string(),
        file_name,
        file_size: size,
        hash,
        language: metadata.language,
        publisher: metadata.publisher,
        description: metadata.description,
        series: metadata.series,
        series_index: metadata.series_index,
        cover,
        page_count: metadata.page_count,
        added_at: now,
        last_opened_at: None,
        finished_at: None,
        favorite: false,
        updated_at: now,
        progress: 0.0,
        location: None,
        collections: Vec::new(),
    };
    books::insert(conn, &book)?;
    Ok(book)
}

/// Imports a batch, reporting per-file outcomes instead of aborting: one
/// corrupt book in a folder of two hundred should not cancel the other 199.
pub fn import_many(conn: &Connection, paths: &AppPaths, sources: &[PathBuf]) -> ImportReport {
    let mut report = ImportReport::default();
    for source in sources {
        let label = source
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown file")
            .to_string();
        // Canonicalize + sanity-check the source before we touch the database
        // or copy anything. A bad path is reported, not fatal — the rest of
        // the batch still imports.
        let checked = match safe_source(source) {
            Ok(p) => p,
            Err(err) => {
                report.failures.push(ImportFailure {
                    file: label,
                    reason: err.to_string(),
                });
                continue;
            }
        };
        match import_one(conn, paths, &checked) {
            Ok(book) => report.imported.push(book),
            Err(AppError::Message(msg)) if msg == "Already in your library" => {
                report.duplicates.push(label)
            }
            Err(err) => report.failures.push(ImportFailure {
                file: label,
                reason: err.to_string(),
            }),
        }
    }
    report
}

/// Every supported book under a folder, recursively, sorted so the import
/// order matches what the reader sees in their file manager.
///
/// Symlinks are not followed (`follow_links(false)`) and the result is
/// capped at `MAX_IMPORT_FILES` — the folder picker is unrestricted, so a
/// misclick on `~/` would otherwise schedule tens of thousands of
/// `canonicalize` calls before the user even sees the dialog close.
pub fn scan_folder(root: &Path) -> Vec<PathBuf> {
    let root = match safe_directory(root) {
        Ok(p) => p,
        Err(_) => return Vec::new(),
    };
    let mut found: Vec<PathBuf> = WalkDir::new(&root)
        .follow_links(false)
        .into_iter()
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_type().is_file())
        .map(|entry| entry.into_path())
        .filter(|path| {
            path.extension()
                .and_then(|e| e.to_str())
                .map(|e| SUPPORTED_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
                .unwrap_or(false)
        })
        .take(MAX_IMPORT_FILES)
        .collect();
    found.sort();
    found
}

/// Decodes, downscales and re-encodes a cover to JPEG. Falls back to storing
/// the original bytes when the format is one `image` cannot decode.
pub fn write_cover(
    paths: &AppPaths,
    book_id: &str,
    bytes: &[u8],
    original_ext: &str,
) -> AppResult<String> {
    match image::load_from_memory(bytes) {
        Ok(decoded) => {
            let resized = if decoded.width() > COVER_MAX_WIDTH {
                decoded.resize(
                    COVER_MAX_WIDTH,
                    u32::MAX,
                    image::imageops::FilterType::CatmullRom,
                )
            } else {
                decoded
            };
            let file_name = format!("{book_id}.jpg");
            resized
                .to_rgb8()
                .save(paths.cover_file(&file_name))
                .map_err(|e| AppError::msg(format!("Could not save the cover: {e}")))?;
            Ok(file_name)
        }
        Err(_) => {
            let file_name = format!("{book_id}.{original_ext}");
            std::fs::write(paths.cover_file(&file_name), bytes)?;
            Ok(file_name)
        }
    }
}

pub fn delete_book(conn: &Connection, paths: &AppPaths, id: &str) -> AppResult<()> {
    let (file_name, cover) = books::delete(conn, id)?;
    crate::paths::remove_if_present(&paths.book_file(&file_name));
    if let Some(cover) = cover {
        crate::paths::remove_if_present(&paths.cover_file(&cover));
    }
    let _ = std::fs::remove_dir_all(paths.book_cache(id));
    Ok(())
}

/// Resolves a book id to the file on disk, verifying it still exists so the
/// reader gets a clear message instead of an empty page.
pub fn book_path(conn: &Connection, paths: &AppPaths, id: &str) -> AppResult<(PathBuf, Format)> {
    let book = books::get(conn, id)?;
    let path = paths.book_file(&book.file_name);
    if !path.exists() {
        return Err(AppError::msg(
            "The file for this book is missing from the library folder.",
        ));
    }
    let format = match book.format.as_str() {
        "epub" => Format::Epub,
        "pdf" => Format::Pdf,
        "comic" => Format::Comic,
        "mobi" => Format::Mobi,
        other => return Err(AppError::UnsupportedFormat(other.to_string())),
    };
    Ok((path, format))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every `safe_source` rejection that does not require touching the
    /// filesystem. The happy path and the regular-file check need a real
    /// file and live in the integration tests, where a scratch dir is
    /// already set up.
    #[test]
    fn safe_source_rejects_unsafe_paths() {
        // A path with a `..` segment is the most obvious traversal attempt.
        let traversal = Path::new("/tmp/folio-test/../etc/passwd");
        let err = safe_source(traversal).unwrap_err().to_string();
        assert!(
            err.contains(".."),
            "rejection message names the issue: {err}"
        );

        // A relative path is a misconfiguration of the caller, not user input
        // we should paper over.
        let relative = Path::new("relative/book.epub");
        let err = safe_source(relative).unwrap_err().to_string();
        assert!(
            err.contains("full file path"),
            "rejection tells the reader what to do: {err}"
        );

        // A path that does not exist fails the canonicalize step.
        let missing = Path::new("/this/path/should/not/exist/anywhere.epub");
        assert!(safe_source(missing).is_err());
    }

    /// A non-existent folder scan is a no-op, not an error — the import
    /// dialog will surface "no books" and the reader can try again.
    #[test]
    fn scan_folder_silently_skips_missing_root() {
        let found = scan_folder(Path::new("/this/folder/does/not/exist"));
        assert!(found.is_empty());
    }
}
