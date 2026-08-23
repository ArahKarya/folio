use std::cmp::Ordering;
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use zip::ZipArchive;

use super::Metadata;
use crate::error::{AppError, AppResult};

const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "gif", "webp", "bmp", "avif"];

fn is_page(name: &str) -> bool {
    // `__MACOSX` holds AppleDouble resource forks that look like images but are
    // not; ignoring dotfiles removes them and editor droppings in one rule.
    if name.contains("__MACOSX") || name.ends_with('/') {
        return false;
    }
    let file = name.rsplit('/').next().unwrap_or(name);
    if file.starts_with('.') {
        return false;
    }
    let ext = file
        .rsplit_once('.')
        .map(|(_, e)| e.to_ascii_lowercase())
        .unwrap_or_default();
    IMAGE_EXTENSIONS.contains(&ext.as_str())
}

/// Page 10 must not sort before page 2: compare digit runs numerically.
fn natural_cmp(a: &str, b: &str) -> Ordering {
    let (mut x, mut y) = (a.chars().peekable(), b.chars().peekable());
    loop {
        match (x.peek().copied(), y.peek().copied()) {
            (None, None) => return Ordering::Equal,
            (None, _) => return Ordering::Less,
            (_, None) => return Ordering::Greater,
            (Some(ca), Some(cb)) => {
                if ca.is_ascii_digit() && cb.is_ascii_digit() {
                    let na: String = take_digits(&mut x);
                    let nb: String = take_digits(&mut y);
                    let va = na.trim_start_matches('0');
                    let vb = nb.trim_start_matches('0');
                    let order = va.len().cmp(&vb.len()).then_with(|| va.cmp(vb));
                    if order != Ordering::Equal {
                        return order;
                    }
                } else {
                    let order = ca.to_ascii_lowercase().cmp(&cb.to_ascii_lowercase());
                    if order != Ordering::Equal {
                        return order;
                    }
                    x.next();
                    y.next();
                }
            }
        }
    }
}

fn take_digits(it: &mut std::iter::Peekable<std::str::Chars>) -> String {
    let mut out = String::new();
    while let Some(c) = it.peek().copied() {
        if c.is_ascii_digit() {
            out.push(c);
            it.next();
        } else {
            break;
        }
    }
    out
}

fn is_rar(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()),
        Some(ref e) if e == "cbr" || e == "rar"
    )
}

/// Ordered page names inside the archive.
pub fn pages(path: &Path) -> AppResult<Vec<String>> {
    let mut names = if is_rar(path) {
        rar_pages(path)?
    } else {
        let mut zip = ZipArchive::new(File::open(path)?)?;
        (0..zip.len())
            .filter_map(|i| zip.by_index(i).ok().map(|f| f.name().to_string()))
            .filter(|n| is_page(n))
            .collect()
    };
    names.sort_by(|a, b| natural_cmp(a, b));
    if names.is_empty() {
        return Err(AppError::msg("This comic archive contains no images."));
    }
    Ok(names)
}

pub fn extract(path: &Path) -> AppResult<Metadata> {
    let names = pages(path)?;
    let cover = read_page_bytes(path, &names[0], None).ok().map(|bytes| {
        let ext = super::image_extension(&bytes).to_string();
        (bytes, ext)
    });
    Ok(Metadata {
        page_count: Some(names.len() as i64),
        cover,
        ..Default::default()
    })
}

/// Reads one page. `cache_dir` is only consulted for RAR, where the underlying
/// library can only stream front-to-back — extracting once beats re-scanning
/// the archive for every page turn.
pub fn read_page(path: &Path, index: usize, cache_dir: &Path) -> AppResult<Vec<u8>> {
    let names = pages(path)?;
    let name = names
        .get(index)
        .ok_or_else(|| AppError::msg("That page is past the end of the comic."))?;
    read_page_bytes(path, name, Some(cache_dir))
}

fn read_page_bytes(path: &Path, name: &str, cache_dir: Option<&Path>) -> AppResult<Vec<u8>> {
    if is_rar(path) {
        return rar_read(path, name, cache_dir);
    }
    let mut zip = ZipArchive::new(File::open(path)?)?;
    let mut entry = zip.by_name(name)?;
    let mut buf = Vec::with_capacity(entry.size() as usize);
    entry.read_to_end(&mut buf)?;
    Ok(buf)
}

#[cfg(all(feature = "cbr", not(target_os = "android")))]
fn rar_pages(path: &Path) -> AppResult<Vec<String>> {
    let archive = unrar::Archive::new(path)
        .open_for_listing()
        .map_err(|e| AppError::msg(format!("Could not open the CBR: {e}")))?;
    let mut names = Vec::new();
    for entry in archive {
        let entry = entry.map_err(|e| AppError::msg(format!("Damaged CBR: {e}")))?;
        let name = entry.filename.to_string_lossy().replace('\\', "/");
        if is_page(&name) {
            names.push(name);
        }
    }
    Ok(names)
}

#[cfg(all(feature = "cbr", not(target_os = "android")))]
fn rar_read(path: &Path, name: &str, cache_dir: Option<&Path>) -> AppResult<Vec<u8>> {
    if let Some(dir) = cache_dir {
        let cached = cache_path(dir, name);
        if let Ok(bytes) = std::fs::read(&cached) {
            return Ok(bytes);
        }
        extract_all(path, dir)?;
        return Ok(std::fs::read(&cached)?);
    }
    // No cache available (cover extraction during import): stream to the entry.
    let mut archive = unrar::Archive::new(path)
        .open_for_processing()
        .map_err(|e| AppError::msg(format!("Could not open the CBR: {e}")))?;
    while let Some(header) = archive
        .read_header()
        .map_err(|e| AppError::msg(format!("Damaged CBR: {e}")))?
    {
        let entry = header.entry().filename.to_string_lossy().replace('\\', "/");
        if entry == name {
            let (data, _rest) = header
                .read()
                .map_err(|e| AppError::msg(format!("Could not read the CBR page: {e}")))?;
            return Ok(data);
        }
        archive = header
            .skip()
            .map_err(|e| AppError::msg(format!("Damaged CBR: {e}")))?;
    }
    Err(AppError::msg("That page is missing from the comic."))
}

#[cfg(all(feature = "cbr", not(target_os = "android")))]
fn extract_all(path: &Path, dir: &Path) -> AppResult<()> {
    std::fs::create_dir_all(dir)?;
    let mut archive = unrar::Archive::new(path)
        .open_for_processing()
        .map_err(|e| AppError::msg(format!("Could not open the CBR: {e}")))?;
    while let Some(header) = archive
        .read_header()
        .map_err(|e| AppError::msg(format!("Damaged CBR: {e}")))?
    {
        let name = header.entry().filename.to_string_lossy().replace('\\', "/");
        archive = if is_page(&name) {
            let (data, rest) = header
                .read()
                .map_err(|e| AppError::msg(format!("Could not read the CBR page: {e}")))?;
            std::fs::write(cache_path(dir, &name), data)?;
            rest
        } else {
            header
                .skip()
                .map_err(|e| AppError::msg(format!("Damaged CBR: {e}")))?
        };
    }
    Ok(())
}

/// Flattens an archive path into a single cache file name so nested folders
/// inside the CBR cannot escape the cache directory.
#[cfg(all(feature = "cbr", not(target_os = "android")))]
fn cache_path(dir: &Path, name: &str) -> PathBuf {
    let safe: String = name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' { c } else { '_' })
        .collect();
    dir.join(safe)
}

#[cfg(not(all(feature = "cbr", not(target_os = "android"))))]
fn rar_pages(_path: &Path) -> AppResult<Vec<String>> {
    Err(unsupported())
}

#[cfg(not(all(feature = "cbr", not(target_os = "android"))))]
fn rar_read(_path: &Path, _name: &str, _cache_dir: Option<&Path>) -> AppResult<Vec<u8>> {
    Err(unsupported())
}

#[cfg(not(all(feature = "cbr", not(target_os = "android"))))]
fn unsupported() -> AppError {
    AppError::msg("CBR (RAR) comics are not supported in this build — convert the file to CBZ.")
}

#[cfg(not(all(feature = "cbr", not(target_os = "android"))))]
#[allow(dead_code)]
fn cache_path(dir: &Path, name: &str) -> PathBuf {
    dir.join(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pages_sort_numerically() {
        let mut names = vec!["p10.jpg".to_string(), "p2.jpg".into(), "p1.jpg".into()];
        names.sort_by(|a, b| natural_cmp(a, b));
        assert_eq!(names, vec!["p1.jpg", "p2.jpg", "p10.jpg"]);
    }

    #[test]
    fn resource_forks_are_not_pages() {
        assert!(!is_page("__MACOSX/._001.jpg"));
        assert!(!is_page("comic/.hidden.png"));
        assert!(is_page("comic/001.JPG"));
    }
}
