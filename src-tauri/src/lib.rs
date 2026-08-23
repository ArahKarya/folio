mod commands;
// The domain modules are public so the integration tests in `tests/` can drive
// import, reading and sync without going through the Tauri runtime.
pub mod db;
pub mod error;
pub mod formats;
pub mod library;
pub mod paths;
pub mod sync;
pub mod util;

use tauri::Manager;

use db::Db;
use paths::AppPaths;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Books, covers, cache and the database all live under app data —
            // the one directory the asset protocol is scoped to.
            let root = app.path().app_data_dir()?;
            let paths = AppPaths::new(root)?;
            let db = Db::open(&paths.db())?;
            app.manage(db);
            app.manage(paths);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_books,
            commands::get_book,
            commands::import_files,
            commands::import_folder,
            commands::delete_book,
            commands::update_book,
            commands::set_progress,
            commands::set_finished,
            commands::open_book,
            commands::set_page_count,
            commands::set_book_cover,
            commands::supported_extensions,
            commands::book_file_path,
            commands::covers_dir,
            commands::comic_page_count,
            commands::comic_page,
            commands::document_html,
            commands::list_annotations,
            commands::list_all_annotations,
            commands::save_annotation,
            commands::delete_annotation,
            commands::export_annotations_markdown,
            commands::list_collections,
            commands::create_collection,
            commands::rename_collection,
            commands::delete_collection,
            commands::set_collection_membership,
            commands::get_settings,
            commands::set_setting,
            commands::record_reading,
            commands::get_stats,
            commands::get_sync_folder,
            commands::set_sync_folder,
            commands::sync_now,
            commands::export_sync_bundle,
            commands::import_sync_bundle,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Folio");
}
