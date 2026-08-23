use percent_encoding::percent_decode_str;
use quick_xml::events::Event;
use quick_xml::{Reader, XmlVersion};
use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::path::Path;
use zip::ZipArchive;

use super::Metadata;
use crate::error::{AppError, AppResult};

type Zip = ZipArchive<File>;

pub fn open(path: &Path) -> AppResult<Zip> {
    Ok(ZipArchive::new(File::open(path)?)?)
}

pub fn extract(path: &Path) -> AppResult<Metadata> {
    let mut zip = open(path)?;
    let opf_path = rootfile_path(&mut zip)?;
    let opf = read_entry(&mut zip, &opf_path)?;
    let opf = String::from_utf8_lossy(&opf).into_owned();

    let parsed = parse_opf(&opf);
    let mut meta = parsed.metadata;

    if let Some(href) = parsed.cover_href {
        let base = opf_path.rsplit_once('/').map(|(dir, _)| dir).unwrap_or("");
        let resolved = resolve(base, &href);
        if let Ok(bytes) = read_entry(&mut zip, &resolved) {
            let ext = super::image_extension(&bytes).to_string();
            meta.cover = Some((bytes, ext));
        }
    }
    Ok(meta)
}

/// EPUB entry point: `META-INF/container.xml` names the package document.
fn rootfile_path(zip: &mut Zip) -> AppResult<String> {
    let container = read_entry(zip, "META-INF/container.xml")?;
    let text = String::from_utf8_lossy(&container);
    let mut reader = Reader::from_str(&text);
    reader.config_mut().trim_text(true);
    loop {
        match reader.read_event() {
            Ok(Event::Empty(e)) | Ok(Event::Start(e)) => {
                if local_name(e.name().as_ref()) == "rootfile" {
                    if let Some(path) = attribute(&e, "full-path") {
                        return Ok(path);
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(err) => return Err(AppError::msg(format!("Damaged EPUB container: {err}"))),
            _ => {}
        }
    }
    Err(AppError::msg("This EPUB has no package document."))
}

#[derive(Default)]
struct ParsedOpf {
    metadata: Metadata,
    cover_href: Option<String>,
}

fn parse_opf(xml: &str) -> ParsedOpf {
    let mut reader = Reader::from_str(xml);
    // Text is *not* trimmed per event: the whitespace either side of an entity
    // reference is part of the value, and each fragment arrives separately.
    let mut out = ParsedOpf::default();
    let mut current = String::new();
    // quick-xml splits character data at every entity reference, so text is
    // accumulated across events and committed when the element closes —
    // otherwise a title like "Hunt &amp; Gather" arrives as just "Hunt".
    let mut buffer = String::new();
    let mut cover_id: Option<String> = None;
    // id -> (href, media-type, properties)
    let mut manifest: HashMap<String, (String, String, String)> = HashMap::new();
    let mut spine_count = 0i64;

    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) => {
                current = local_name(e.name().as_ref()).to_string();
                buffer.clear();
            }
            Ok(Event::Empty(e)) => {
                let name = local_name(e.name().as_ref()).to_string();
                collect_element(&e, &name, &mut out, &mut cover_id, &mut manifest);
                if name == "itemref" {
                    spine_count += 1;
                }
                current.clear();
            }
            Ok(Event::Text(text)) => {
                if !current.is_empty() {
                    buffer.push_str(&text.xml10_content());
                }
            }
            Ok(Event::GeneralRef(entity)) => {
                // Entity references are separate events; only the five XML
                // predefined names and numeric refs are meaningful in an OPF.
                if let Some(resolved) = entity.resolve_char_ref().ok().flatten() {
                    buffer.push(resolved);
                } else if let Some(resolved) = predefined_entity(&entity) {
                    buffer.push(resolved);
                }
            }
            Ok(Event::End(_)) => {
                let value = buffer.trim().to_string();
                buffer.clear();
                if !value.is_empty() {
                    let meta = &mut out.metadata;
                    match current.as_str() {
                        "title" if meta.title.is_none() => meta.title = Some(value),
                        "creator" if meta.author.is_none() => meta.author = Some(value),
                        "publisher" if meta.publisher.is_none() => meta.publisher = Some(value),
                        "language" if meta.language.is_none() => meta.language = Some(value),
                        "description" if meta.description.is_none() => meta.description = Some(value),
                        _ => {}
                    }
                }
                current.clear();
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
    }

    if spine_count > 0 {
        out.metadata.page_count = Some(spine_count);
    }
    out.cover_href = pick_cover(&manifest, cover_id.as_deref());
    out
}

fn collect_element(
    e: &quick_xml::events::BytesStart,
    name: &str,
    out: &mut ParsedOpf,
    cover_id: &mut Option<String>,
    manifest: &mut HashMap<String, (String, String, String)>,
) {
    match name {
        // Calibre stores series in `<meta name=… content=…>` (EPUB 2 style).
        "meta" => {
            let key = attribute(e, "name").unwrap_or_default();
            let content = attribute(e, "content").unwrap_or_default();
            match key.as_str() {
                "cover" => *cover_id = Some(content),
                "calibre:series" => out.metadata.series = Some(content),
                "calibre:series_index" => out.metadata.series_index = content.parse().ok(),
                _ => {}
            }
        }
        "item" => {
            if let Some(id) = attribute(e, "id") {
                manifest.insert(
                    id,
                    (
                        attribute(e, "href").unwrap_or_default(),
                        attribute(e, "media-type").unwrap_or_default(),
                        attribute(e, "properties").unwrap_or_default(),
                    ),
                );
            }
        }
        _ => {}
    }
}

/// Cover lookup, most trustworthy source first: EPUB 3 `cover-image`
/// property, then the EPUB 2 `<meta name="cover">` pointer, then a filename
/// that says "cover" on an image item.
fn pick_cover(
    manifest: &HashMap<String, (String, String, String)>,
    cover_id: Option<&str>,
) -> Option<String> {
    for (href, _, properties) in manifest.values() {
        if properties.split_whitespace().any(|p| p == "cover-image") {
            return Some(href.clone());
        }
    }
    if let Some(id) = cover_id {
        if let Some((href, _, _)) = manifest.get(id) {
            return Some(href.clone());
        }
    }
    manifest
        .values()
        .filter(|(_, media, _)| media.starts_with("image/"))
        .find(|(href, _, _)| href.to_ascii_lowercase().contains("cover"))
        .map(|(href, _, _)| href.clone())
}

fn predefined_entity(name: &str) -> Option<char> {
    match name {
        "amp" => Some('&'),
        "lt" => Some('<'),
        "gt" => Some('>'),
        "quot" => Some('"'),
        "apos" => Some('\''),
        _ => None,
    }
}

fn local_name(name: &str) -> &str {
    name.rsplit(':').next().unwrap_or(name)
}

fn attribute(e: &quick_xml::events::BytesStart, key: &str) -> Option<String> {
    e.attributes().flatten().find_map(|attr| {
        if local_name(attr.key.as_ref()) != key {
            return None;
        }
        // Normalising resolves `&amp;` in hrefs, which show up in real EPUBs.
        Some(
            attr.normalized_value(XmlVersion::Implicit1_0)
                .map(|value| value.into_owned())
                .unwrap_or_else(|_| attr.value.clone().into_owned()),
        )
    })
}

/// Joins an OPF-relative href onto the package directory and normalises the
/// `../` segments some publishers emit.
pub fn resolve(base: &str, href: &str) -> String {
    let href = href.split(['#', '?']).next().unwrap_or(href);
    let decoded = percent_decode_str(href).decode_utf8_lossy().into_owned();
    let mut parts: Vec<&str> = Vec::new();
    if !base.is_empty() {
        parts.extend(base.split('/').filter(|s| !s.is_empty()));
    }
    for segment in decoded.split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            other => parts.push(other),
        }
    }
    parts.join("/")
}

pub fn read_entry(zip: &mut Zip, name: &str) -> AppResult<Vec<u8>> {
    // Some producers write backslashes or a leading slash into the central
    // directory, so fall back to a normalised comparison before giving up.
    if let Ok(mut file) = zip.by_name(name) {
        let mut buf = Vec::with_capacity(file.size() as usize);
        file.read_to_end(&mut buf)?;
        return Ok(buf);
    }
    let target = name.trim_start_matches('/').replace('\\', "/").to_lowercase();
    let index = (0..zip.len()).find(|i| {
        zip.by_index(*i)
            .map(|f| f.name().trim_start_matches('/').replace('\\', "/").to_lowercase() == target)
            .unwrap_or(false)
    });
    match index {
        Some(i) => {
            let mut file = zip.by_index(i)?;
            let mut buf = Vec::with_capacity(file.size() as usize);
            file.read_to_end(&mut buf)?;
            Ok(buf)
        }
        None => Err(AppError::msg(format!("Missing inside the EPUB: {name}"))),
    }
}
