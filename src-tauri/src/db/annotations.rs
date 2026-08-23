use rusqlite::{params, Connection, Row};

use super::models::{Annotation, AnnotationInput};
use super::{new_id, now_ms};
use crate::error::AppResult;

const SELECT: &str = "SELECT id, book_id, kind, location, location_end, page, chapter, text, note,
        color, created_at, updated_at FROM annotations";

fn row_to_annotation(row: &Row) -> rusqlite::Result<Annotation> {
    Ok(Annotation {
        id: row.get(0)?,
        book_id: row.get(1)?,
        kind: row.get(2)?,
        location: row.get(3)?,
        location_end: row.get(4)?,
        page: row.get(5)?,
        chapter: row.get(6)?,
        text: row.get(7)?,
        note: row.get(8)?,
        color: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

pub fn list_for_book(conn: &Connection, book_id: &str) -> AppResult<Vec<Annotation>> {
    let mut stmt = conn.prepare(&format!(
        "{SELECT} WHERE book_id = ?1 AND deleted_at IS NULL ORDER BY created_at ASC"
    ))?;
    let items = stmt
        .query_map(params![book_id], row_to_annotation)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(items)
}

pub fn list_all(conn: &Connection) -> AppResult<Vec<Annotation>> {
    let mut stmt = conn.prepare(&format!(
        "{SELECT} WHERE deleted_at IS NULL ORDER BY created_at DESC"
    ))?;
    let items = stmt
        .query_map([], row_to_annotation)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(items)
}

/// Insert or update. The frontend sends the same shape either way; an `id` that
/// already exists is an edit (a note added to an existing highlight).
pub fn save(conn: &Connection, input: &AnnotationInput) -> AppResult<Annotation> {
    let now = now_ms();
    let id = input.id.clone().unwrap_or_else(new_id);
    conn.execute(
        "INSERT INTO annotations (id, book_id, kind, location, location_end, page, chapter,
             text, note, color, created_at, updated_at, deleted_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11, NULL)
         ON CONFLICT(id) DO UPDATE SET
             location = ?4, location_end = ?5, page = ?6, chapter = ?7,
             text = ?8, note = ?9, color = ?10, updated_at = ?11, deleted_at = NULL",
        params![
            id,
            input.book_id,
            input.kind,
            input.location,
            input.location_end,
            input.page,
            input.chapter,
            input.text,
            input.note,
            input.color,
            now,
        ],
    )?;
    let mut stmt = conn.prepare(&format!("{SELECT} WHERE id = ?1"))?;
    let saved = stmt.query_row(params![id], row_to_annotation)?;
    Ok(saved)
}

/// Soft delete — the tombstone is what stops a deleted highlight from being
/// resurrected by the next sync from another device.
pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE annotations SET deleted_at = ?2, updated_at = ?2 WHERE id = ?1",
        params![id, now_ms()],
    )?;
    Ok(())
}
