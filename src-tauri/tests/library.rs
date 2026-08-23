//! End-to-end exercise of the library pipeline without the Tauri runtime:
//! build real book files, import them, read them back, annotate, and round-trip
//! the whole lot through a sync folder.

use std::io::Write;
use std::path::{Path, PathBuf};

use folio_lib::db::models::AnnotationInput;
use folio_lib::db::{annotations, books, collections, settings, stats, Db};
use folio_lib::formats::{self, comic, Format};
use folio_lib::library;
use folio_lib::paths::AppPaths;
use folio_lib::sync;

/// Temporary directory that cleans itself up, so tests leave no residue.
struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let dir = std::env::temp_dir().join(format!("folio-test-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create scratch dir");
        Scratch(dir)
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn png(width: u32, height: u32, tint: u8) -> Vec<u8> {
    let image = image::RgbImage::from_fn(width, height, |x, y| {
        image::Rgb([tint, (x % 255) as u8, (y % 255) as u8])
    });
    let mut bytes = Vec::new();
    image::DynamicImage::ImageRgb8(image)
        .write_to(&mut std::io::Cursor::new(&mut bytes), image::ImageFormat::Png)
        .expect("encode png");
    bytes
}

fn write_epub(path: &Path) {
    let file = std::fs::File::create(path).expect("create epub");
    let mut zip = zip::ZipWriter::new(file);
    let stored =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    let deflated = zip::write::SimpleFileOptions::default();

    zip.start_file("mimetype", stored).unwrap();
    zip.write_all(b"application/epub+zip").unwrap();

    zip.start_file("META-INF/container.xml", deflated).unwrap();
    zip.write_all(
        br#"<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>"#,
    )
    .unwrap();

    zip.start_file("OEBPS/cover.png", deflated).unwrap();
    zip.write_all(&png(60, 90, 200)).unwrap();

    zip.start_file("OEBPS/ch1.xhtml", deflated).unwrap();
    zip.write_all(b"<html><body><h1>One</h1><p>Text.</p></body></html>")
        .unwrap();

    zip.start_file("OEBPS/content.opf", deflated).unwrap();
    zip.write_all(
        br#"<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
 <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:identifier id="id">urn:uuid:test</dc:identifier>
  <dc:title>The Lamplighter &amp; the Sea</dc:title>
  <dc:creator>Ellen Ward</dc:creator>
  <dc:publisher>Folio Test Press</dc:publisher>
  <dc:language>en</dc:language>
  <meta name="calibre:series" content="Test Shelf"/>
  <meta name="calibre:series_index" content="2"/>
 </metadata>
 <manifest>
  <item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/>
  <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
 </manifest>
 <spine><itemref idref="ch1"/></spine>
</package>"#,
    )
    .unwrap();

    zip.finish().unwrap();
}

fn write_cbz(path: &Path) {
    let file = std::fs::File::create(path).expect("create cbz");
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default();
    // Deliberately out of order, and with a resource fork the reader must skip.
    for name in ["page10.png", "page2.png", "page1.png"] {
        zip.start_file(name, options).unwrap();
        zip.write_all(&png(40, 60, 120)).unwrap();
    }
    zip.start_file("__MACOSX/._page1.png", options).unwrap();
    zip.write_all(b"not an image").unwrap();
    zip.finish().unwrap();
}

struct Fixture {
    _scratch: Scratch,
    paths: AppPaths,
    db: Db,
    source: PathBuf,
}

fn fixture(name: &str) -> Fixture {
    let scratch = Scratch::new(name);
    let source = scratch.path().join("incoming");
    std::fs::create_dir_all(&source).unwrap();
    write_epub(&source.join("lamplighter.epub"));
    write_cbz(&source.join("comic.cbz"));

    let paths = AppPaths::new(scratch.path().join("appdata")).expect("app dirs");
    let db = Db::open(&paths.db()).expect("open db");
    Fixture {
        _scratch: scratch,
        paths,
        db,
        source,
    }
}

#[test]
fn imports_epub_metadata_cover_and_deduplicates() {
    let f = fixture("epub");
    let conn = f.db.0.lock();

    let book = library::import_one(&conn, &f.paths, &f.source.join("lamplighter.epub"))
        .expect("import epub");

    assert_eq!(book.title, "The Lamplighter & the Sea", "entities decoded");
    assert_eq!(book.author.as_deref(), Some("Ellen Ward"));
    assert_eq!(book.publisher.as_deref(), Some("Folio Test Press"));
    assert_eq!(book.series.as_deref(), Some("Test Shelf"));
    assert_eq!(book.series_index, Some(2.0));
    assert_eq!(book.format, "epub");

    let cover = book.cover.expect("cover extracted");
    assert!(f.paths.cover_file(&cover).exists(), "cover written to disk");
    assert!(f.paths.book_file(&book.file_name).exists(), "book copied in");

    // The same file imported twice is one book, because the id is its hash.
    let again = library::import_one(&conn, &f.paths, &f.source.join("lamplighter.epub"));
    assert!(again.is_err(), "duplicate import is rejected");
    assert_eq!(books::list(&conn).unwrap().len(), 1);
}

#[test]
fn comic_pages_sort_naturally_and_skip_resource_forks() {
    let f = fixture("comic");
    let conn = f.db.0.lock();
    let book = library::import_one(&conn, &f.paths, &f.source.join("comic.cbz")).expect("import");

    assert_eq!(book.format, "comic");
    assert_eq!(book.page_count, Some(3), "the AppleDouble entry is not a page");

    let file = f.paths.book_file(&book.file_name);
    let pages = comic::pages(&file).unwrap();
    assert_eq!(pages, vec!["page1.png", "page2.png", "page10.png"]);

    let bytes = comic::read_page(&file, 2, &f.paths.book_cache(&book.id)).unwrap();
    assert_eq!(formats::image_extension(&bytes), "png");
}

#[test]
fn folder_scan_finds_every_supported_book() {
    let f = fixture("scan");
    std::fs::write(f.source.join("notes.txt"), "ignore me").unwrap();
    let found = library::scan_folder(&f.source);
    assert_eq!(found.len(), 2, "two books, no text file");

    let conn = f.db.0.lock();
    let report = library::import_many(&conn, &f.paths, &found);
    assert_eq!(report.imported.len(), 2);
    assert!(report.failures.is_empty(), "{:?}", report.failures);

    // A second run reports duplicates rather than failing.
    let again = library::import_many(&conn, &f.paths, &found);
    assert_eq!(again.duplicates.len(), 2);
    assert!(again.imported.is_empty());
}

#[test]
fn unsupported_files_fail_with_a_readable_message() {
    let f = fixture("unsupported");
    let odd = f.source.join("song.mp3");
    std::fs::write(&odd, b"nope").unwrap();
    let error = formats::detect(&odd).unwrap_err().to_string();
    assert!(error.contains(".mp3"), "message names the extension: {error}");

    let liar = f.source.join("fake.pdf");
    std::fs::write(&liar, b"PK\x03\x04 not a pdf").unwrap();
    assert!(formats::detect(&liar).is_err(), "magic bytes are checked");
}

#[test]
fn progress_annotations_and_deletion_round_trip() {
    let f = fixture("state");
    let conn = f.db.0.lock();
    let book = library::import_one(&conn, &f.paths, &f.source.join("lamplighter.epub")).unwrap();

    books::set_progress(&conn, &book.id, 0.42, Some("epubcfi(/6/4!/4/2)")).unwrap();
    let reloaded = books::get(&conn, &book.id).unwrap();
    assert!((reloaded.progress - 0.42).abs() < f64::EPSILON);
    assert_eq!(reloaded.location.as_deref(), Some("epubcfi(/6/4!/4/2)"));

    // Out-of-range progress is clamped rather than stored as-is.
    books::set_progress(&conn, &book.id, 1.4, None).unwrap();
    assert_eq!(books::get(&conn, &book.id).unwrap().progress, 1.0);

    let saved = annotations::save(
        &conn,
        &AnnotationInput {
            id: None,
            book_id: book.id.clone(),
            kind: "highlight".into(),
            location: "epubcfi(/6/4!/4/2,/1:0,/1:12)".into(),
            location_end: None,
            page: None,
            chapter: Some("One".into()),
            text: Some("In the hour before dawn".into()),
            note: None,
            color: Some("#f5b642".into()),
        },
    )
    .unwrap();

    // Saving with the same id edits in place instead of duplicating.
    let edited = annotations::save(
        &conn,
        &AnnotationInput {
            id: Some(saved.id.clone()),
            book_id: book.id.clone(),
            kind: "note".into(),
            location: saved.location.clone(),
            location_end: None,
            page: None,
            chapter: Some("One".into()),
            text: saved.text.clone(),
            note: Some("Look this up".into()),
            color: saved.color.clone(),
        },
    )
    .unwrap();
    assert_eq!(edited.id, saved.id);
    assert_eq!(annotations::list_for_book(&conn, &book.id).unwrap().len(), 1);

    annotations::delete(&conn, &saved.id).unwrap();
    assert!(annotations::list_for_book(&conn, &book.id).unwrap().is_empty());

    let file = f.paths.book_file(&book.file_name);
    let cover = f.paths.cover_file(book.cover.as_deref().unwrap());
    library::delete_book(&conn, &f.paths, &book.id).unwrap();
    assert!(!file.exists(), "the copied book file is removed");
    assert!(!cover.exists(), "the cover is removed");
    assert!(books::list(&conn).unwrap().is_empty());
}

#[test]
fn reading_time_and_stats_accumulate() {
    let f = fixture("stats");
    let conn = f.db.0.lock();
    let book = library::import_one(&conn, &f.paths, &f.source.join("comic.cbz")).unwrap();

    stats::record_session(&conn, &book.id, 300).unwrap();
    stats::record_session(&conn, &book.id, 120).unwrap();
    stats::record_session(&conn, &book.id, -5).unwrap(); // ignored

    let summary = stats::library_stats(&conn).unwrap();
    assert_eq!(summary.seconds_total, 420);
    assert_eq!(summary.seconds_this_week, 420);
    assert_eq!(summary.streak_days, 1);
    assert_eq!(summary.total_books, 1);

    books::set_finished(&conn, &book.id, true).unwrap();
    assert_eq!(stats::library_stats(&conn).unwrap().finished_books, 1);
}

#[test]
fn sync_folder_carries_reading_state_to_another_device() {
    // Two independent libraries that happen to hold the same book file — the
    // situation folder sync exists for.
    let laptop = fixture("sync-laptop");
    let phone = fixture("sync-phone");
    let folder = laptop._scratch.path().join("dropbox");

    let laptop_conn = laptop.db.0.lock();
    let phone_conn = phone.db.0.lock();

    let source = laptop.source.join("lamplighter.epub");
    let on_laptop = library::import_one(&laptop_conn, &laptop.paths, &source).unwrap();
    let on_phone = library::import_one(&phone_conn, &phone.paths, &source).unwrap();
    assert_eq!(on_laptop.id, on_phone.id, "content hash gives a shared id");

    books::set_progress(&laptop_conn, &on_laptop.id, 0.63, Some("epubcfi(/6/4)")).unwrap();
    annotations::save(
        &laptop_conn,
        &AnnotationInput {
            id: None,
            book_id: on_laptop.id.clone(),
            kind: "highlight".into(),
            location: "epubcfi(/6/4!/2,/1:0,/1:9)".into(),
            location_end: None,
            page: None,
            chapter: None,
            text: Some("the sea".into()),
            note: None,
            color: Some("#5ec9a0".into()),
        },
    )
    .unwrap();
    let shelf = collections::create(&laptop_conn, "Evening reading").unwrap();
    collections::set_membership(&laptop_conn, &on_laptop.id, &shelf, true).unwrap();
    settings::set(&laptop_conn, "theme", "sepia").unwrap();
    settings::set(&laptop_conn, "local.syncFolder", "/somewhere/private").unwrap();

    sync::sync(&laptop_conn, &folder).unwrap();
    assert!(folder.join(sync::BUNDLE_NAME).exists());

    let report = sync::sync(&phone_conn, &folder).unwrap();
    assert!(report.applied >= 4, "progress, highlight, collection, setting");

    let arrived = books::get(&phone_conn, &on_phone.id).unwrap();
    assert!((arrived.progress - 0.63).abs() < 1e-9);
    assert_eq!(arrived.collections, vec![shelf.clone()]);
    assert_eq!(annotations::list_for_book(&phone_conn, &on_phone.id).unwrap().len(), 1);
    assert_eq!(settings::get(&phone_conn, "theme").unwrap().as_deref(), Some("sepia"));
    assert_eq!(
        settings::get(&phone_conn, "local.syncFolder").unwrap(),
        None,
        "device-local settings never travel"
    );

    // A deletion on the phone must win on the laptop, not be resurrected.
    let highlight = annotations::list_for_book(&phone_conn, &on_phone.id).unwrap()[0].clone();
    annotations::delete(&phone_conn, &highlight.id).unwrap();
    sync::sync(&phone_conn, &folder).unwrap();
    sync::sync(&laptop_conn, &folder).unwrap();
    assert!(
        annotations::list_for_book(&laptop_conn, &on_laptop.id)
            .unwrap()
            .is_empty(),
        "the tombstone propagated"
    );
}

#[test]
fn book_path_resolves_format_and_reports_missing_files() {
    let f = fixture("paths");
    let conn = f.db.0.lock();
    let book = library::import_one(&conn, &f.paths, &f.source.join("lamplighter.epub")).unwrap();

    let (path, format) = library::book_path(&conn, &f.paths, &book.id).unwrap();
    assert_eq!(format, Format::Epub);
    assert!(path.exists());

    std::fs::remove_file(&path).unwrap();
    let error = library::book_path(&conn, &f.paths, &book.id)
        .unwrap_err()
        .to_string();
    assert!(error.contains("missing"), "readable message: {error}");
}
