use rusqlite::{params, Connection};

use super::models::Collection;
use super::{new_id, now_ms};
use crate::error::AppResult;

pub fn list(conn: &Connection) -> AppResult<Vec<Collection>> {
    let mut stmt = conn.prepare(
        "SELECT c.id, c.name, c.created_at, c.updated_at,
                (SELECT COUNT(*) FROM book_collections bc
                  WHERE bc.collection_id = c.id AND bc.deleted_at IS NULL)
           FROM collections c WHERE c.deleted_at IS NULL ORDER BY c.name COLLATE NOCASE",
    )?;
    let items = stmt
        .query_map([], |r| {
            Ok(Collection {
                id: r.get(0)?,
                name: r.get(1)?,
                created_at: r.get(2)?,
                updated_at: r.get(3)?,
                book_count: r.get(4)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(items)
}

pub fn create(conn: &Connection, name: &str) -> AppResult<String> {
    let id = new_id();
    let now = now_ms();
    conn.execute(
        "INSERT INTO collections (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
        params![id, name.trim(), now],
    )?;
    Ok(id)
}

pub fn rename(conn: &Connection, id: &str, name: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE collections SET name = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, name.trim(), now_ms()],
    )?;
    Ok(())
}

pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    let now = now_ms();
    conn.execute(
        "UPDATE collections SET deleted_at = ?2, updated_at = ?2 WHERE id = ?1",
        params![id, now],
    )?;
    conn.execute(
        "UPDATE book_collections SET deleted_at = ?2, updated_at = ?2 WHERE collection_id = ?1",
        params![id, now],
    )?;
    Ok(())
}

pub fn set_membership(
    conn: &Connection,
    book_id: &str,
    collection_id: &str,
    member: bool,
) -> AppResult<()> {
    let now = now_ms();
    let tombstone: Option<i64> = if member { None } else { Some(now) };
    conn.execute(
        "INSERT INTO book_collections (book_id, collection_id, updated_at, deleted_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(book_id, collection_id) DO UPDATE SET updated_at = ?3, deleted_at = ?4",
        params![book_id, collection_id, now, tombstone],
    )?;
    Ok(())
}
