use rusqlite::{params, Connection, OptionalExtension, Row};
use std::collections::HashMap;

use super::models::{Book, BookEdit};
use super::now_ms;
use crate::error::{AppError, AppResult};

const SELECT: &str = "SELECT b.id, b.title, b.author, b.format, b.file_name, b.file_size, b.hash,
        b.language, b.publisher, b.description, b.series, b.series_index, b.cover, b.page_count,
        b.added_at, b.last_opened_at, b.finished_at, b.updated_at,
        COALESCE(p.percent, 0.0), p.location
   FROM books b LEFT JOIN progress p ON p.book_id = b.id";

fn row_to_book(row: &Row) -> rusqlite::Result<Book> {
    Ok(Book {
        id: row.get(0)?,
        title: row.get(1)?,
        author: row.get(2)?,
        format: row.get(3)?,
        file_name: row.get(4)?,
        file_size: row.get(5)?,
        hash: row.get(6)?,
        language: row.get(7)?,
        publisher: row.get(8)?,
        description: row.get(9)?,
        series: row.get(10)?,
        series_index: row.get(11)?,
        cover: row.get(12)?,
        page_count: row.get(13)?,
        added_at: row.get(14)?,
        last_opened_at: row.get(15)?,
        finished_at: row.get(16)?,
        updated_at: row.get(17)?,
        progress: row.get(18)?,
        location: row.get(19)?,
        collections: Vec::new(),
    })
}

/// Collection membership for every book, in one query, so `list` stays O(1) in
/// round-trips no matter how large the library gets.
fn membership(conn: &Connection) -> AppResult<HashMap<String, Vec<String>>> {
    let mut stmt = conn.prepare(
        "SELECT book_id, collection_id FROM book_collections WHERE deleted_at IS NULL",
    )?;
    let mut map: HashMap<String, Vec<String>> = HashMap::new();
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
    for row in rows {
        let (book, collection) = row?;
        map.entry(book).or_default().push(collection);
    }
    Ok(map)
}

pub fn list(conn: &Connection) -> AppResult<Vec<Book>> {
    let mut stmt = conn.prepare(&format!("{SELECT} ORDER BY b.added_at DESC"))?;
    let mut books: Vec<Book> = stmt
        .query_map([], row_to_book)?
        .collect::<rusqlite::Result<_>>()?;
    let map = membership(conn)?;
    for book in &mut books {
        if let Some(ids) = map.get(&book.id) {
            book.collections = ids.clone();
        }
    }
    Ok(books)
}

pub fn get(conn: &Connection, id: &str) -> AppResult<Book> {
    let mut book = conn
        .prepare(&format!("{SELECT} WHERE b.id = ?1"))?
        .query_row(params![id], row_to_book)
        .optional()?
        .ok_or(AppError::BookMissing)?;
    let mut stmt = conn.prepare(
        "SELECT collection_id FROM book_collections WHERE book_id = ?1 AND deleted_at IS NULL",
    )?;
    book.collections = stmt
        .query_map(params![id], |r| r.get(0))?
        .collect::<rusqlite::Result<_>>()?;
    Ok(book)
}

pub fn exists(conn: &Connection, id: &str) -> AppResult<bool> {
    let found: Option<i64> = conn
        .query_row("SELECT 1 FROM books WHERE id = ?1", params![id], |r| r.get(0))
        .optional()?;
    Ok(found.is_some())
}

#[allow(clippy::too_many_arguments)]
pub fn insert(conn: &Connection, book: &Book) -> AppResult<()> {
    conn.execute(
        "INSERT INTO books (id, title, author, format, file_name, file_size, hash, language,
             publisher, description, series, series_index, cover, page_count, added_at,
             last_opened_at, finished_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, NULL, NULL, ?16)",
        params![
            book.id,
            book.title,
            book.author,
            book.format,
            book.file_name,
            book.file_size,
            book.hash,
            book.language,
            book.publisher,
            book.description,
            book.series,
            book.series_index,
            book.cover,
            book.page_count,
            book.added_at,
            book.updated_at,
        ],
    )?;
    Ok(())
}

pub fn update_metadata(conn: &Connection, id: &str, edit: &BookEdit) -> AppResult<Book> {
    let changed = conn.execute(
        "UPDATE books SET title = ?2, author = ?3, series = ?4, series_index = ?5,
             publisher = ?6, language = ?7, description = ?8, updated_at = ?9
         WHERE id = ?1",
        params![
            id,
            edit.title,
            edit.author,
            edit.series,
            edit.series_index,
            edit.publisher,
            edit.language,
            edit.description,
            now_ms(),
        ],
    )?;
    if changed == 0 {
        return Err(AppError::BookMissing);
    }
    get(conn, id)
}

pub fn set_cover(conn: &Connection, id: &str, cover: Option<&str>) -> AppResult<()> {
    conn.execute(
        "UPDATE books SET cover = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, cover, now_ms()],
    )?;
    Ok(())
}

pub fn set_page_count(conn: &Connection, id: &str, pages: i64) -> AppResult<()> {
    conn.execute(
        "UPDATE books SET page_count = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, pages, now_ms()],
    )?;
    Ok(())
}

pub fn touch_opened(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE books SET last_opened_at = ?2 WHERE id = ?1",
        params![id, now_ms()],
    )?;
    Ok(())
}

pub fn set_finished(conn: &Connection, id: &str, finished: bool) -> AppResult<Book> {
    let now = now_ms();
    conn.execute(
        "UPDATE books SET finished_at = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, if finished { Some(now) } else { None }, now],
    )?;
    if finished {
        set_progress(conn, id, 1.0, None)?;
    }
    get(conn, id)
}

/// Reading position. `percent` is clamped because epub.js occasionally reports
/// a location slightly past the end of the spine.
pub fn set_progress(
    conn: &Connection,
    id: &str,
    percent: f64,
    location: Option<&str>,
) -> AppResult<()> {
    let percent = percent.clamp(0.0, 1.0);
    conn.execute(
        "INSERT INTO progress (book_id, percent, location, updated_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(book_id) DO UPDATE SET percent = ?2, location = ?3, updated_at = ?4",
        params![id, percent, location, now_ms()],
    )?;
    Ok(())
}

/// Removes the row and reports the on-disk file name so the caller can delete
/// the copied book and its cover.
pub fn delete(conn: &Connection, id: &str) -> AppResult<(String, Option<String>)> {
    let row: Option<(String, Option<String>)> = conn
        .query_row(
            "SELECT file_name, cover FROM books WHERE id = ?1",
            params![id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    let row = row.ok_or(AppError::BookMissing)?;
    conn.execute("DELETE FROM books WHERE id = ?1", params![id])?;
    conn.execute("DELETE FROM annotations WHERE book_id = ?1", params![id])?;
    conn.execute(
        "DELETE FROM book_collections WHERE book_id = ?1",
        params![id],
    )?;
    Ok(row)
}
