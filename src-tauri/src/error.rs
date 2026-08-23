use serde::{Serialize, Serializer};

/// Every command returns this. The frontend only ever sees the `Display`
/// string, so messages are written for a reader, not for a stack trace.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Message(String),

    #[error("This file format is not supported yet: {0}")]
    UnsupportedFormat(String),

    #[error("Book not found in the library")]
    BookMissing,

    #[error("Could not read the book file: {0}")]
    Io(#[from] std::io::Error),

    #[error("The library database failed: {0}")]
    Db(#[from] rusqlite::Error),

    #[error("This archive could not be opened: {0}")]
    Archive(#[from] zip::result::ZipError),

    #[error("Sync data could not be read or written: {0}")]
    Json(#[from] serde_json::Error),

    #[error("{0}")]
    Other(#[from] anyhow::Error),
}

impl AppError {
    pub fn msg(text: impl Into<String>) -> Self {
        AppError::Message(text.into())
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
