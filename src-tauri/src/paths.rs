use std::path::{Path, PathBuf};

use crate::error::AppResult;

/// Everything Folio owns lives under the platform app-data directory, which is
/// also the only place the asset protocol is allowed to serve from.
pub struct AppPaths {
    pub root: PathBuf,
}

impl AppPaths {
    pub fn new(root: PathBuf) -> AppResult<Self> {
        let paths = AppPaths { root };
        for dir in [paths.books(), paths.covers(), paths.cache()] {
            std::fs::create_dir_all(dir)?;
        }
        Ok(paths)
    }

    pub fn db(&self) -> PathBuf {
        self.root.join("library.db")
    }

    pub fn books(&self) -> PathBuf {
        self.root.join("books")
    }

    pub fn covers(&self) -> PathBuf {
        self.root.join("covers")
    }

    pub fn cache(&self) -> PathBuf {
        self.root.join("cache")
    }

    pub fn book_file(&self, file_name: &str) -> PathBuf {
        self.books().join(file_name)
    }

    pub fn cover_file(&self, file_name: &str) -> PathBuf {
        self.covers().join(file_name)
    }

    /// Per-book scratch space, currently used to unpack CBR pages once.
    pub fn book_cache(&self, book_id: &str) -> PathBuf {
        self.cache().join(book_id)
    }
}

/// Best-effort removal: a missing file is a success, not an error, so deleting
/// a book whose file was already moved away still cleans up the database.
pub fn remove_if_present(path: &Path) {
    let _ = std::fs::remove_file(path);
}
