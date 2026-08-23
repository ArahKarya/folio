pub mod comic;
pub mod epub;
pub mod mobi;

use std::path::Path;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Format {
    Epub,
    Pdf,
    Comic,
    Mobi,
}

impl Format {
    pub fn as_str(self) -> &'static str {
        match self {
            Format::Epub => "epub",
            Format::Pdf => "pdf",
            Format::Comic => "comic",
            Format::Mobi => "mobi",
        }
    }
}

/// Extensions accepted by the file picker, the drag-and-drop handler and the
/// folder scanner. Kept in one place so the three cannot drift apart.
pub const SUPPORTED_EXTENSIONS: &[&str] = &[
    "epub", "pdf", "cbz", "cbr", "cbt", "mobi", "azw", "azw3", "prc",
];

/// Extension first — it is what the reader believes the file is — then a magic
/// number check to reject a `.epub` that is really a PDF.
pub fn detect(path: &Path) -> AppResult<Format> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    let format = match ext.as_str() {
        "epub" => Format::Epub,
        "pdf" => Format::Pdf,
        "cbz" | "cbr" | "cbt" => Format::Comic,
        "mobi" | "azw" | "azw3" | "prc" => Format::Mobi,
        other => return Err(AppError::UnsupportedFormat(format!(".{other}"))),
    };

    if format == Format::Pdf {
        let magic = read_magic(path)?;
        if !magic.starts_with(b"%PDF") {
            return Err(AppError::msg(
                "This file is named .pdf but does not contain PDF data.",
            ));
        }
    }
    Ok(format)
}

fn read_magic(path: &Path) -> AppResult<[u8; 8]> {
    use std::io::Read;
    let mut buf = [0u8; 8];
    let mut file = std::fs::File::open(path)?;
    let _ = file.read(&mut buf)?;
    Ok(buf)
}

#[derive(Debug, Default, Clone)]
pub struct Metadata {
    pub title: Option<String>,
    pub author: Option<String>,
    pub publisher: Option<String>,
    pub language: Option<String>,
    pub description: Option<String>,
    pub series: Option<String>,
    pub series_index: Option<f64>,
    pub page_count: Option<i64>,
    /// Raw cover image bytes exactly as stored inside the book, plus the file
    /// extension to write them under. Re-encoding is left to the caller.
    pub cover: Option<(Vec<u8>, String)>,
}

pub fn extract(path: &Path, format: Format) -> AppResult<Metadata> {
    match format {
        Format::Epub => epub::extract(path),
        Format::Comic => comic::extract(path),
        Format::Mobi => mobi::extract(path),
        // A PDF's own metadata is unreliable and its first page has to be
        // rasterised to be useful as a cover — pdf.js does both in the reader
        // and reports back through `set_book_cover`.
        Format::Pdf => Ok(Metadata::default()),
    }
}

/// Fallback title when a book carries no usable metadata: the file name,
/// tidied up rather than shown raw.
pub fn title_from_path(path: &Path) -> String {
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled");
    let cleaned = stem.replace(['_', '.'], " ");
    let cleaned = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    if cleaned.is_empty() {
        "Untitled".to_string()
    } else {
        cleaned
    }
}

/// Image extension guessed from content, used when an archive entry or an EPUB
/// manifest lies about its type.
pub fn image_extension(bytes: &[u8]) -> &'static str {
    match bytes {
        [0xFF, 0xD8, 0xFF, ..] => "jpg",
        [0x89, b'P', b'N', b'G', ..] => "png",
        [b'G', b'I', b'F', ..] => "gif",
        [b'R', b'I', b'F', b'F', _, _, _, _, b'W', b'E', b'B', b'P', ..] => "webp",
        [b'B', b'M', ..] => "bmp",
        _ => "jpg",
    }
}
