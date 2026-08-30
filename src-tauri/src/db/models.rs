use serde::{Deserialize, Serialize};

/// A book as the library screen needs it: catalogue metadata plus the reading
/// position, denormalised so the grid renders from a single query.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Book {
    pub id: String,
    pub title: String,
    pub author: Option<String>,
    pub format: String,
    pub file_name: String,
    pub file_size: i64,
    pub hash: String,
    pub language: Option<String>,
    pub publisher: Option<String>,
    pub description: Option<String>,
    pub series: Option<String>,
    pub series_index: Option<f64>,
    pub cover: Option<String>,
    pub page_count: Option<i64>,
    pub added_at: i64,
    pub last_opened_at: Option<i64>,
    pub finished_at: Option<i64>,
    pub favorite: bool,
    pub updated_at: i64,
    /// 0.0 – 1.0
    pub progress: f64,
    /// Format-specific resume token: an EPUB CFI, a PDF/comic page number.
    pub location: Option<String>,
    pub collections: Vec<String>,
}

/// Catalogue fields a reader is allowed to correct by hand.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookEdit {
    pub title: String,
    pub author: Option<String>,
    pub series: Option<String>,
    pub series_index: Option<f64>,
    pub publisher: Option<String>,
    pub language: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Annotation {
    pub id: String,
    pub book_id: String,
    /// `highlight` | `note` | `bookmark`
    pub kind: String,
    pub location: String,
    pub location_end: Option<String>,
    pub page: Option<i64>,
    pub chapter: Option<String>,
    pub text: Option<String>,
    pub note: Option<String>,
    pub color: Option<String>,
    /// Format-specific payload as JSON — currently the normalised rectangles
    /// that let a PDF highlight be redrawn at any zoom level.
    pub data: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationInput {
    pub id: Option<String>,
    pub book_id: String,
    pub kind: String,
    pub location: String,
    pub location_end: Option<String>,
    pub page: Option<i64>,
    pub chapter: Option<String>,
    pub text: Option<String>,
    pub note: Option<String>,
    pub color: Option<String>,
    pub data: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub id: String,
    pub name: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub book_count: i64,
}

/// One continuous stretch of reading, used by the stats screen.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyStat {
    pub day: String,
    pub seconds: i64,
}

/// Time spent in one book, for the stats breakdown.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookTime {
    pub book_id: String,
    pub seconds: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryStats {
    pub total_books: i64,
    pub finished_books: i64,
    pub reading_books: i64,
    pub favorite_books: i64,
    pub seconds_total: i64,
    pub seconds_this_week: i64,
    pub seconds_today: i64,
    pub streak_days: i64,
    pub longest_streak: i64,
    pub daily: Vec<DailyStat>,
    pub per_book: Vec<BookTime>,
}

/// Result of an import run; partial failures are reported rather than thrown so
/// one broken file never aborts a 200-book folder scan.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    pub imported: Vec<Book>,
    pub duplicates: Vec<String>,
    pub failures: Vec<ImportFailure>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportFailure {
    pub file: String,
    pub reason: String,
}
