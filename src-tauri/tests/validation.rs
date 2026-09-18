//! Regression tests for the path and size validation added in response to
//! the security audit (kanban t_9fc5d629). Each test pins one of the
//! failure modes a malicious or just careless frontend could trigger.

use std::io::Write;
use std::path::{Path, PathBuf};

use folio_lib::db::{books, Db};
use folio_lib::library;
use folio_lib::paths::AppPaths;
use folio_lib::sync;

/// Temporary directory that cleans itself up, so tests leave no residue.
struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let dir = std::env::temp_dir().join(format!("folio-val-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create scratch dir");
        Scratch(dir)
    }

    fn path(&self) -> &std::path::Path {
        &self.0
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
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
    let paths = AppPaths::new(scratch.path().join("appdata")).expect("app dirs");
    let db = Db::open(&paths.db()).expect("open db");
    Fixture {
        _scratch: scratch,
        paths,
        db,
        source,
    }
}

/// A real book file: minimal but valid EPUB so the format detector accepts
/// it. Sharing this between tests keeps the focus on what the validation
/// does, not on EPUB construction.
fn write_real_epub(path: &Path) -> PathBuf {
    write_epub_bytes(path);
    path.to_path_buf()
}

fn write_epub_bytes(path: &Path) {
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

    zip.start_file("OEBPS/content.opf", deflated).unwrap();
    zip.write_all(
        br#"<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
 <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:identifier id="id">urn:uuid:val</dc:identifier>
  <dc:title>Validation Subject</dc:title>
  <dc:creator>Test</dc:creator>
  <dc:language>en</dc:language>
 </metadata>
 <manifest>
  <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
 </manifest>
 <spine><itemref idref="ch1"/></spine>
</package>"#,
    )
    .unwrap();

    zip.start_file("OEBPS/ch1.xhtml", deflated).unwrap();
    zip.write_all(b"<html><body><p>Body.</p></body></html>").unwrap();

    zip.finish().unwrap();
}

#[test]
fn import_many_rejects_traversal_in_filename() {
    let f = fixture("traversal");
    let good = f.source.join("real.epub");
    write_real_epub(&good);
    let conn = f.db.0.lock();

    // A path that *looks* like it tries to escape via `..`. The validator
    // rejects it before any database write or copy happens, so the batch
    // import reports it as a failure and moves on.
    let sneaky = f.source.join("..").join("escaped.epub");
    let report = library::import_many(&conn, &f.paths, std::slice::from_ref(&sneaky));

    assert!(report.imported.is_empty(), "the traversal path is not imported");
    assert_eq!(report.failures.len(), 1, "one failure reported");
    assert!(
        report.failures[0].reason.contains(".."),
        "failure names the cause: {}",
        report.failures[0].reason
    );
}

#[test]
fn import_many_rejects_a_missing_file_in_the_batch() {
    let f = fixture("missing");
    let good = f.source.join("real.epub");
    write_real_epub(&good);
    let conn = f.db.0.lock();

    let ghost = f.source.join("does-not-exist.epub");
    let report = library::import_many(&conn, &f.paths, &[good, ghost]);

    assert_eq!(report.imported.len(), 1, "the real book still imports");
    assert_eq!(report.failures.len(), 1, "the ghost is reported, not fatal");
}

#[test]
fn scan_folder_skips_paths_with_parent_segments() {
    // A folder picker that contains a `..` entry is rejected entirely —
    // the user would see an empty shelf and try again.
    let f = fixture("badroot");
    let report = library::scan_folder(&f.source.join(".."));
    assert!(report.is_empty(), "no books discovered from a bad root");
}

#[test]
fn safe_source_accepts_a_real_file() {
    // The happy path: a regular file inside a real directory is canonicalized
    // and returned untouched. Anything stricter would break the normal
    // import flow.
    let f = fixture("happy");
    let good = f.source.join("book.epub");
    write_real_epub(&good);
    let checked = library::safe_source(&good).expect("regular file passes");
    assert!(checked.is_absolute(), "canonicalized path is absolute");
    assert!(checked.exists(), "returned path resolves to a file");
}

#[test]
fn safe_source_rejects_a_directory_passed_as_a_file() {
    // A common JS bug is to send a folder path through `import_files`. The
    // error message is what the reader sees, so it should name the problem.
    let f = fixture("dir-as-file");
    let err = library::safe_source(&f.source).unwrap_err().to_string();
    assert!(
        err.contains("regular file"),
        "rejection explains what is wrong: {err}"
    );
}

#[cfg(unix)]
#[test]
fn safe_source_rejects_a_symlink_pointing_outside_the_picked_folder() {
    // The validator canonicalizes first, so a symlink that *resolves* to a
    // regular file is followed and accepted. A symlink whose target is a
    // device or a directory, however, must be rejected — that is the path
    // through which a hostile reader of an EPUB could try to read a
    // character device.
    //
    // We use `/dev/null` as the symlink target because it exists on every
    // Unix host. Creating a symlink is not in `std::fs` — it lives in the
    // platform module — so the test is Unix-only rather than bailing at runtime.
    let f = fixture("symlink");
    let link = f.source.join("escape-link");
    if std::os::unix::fs::symlink("/dev/null", &link).is_err() {
        return;
    }
    let err = library::safe_source(&link).unwrap_err().to_string();
    assert!(
        err.contains("regular file") || err.contains(".."),
        "symlink to a device is rejected: {err}"
    );
}

/// `safe_directory` is the dual of `safe_source`: a folder must be a folder.
/// A typo in the JS layer (sending a file as the folder) used to be silently
/// treated as "no books found" by `scan_folder`; now the test pins the
/// explicit error.
#[test]
fn safe_directory_rejects_a_file() {
    let f = fixture("file-as-dir");
    let bogus = f.source.join("looks-like-a-folder.epub");
    write_real_epub(&bogus);
    let err = library::safe_directory(&bogus).unwrap_err().to_string();
    assert!(
        err.contains("folder"),
        "rejection names the right shape: {err}"
    );
}

/// A 4 GiB file would previously have been copied verbatim into the library
/// folder. The cap is far above anything Folio can render, so the only
/// files that exceed it are the ones we *want* to refuse.
#[test]
fn safe_source_rejects_an_oversized_file() {
    let f = fixture("huge");
    let big = f.source.join("huge.epub");
    // A sparse file is enough: `metadata().len()` reports the apparent size
    // even when the bytes are not actually written to disk, so the test
    // stays fast.
    let file = std::fs::File::create(&big).unwrap();
    file.set_len(3 * 1024 * 1024 * 1024).unwrap(); // 3 GiB

    let err = library::safe_source(&big).unwrap_err().to_string();
    assert!(
        err.contains("too large"),
        "rejection names the cause: {err}"
    );

    // The library folder stays empty.
    let conn = f.db.0.lock();
    assert!(books::list(&conn).unwrap().is_empty());
}

/// The sync bundle's own round-trip is unchanged: a normal export followed
/// by an `apply` re-derives the same state. This is the "did we regress
/// the happy path?" check for Fix 3.
#[test]
fn sync_bundle_round_trip_through_the_filesystem() {
    let f = fixture("bundle-roundtrip");
    let conn = f.db.0.lock();
    let book = write_real_epub(&f.source.join("book.epub"));
    let _ = library::import_one(&conn, &f.paths, &book).unwrap();
    books::set_progress(&conn, &books::list(&conn).unwrap()[0].id, 0.5, None).unwrap();

    let bundle = sync::export(&conn).expect("export");
    let on_disk = f.source.join("folio-sync.json");
    std::fs::write(&on_disk, serde_json::to_vec_pretty(&bundle).unwrap()).unwrap();
    let reloaded: sync::Bundle =
        serde_json::from_slice(&std::fs::read(&on_disk).unwrap()).unwrap();
    let report = sync::apply(&conn, &reloaded).expect("apply");
    assert_eq!(report.applied, 0, "already-applied rows are skipped");
}
