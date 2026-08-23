use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

use crate::db::books;
use crate::error::AppResult;

pub const BUNDLE_NAME: &str = "folio-sync.json";

/// Settings under this prefix stay on the device that set them — the sync
/// folder path itself is the obvious example, and syncing it would send every
/// device looking in a folder that only exists on one of them.
const LOCAL_PREFIX: &str = "local.";

/// The on-disk sync document. Book files are deliberately absent: only the
/// reading state travels, so a cloud folder stays small no matter how large the
/// library is.
#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bundle {
    pub version: u32,
    #[serde(default)]
    pub progress: Vec<ProgressRow>,
    #[serde(default)]
    pub annotations: Vec<AnnotationRow>,
    #[serde(default)]
    pub collections: Vec<CollectionRow>,
    #[serde(default)]
    pub memberships: Vec<MembershipRow>,
    #[serde(default)]
    pub settings: Vec<SettingRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressRow {
    pub book_id: String,
    pub percent: f64,
    pub location: Option<String>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationRow {
    pub id: String,
    pub book_id: String,
    pub kind: String,
    pub location: String,
    pub location_end: Option<String>,
    pub page: Option<i64>,
    pub chapter: Option<String>,
    pub text: Option<String>,
    pub note: Option<String>,
    pub color: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionRow {
    pub id: String,
    pub name: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MembershipRow {
    pub book_id: String,
    pub collection_id: String,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingRow {
    pub key: String,
    pub value: String,
    pub updated_at: i64,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncReport {
    pub applied: usize,
    pub skipped_unknown_books: usize,
    pub sent: usize,
    pub path: String,
}

/// One sync pass: pull what is newer from the folder, then publish the merged
/// state back. Conflicts resolve last-write-wins per row, which is the right
/// trade for reading state — the newest bookmark is the one you want.
pub fn sync(conn: &Connection, folder: &Path) -> AppResult<SyncReport> {
    std::fs::create_dir_all(folder)?;
    let file = folder.join(BUNDLE_NAME);
    let remote: Bundle = match std::fs::read(&file) {
        Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
        Err(_) => Bundle::default(),
    };

    let mut report = apply(conn, &remote)?;
    let local = export(conn)?;
    let merged = merge(local, remote);
    report.sent = merged.progress.len() + merged.annotations.len();
    report.path = file.to_string_lossy().into_owned();

    // Write to a sibling file first: a cloud client that syncs mid-write must
    // never see a half-serialised bundle.
    let temp = folder.join(format!("{BUNDLE_NAME}.tmp"));
    std::fs::write(&temp, serde_json::to_vec_pretty(&merged)?)?;
    std::fs::rename(&temp, &file)?;
    Ok(report)
}

pub fn export(conn: &Connection) -> AppResult<Bundle> {
    let mut progress = Vec::new();
    {
        let mut stmt =
            conn.prepare("SELECT book_id, percent, location, updated_at FROM progress")?;
        let rows = stmt.query_map([], |r| {
            Ok(ProgressRow {
                book_id: r.get(0)?,
                percent: r.get(1)?,
                location: r.get(2)?,
                updated_at: r.get(3)?,
            })
        })?;
        for row in rows {
            progress.push(row?);
        }
    }

    let mut annotations = Vec::new();
    {
        let mut stmt = conn.prepare(
            "SELECT id, book_id, kind, location, location_end, page, chapter, text, note, color,
                    created_at, updated_at, deleted_at FROM annotations",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(AnnotationRow {
                id: r.get(0)?,
                book_id: r.get(1)?,
                kind: r.get(2)?,
                location: r.get(3)?,
                location_end: r.get(4)?,
                page: r.get(5)?,
                chapter: r.get(6)?,
                text: r.get(7)?,
                note: r.get(8)?,
                color: r.get(9)?,
                created_at: r.get(10)?,
                updated_at: r.get(11)?,
                deleted_at: r.get(12)?,
            })
        })?;
        for row in rows {
            annotations.push(row?);
        }
    }

    let mut collections = Vec::new();
    {
        let mut stmt =
            conn.prepare("SELECT id, name, created_at, updated_at, deleted_at FROM collections")?;
        let rows = stmt.query_map([], |r| {
            Ok(CollectionRow {
                id: r.get(0)?,
                name: r.get(1)?,
                created_at: r.get(2)?,
                updated_at: r.get(3)?,
                deleted_at: r.get(4)?,
            })
        })?;
        for row in rows {
            collections.push(row?);
        }
    }

    let mut memberships = Vec::new();
    {
        let mut stmt = conn.prepare(
            "SELECT book_id, collection_id, updated_at, deleted_at FROM book_collections",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(MembershipRow {
                book_id: r.get(0)?,
                collection_id: r.get(1)?,
                updated_at: r.get(2)?,
                deleted_at: r.get(3)?,
            })
        })?;
        for row in rows {
            memberships.push(row?);
        }
    }

    let mut settings = Vec::new();
    {
        let mut stmt = conn.prepare("SELECT key, value, updated_at FROM settings")?;
        let rows = stmt.query_map([], |r| {
            Ok(SettingRow {
                key: r.get(0)?,
                value: r.get(1)?,
                updated_at: r.get(2)?,
            })
        })?;
        for row in rows {
            let row = row?;
            if !row.key.starts_with(LOCAL_PREFIX) {
                settings.push(row);
            }
        }
    }

    Ok(Bundle {
        version: 1,
        progress,
        annotations,
        collections,
        memberships,
        settings,
    })
}

/// Writes rows from a bundle into the database when they are newer than what is
/// already there. Rows about books this device does not have are counted and
/// left alone — they survive in the bundle for the device that owns them.
pub fn apply(conn: &Connection, bundle: &Bundle) -> AppResult<SyncReport> {
    let mut report = SyncReport::default();
    let mut known: HashMap<String, bool> = HashMap::new();
    let mut has_book = |id: &str| -> bool {
        if let Some(known) = known.get(id) {
            return *known;
        }
        let exists = books::exists(conn, id).unwrap_or(false);
        known.insert(id.to_string(), exists);
        exists
    };

    for row in &bundle.progress {
        if !has_book(&row.book_id) {
            report.skipped_unknown_books += 1;
            continue;
        }
        let local: Option<i64> = conn
            .query_row(
                "SELECT updated_at FROM progress WHERE book_id = ?1",
                params![row.book_id],
                |r| r.get(0),
            )
            .optional()?;
        if local.unwrap_or(0) < row.updated_at {
            conn.execute(
                "INSERT INTO progress (book_id, percent, location, updated_at)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(book_id) DO UPDATE SET percent = ?2, location = ?3, updated_at = ?4",
                params![row.book_id, row.percent, row.location, row.updated_at],
            )?;
            report.applied += 1;
        }
    }

    for row in &bundle.annotations {
        if !has_book(&row.book_id) {
            report.skipped_unknown_books += 1;
            continue;
        }
        let local: Option<i64> = conn
            .query_row(
                "SELECT updated_at FROM annotations WHERE id = ?1",
                params![row.id],
                |r| r.get(0),
            )
            .optional()?;
        if local.unwrap_or(0) < row.updated_at {
            conn.execute(
                "INSERT INTO annotations (id, book_id, kind, location, location_end, page, chapter,
                     text, note, color, created_at, updated_at, deleted_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
                 ON CONFLICT(id) DO UPDATE SET location = ?4, location_end = ?5, page = ?6,
                     chapter = ?7, text = ?8, note = ?9, color = ?10, updated_at = ?12,
                     deleted_at = ?13",
                params![
                    row.id,
                    row.book_id,
                    row.kind,
                    row.location,
                    row.location_end,
                    row.page,
                    row.chapter,
                    row.text,
                    row.note,
                    row.color,
                    row.created_at,
                    row.updated_at,
                    row.deleted_at,
                ],
            )?;
            report.applied += 1;
        }
    }

    for row in &bundle.collections {
        let local: Option<i64> = conn
            .query_row(
                "SELECT updated_at FROM collections WHERE id = ?1",
                params![row.id],
                |r| r.get(0),
            )
            .optional()?;
        if local.unwrap_or(0) < row.updated_at {
            conn.execute(
                "INSERT INTO collections (id, name, created_at, updated_at, deleted_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT(id) DO UPDATE SET name = ?2, updated_at = ?4, deleted_at = ?5",
                params![row.id, row.name, row.created_at, row.updated_at, row.deleted_at],
            )?;
            report.applied += 1;
        }
    }

    for row in &bundle.memberships {
        if !has_book(&row.book_id) {
            report.skipped_unknown_books += 1;
            continue;
        }
        let local: Option<i64> = conn
            .query_row(
                "SELECT updated_at FROM book_collections WHERE book_id = ?1 AND collection_id = ?2",
                params![row.book_id, row.collection_id],
                |r| r.get(0),
            )
            .optional()?;
        if local.unwrap_or(0) < row.updated_at {
            conn.execute(
                "INSERT INTO book_collections (book_id, collection_id, updated_at, deleted_at)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(book_id, collection_id) DO UPDATE SET updated_at = ?3, deleted_at = ?4",
                params![row.book_id, row.collection_id, row.updated_at, row.deleted_at],
            )?;
            report.applied += 1;
        }
    }

    for row in &bundle.settings {
        if row.key.starts_with(LOCAL_PREFIX) {
            continue;
        }
        let local = crate::db::settings::updated_at(conn, &row.key)?;
        if local < row.updated_at {
            conn.execute(
                "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
                 ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3",
                params![row.key, row.value, row.updated_at],
            )?;
            report.applied += 1;
        }
    }

    Ok(report)
}

/// Union of two bundles, newest row wins. Rows only the remote knows about are
/// carried forward untouched so a device that owns a book keeps its state even
/// while syncing through a device that does not.
fn merge(local: Bundle, remote: Bundle) -> Bundle {
    fn combine<T, K, F>(local: Vec<T>, remote: Vec<T>, key: F, stamp: fn(&T) -> i64) -> Vec<T>
    where
        K: std::hash::Hash + Eq,
        F: Fn(&T) -> K,
    {
        let mut map: HashMap<K, T> = HashMap::new();
        for item in local.into_iter().chain(remote) {
            let k = key(&item);
            match map.get(&k) {
                Some(existing) if stamp(existing) >= stamp(&item) => {}
                _ => {
                    map.insert(k, item);
                }
            }
        }
        map.into_values().collect()
    }

    Bundle {
        version: 1,
        progress: combine(
            local.progress,
            remote.progress,
            |r| r.book_id.clone(),
            |r| r.updated_at,
        ),
        annotations: combine(
            local.annotations,
            remote.annotations,
            |r| r.id.clone(),
            |r| r.updated_at,
        ),
        collections: combine(
            local.collections,
            remote.collections,
            |r| r.id.clone(),
            |r| r.updated_at,
        ),
        memberships: combine(
            local.memberships,
            remote.memberships,
            |r| (r.book_id.clone(), r.collection_id.clone()),
            |r| r.updated_at,
        ),
        settings: combine(
            local.settings,
            remote.settings,
            |r| r.key.clone(),
            |r| r.updated_at,
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn progress(book: &str, percent: f64, at: i64) -> ProgressRow {
        ProgressRow {
            book_id: book.into(),
            percent,
            location: None,
            updated_at: at,
        }
    }

    #[test]
    fn newest_row_wins_and_unknown_rows_survive() {
        let local = Bundle {
            version: 1,
            progress: vec![progress("a", 0.2, 100), progress("b", 0.9, 500)],
            ..Default::default()
        };
        let remote = Bundle {
            version: 1,
            progress: vec![progress("a", 0.7, 300), progress("c", 0.1, 50)],
            ..Default::default()
        };
        let merged = merge(local, remote);
        let by_id: HashMap<_, _> = merged
            .progress
            .iter()
            .map(|r| (r.book_id.as_str(), r))
            .collect();
        assert_eq!(by_id["a"].percent, 0.7, "remote is newer for a");
        assert_eq!(by_id["b"].percent, 0.9, "local-only row is kept");
        assert_eq!(by_id["c"].percent, 0.1, "remote-only row is kept");
    }
}
