use std::path::PathBuf;
use tauri::ipc::Response;
use tauri::State;

use crate::db::models::{
    Annotation, AnnotationInput, Book, BookEdit, Collection, ImportReport, LibraryStats,
};
use crate::db::{annotations, books, collections, settings, stats, Db};
use crate::error::{AppError, AppResult};
use crate::formats::{comic, mobi, Format, SUPPORTED_EXTENSIONS};
use crate::paths::AppPaths;
use crate::sync::{self, SyncReport};
use crate::{library, util};

/// Key for the sync folder. The `local.` prefix keeps it out of the sync
/// bundle — see `sync::LOCAL_PREFIX`.
const SYNC_FOLDER_KEY: &str = "local.syncFolder";

// ---------------------------------------------------------------- library ---

#[tauri::command]
pub fn list_books(db: State<Db>) -> AppResult<Vec<Book>> {
    books::list(&db.0.lock())
}

#[tauri::command]
pub fn get_book(db: State<Db>, id: String) -> AppResult<Book> {
    books::get(&db.0.lock(), &id)
}

#[tauri::command]
pub fn import_files(
    db: State<Db>,
    paths: State<AppPaths>,
    files: Vec<String>,
) -> AppResult<ImportReport> {
    let sources: Vec<PathBuf> = files.into_iter().map(PathBuf::from).collect();
    Ok(library::import_many(&db.0.lock(), &paths, &sources))
}

#[tauri::command]
pub fn import_folder(
    db: State<Db>,
    paths: State<AppPaths>,
    folder: String,
) -> AppResult<ImportReport> {
    let sources = library::scan_folder(&PathBuf::from(folder));
    Ok(library::import_many(&db.0.lock(), &paths, &sources))
}

#[tauri::command]
pub fn delete_book(db: State<Db>, paths: State<AppPaths>, id: String) -> AppResult<()> {
    library::delete_book(&db.0.lock(), &paths, &id)
}

#[tauri::command]
pub fn update_book(db: State<Db>, id: String, edit: BookEdit) -> AppResult<Book> {
    books::update_metadata(&db.0.lock(), &id, &edit)
}

#[tauri::command]
pub fn set_progress(
    db: State<Db>,
    id: String,
    percent: f64,
    location: Option<String>,
) -> AppResult<()> {
    books::set_progress(&db.0.lock(), &id, percent, location.as_deref())
}

#[tauri::command]
pub fn set_finished(db: State<Db>, id: String, finished: bool) -> AppResult<Book> {
    books::set_finished(&db.0.lock(), &id, finished)
}

#[tauri::command]
pub fn open_book(db: State<Db>, id: String) -> AppResult<Book> {
    let conn = db.0.lock();
    books::touch_opened(&conn, &id)?;
    books::get(&conn, &id)
}

#[tauri::command]
pub fn set_page_count(db: State<Db>, id: String, pages: i64) -> AppResult<()> {
    books::set_page_count(&db.0.lock(), &id, pages)
}

/// The webview renders page one of a PDF and hands the bitmap back here, which
/// is the only way to get a real cover for a format Rust cannot rasterise.
#[tauri::command]
pub fn set_book_cover(
    db: State<Db>,
    paths: State<AppPaths>,
    id: String,
    data: String,
) -> AppResult<String> {
    let bytes = util::decode(&data)?;
    let file_name = library::write_cover(&paths, &id, &bytes, "png")?;
    books::set_cover(&db.0.lock(), &id, Some(&file_name))?;
    Ok(file_name)
}

#[tauri::command]
pub fn supported_extensions() -> Vec<&'static str> {
    SUPPORTED_EXTENSIONS.to_vec()
}

// ----------------------------------------------------------------- assets ---

/// Absolute path for `convertFileSrc`. EPUB and PDF are streamed by the asset
/// protocol rather than pushed through IPC, so a 400 MB PDF never gets copied
/// into a JavaScript array.
#[tauri::command]
pub fn book_file_path(db: State<Db>, paths: State<AppPaths>, id: String) -> AppResult<String> {
    let (path, _) = library::book_path(&db.0.lock(), &paths, &id)?;
    Ok(path.to_string_lossy().into_owned())
}

/// The covers directory, fetched once so a 500-book shelf builds its image
/// URLs in the frontend instead of making 500 round-trips.
#[tauri::command]
pub fn covers_dir(paths: State<AppPaths>) -> AppResult<String> {
    Ok(paths.covers().to_string_lossy().into_owned())
}

// ----------------------------------------------------------------- comics ---

#[tauri::command]
pub fn comic_page_count(db: State<Db>, paths: State<AppPaths>, id: String) -> AppResult<usize> {
    let (path, format) = library::book_path(&db.0.lock(), &paths, &id)?;
    if format != Format::Comic {
        return Err(AppError::msg("This book is not a comic archive."));
    }
    Ok(comic::pages(&path)?.len())
}

/// Returns raw image bytes. `Response` keeps this a binary IPC payload, so the
/// frontend receives an ArrayBuffer instead of a JSON array of numbers.
#[tauri::command]
pub fn comic_page(
    db: State<Db>,
    paths: State<AppPaths>,
    id: String,
    index: usize,
) -> AppResult<Response> {
    let (path, format) = {
        let conn = db.0.lock();
        library::book_path(&conn, &paths, &id)?
    };
    if format != Format::Comic {
        return Err(AppError::msg("This book is not a comic archive."));
    }
    let bytes = comic::read_page(&path, index, &paths.book_cache(&id))?;
    Ok(Response::new(bytes))
}

// ------------------------------------------------------------------- mobi ---

#[tauri::command]
pub fn document_html(db: State<Db>, paths: State<AppPaths>, id: String) -> AppResult<String> {
    let (path, format) = library::book_path(&db.0.lock(), &paths, &id)?;
    if format != Format::Mobi {
        return Err(AppError::msg("This book is not a MOBI document."));
    }
    mobi::content_html(&path)
}

// ------------------------------------------------------------ annotations ---

#[tauri::command]
pub fn list_annotations(db: State<Db>, book_id: String) -> AppResult<Vec<Annotation>> {
    annotations::list_for_book(&db.0.lock(), &book_id)
}

#[tauri::command]
pub fn list_all_annotations(db: State<Db>) -> AppResult<Vec<Annotation>> {
    annotations::list_all(&db.0.lock())
}

#[tauri::command]
pub fn save_annotation(db: State<Db>, input: AnnotationInput) -> AppResult<Annotation> {
    annotations::save(&db.0.lock(), &input)
}

#[tauri::command]
pub fn delete_annotation(db: State<Db>, id: String) -> AppResult<()> {
    annotations::delete(&db.0.lock(), &id)
}

/// Notes as Markdown, ready to drop into a note-taking app.
#[tauri::command]
pub fn export_annotations_markdown(db: State<Db>, book_id: String) -> AppResult<String> {
    let conn = db.0.lock();
    let book = books::get(&conn, &book_id)?;
    let items = annotations::list_for_book(&conn, &book_id)?;

    let mut out = format!("# {}\n\n", book.title);
    if let Some(author) = &book.author {
        out.push_str(&format!("*{author}*\n\n"));
    }
    if items.is_empty() {
        out.push_str("_No highlights or notes yet._\n");
        return Ok(out);
    }

    let mut chapter = String::new();
    for item in items {
        let heading = item.chapter.clone().unwrap_or_default();
        if heading != chapter {
            chapter = heading;
            if !chapter.is_empty() {
                out.push_str(&format!("## {chapter}\n\n"));
            }
        }
        match item.kind.as_str() {
            "bookmark" => {
                let page = item
                    .page
                    .map(|p| format!("page {p}"))
                    .unwrap_or_else(|| "bookmark".into());
                out.push_str(&format!("- 🔖 {page}\n\n"));
            }
            _ => {
                if let Some(text) = item.text.filter(|t| !t.trim().is_empty()) {
                    for line in text.trim().lines() {
                        out.push_str(&format!("> {}\n", line.trim()));
                    }
                    out.push('\n');
                }
                if let Some(note) = item.note.filter(|n| !n.trim().is_empty()) {
                    out.push_str(&format!("{}\n\n", note.trim()));
                }
            }
        }
    }
    Ok(out)
}

// ------------------------------------------------------------ collections ---

#[tauri::command]
pub fn list_collections(db: State<Db>) -> AppResult<Vec<Collection>> {
    collections::list(&db.0.lock())
}

#[tauri::command]
pub fn create_collection(db: State<Db>, name: String) -> AppResult<String> {
    if name.trim().is_empty() {
        return Err(AppError::msg("A collection needs a name."));
    }
    collections::create(&db.0.lock(), &name)
}

#[tauri::command]
pub fn rename_collection(db: State<Db>, id: String, name: String) -> AppResult<()> {
    collections::rename(&db.0.lock(), &id, &name)
}

#[tauri::command]
pub fn delete_collection(db: State<Db>, id: String) -> AppResult<()> {
    collections::delete(&db.0.lock(), &id)
}

#[tauri::command]
pub fn set_collection_membership(
    db: State<Db>,
    book_id: String,
    collection_id: String,
    member: bool,
) -> AppResult<()> {
    collections::set_membership(&db.0.lock(), &book_id, &collection_id, member)
}

// --------------------------------------------------------------- settings ---

#[tauri::command]
pub fn get_settings(db: State<Db>) -> AppResult<std::collections::BTreeMap<String, String>> {
    settings::all(&db.0.lock())
}

#[tauri::command]
pub fn set_setting(db: State<Db>, key: String, value: String) -> AppResult<()> {
    settings::set(&db.0.lock(), &key, &value)
}

// ------------------------------------------------------------------ stats ---

#[tauri::command]
pub fn record_reading(db: State<Db>, book_id: String, seconds: i64) -> AppResult<()> {
    stats::record_session(&db.0.lock(), &book_id, seconds)
}

#[tauri::command]
pub fn get_stats(db: State<Db>) -> AppResult<LibraryStats> {
    stats::library_stats(&db.0.lock())
}

// ------------------------------------------------------------------- sync ---

#[tauri::command]
pub fn get_sync_folder(db: State<Db>) -> AppResult<Option<String>> {
    settings::get(&db.0.lock(), SYNC_FOLDER_KEY)
}

#[tauri::command]
pub fn set_sync_folder(db: State<Db>, folder: Option<String>) -> AppResult<()> {
    let conn = db.0.lock();
    settings::set(&conn, SYNC_FOLDER_KEY, folder.as_deref().unwrap_or(""))
}

#[tauri::command]
pub fn sync_now(db: State<Db>) -> AppResult<SyncReport> {
    let conn = db.0.lock();
    let folder = settings::get(&conn, SYNC_FOLDER_KEY)?.filter(|f| !f.is_empty());
    let folder = folder.ok_or_else(|| {
        AppError::msg("Choose a sync folder first — any folder your devices already share.")
    })?;
    sync::sync(&conn, &PathBuf::from(folder))
}

/// Manual escape hatch: the same bundle the sync folder holds, written wherever
/// the reader points the save dialog.
#[tauri::command]
pub fn export_sync_bundle(db: State<Db>, file: String) -> AppResult<()> {
    let bundle = sync::export(&db.0.lock())?;
    std::fs::write(file, serde_json::to_vec_pretty(&bundle)?)?;
    Ok(())
}

#[tauri::command]
pub fn import_sync_bundle(db: State<Db>, file: String) -> AppResult<SyncReport> {
    let bytes = std::fs::read(file)?;
    let bundle: sync::Bundle = serde_json::from_slice(&bytes)?;
    sync::apply(&db.0.lock(), &bundle)
}
