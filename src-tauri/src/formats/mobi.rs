use std::path::Path;

use super::Metadata;
use crate::error::{AppError, AppResult};

/// Books above this size are served without inlined images: a MOBI with 400
/// full-page scans would otherwise produce a document the webview cannot hold.
const MAX_INLINE_TOTAL: usize = 40 * 1024 * 1024;
const MAX_INLINE_IMAGE: usize = 4 * 1024 * 1024;

fn open(path: &Path) -> AppResult<mobi::Mobi> {
    mobi::Mobi::from_path(path).map_err(|e| {
        AppError::msg(format!(
            "This MOBI/AZW3 file could not be read ({e}). Newer AZW3 files sometimes need to be \
             converted to EPUB first — Calibre does this in one step."
        ))
    })
}

pub fn extract(path: &Path) -> AppResult<Metadata> {
    let book = open(path)?;
    let title = book.title();
    let cover = book
        .image_records()
        .into_iter()
        .map(|record| record.content.to_vec())
        .find(|bytes| image::guess_format(bytes).is_ok())
        .map(|bytes| {
            let ext = super::image_extension(&bytes).to_string();
            (bytes, ext)
        });

    Ok(Metadata {
        title: (!title.trim().is_empty()).then_some(title),
        author: book.author(),
        publisher: book.publisher(),
        description: book.description(),
        language: Some(format!("{:?}", book.language()).to_lowercase()),
        cover,
        ..Default::default()
    })
}

/// Whole-book HTML for the reflowable reader. MOBI has no spine to stream, so
/// the document is produced in one piece and paginated in the webview.
pub fn content_html(path: &Path) -> AppResult<String> {
    let book = open(path)?;
    let raw = book.content_as_string_lossy();
    if raw.trim().is_empty() {
        return Err(AppError::msg(
            "This file's text could not be extracted — it is most likely a KF8/AZW3 book. \
             Converting it to EPUB with Calibre will make it readable here.",
        ));
    }

    let images: Vec<Vec<u8>> = book
        .image_records()
        .into_iter()
        .map(|record| record.content.to_vec())
        .collect();
    Ok(rewrite(&raw, &images))
}

/// MOBI markup points at images by record number (`recindex`) and uses
/// `<mbp:pagebreak/>` for breaks. Both are meaningless to a browser, so they
/// are rewritten into data URLs and `<hr>`s here rather than in the frontend.
fn rewrite(html: &str, images: &[Vec<u8>]) -> String {
    let mut out = String::with_capacity(html.len() + 1024);
    let mut inlined = 0usize;
    let mut rest = html;

    while let Some(start) = rest.find("<img") {
        out.push_str(&rest[..start]);
        let tail = &rest[start..];
        let end = match tail.find('>') {
            Some(end) => end + 1,
            None => {
                out.push_str(tail);
                rest = "";
                break;
            }
        };
        let tag = &tail[..end];
        match recindex(tag).and_then(|i| images.get(i.saturating_sub(1))) {
            Some(bytes)
                if bytes.len() <= MAX_INLINE_IMAGE
                    && inlined + bytes.len() <= MAX_INLINE_TOTAL =>
            {
                inlined += bytes.len();
                let mime = match super::image_extension(bytes) {
                    "png" => "image/png",
                    "gif" => "image/gif",
                    "webp" => "image/webp",
                    "bmp" => "image/bmp",
                    _ => "image/jpeg",
                };
                out.push_str(&format!(
                    "<img alt=\"\" src=\"data:{mime};base64,{}\"/>",
                    crate::util::encode(bytes)
                ));
            }
            // Dropping the tag entirely beats leaving a broken-image icon in
            // the middle of a paragraph.
            _ => {}
        }
        rest = &tail[end..];
    }
    out.push_str(rest);

    out.replace("<mbp:pagebreak/>", "<hr class=\"page-break\"/>")
        .replace("<mbp:pagebreak>", "<hr class=\"page-break\"/>")
        .replace("</mbp:pagebreak>", "")
}

fn recindex(tag: &str) -> Option<usize> {
    let at = tag.find("recindex")?;
    let after = &tag[at + "recindex".len()..];
    let digits: String = after
        .chars()
        .skip_while(|c| !c.is_ascii_digit())
        .take_while(|c| c.is_ascii_digit())
        .collect();
    digits.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recindex_is_parsed_from_any_quoting() {
        assert_eq!(recindex("<img recindex=\"00012\"/>"), Some(12));
        assert_eq!(recindex("<img recindex=7 >"), Some(7));
        assert_eq!(recindex("<img src=\"x.png\">"), None);
    }

    #[test]
    fn images_without_records_are_dropped() {
        let html = rewrite("<p>a</p><img recindex=\"5\"/><p>b</p>", &[]);
        assert_eq!(html, "<p>a</p><p>b</p>");
    }
}
