use rusqlite::{params, Connection, OptionalExtension};
use std::collections::BTreeMap;

use super::now_ms;
use crate::error::AppResult;

/// Settings live in SQLite rather than localStorage for two reasons: they
/// survive a webview data reset, and folder sync can carry them to other
/// devices alongside progress and highlights.
pub fn all(conn: &Connection) -> AppResult<BTreeMap<String, String>> {
    let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
    let mut out = BTreeMap::new();
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
    for row in rows {
        let (key, value) = row?;
        out.insert(key, value);
    }
    Ok(out)
}

pub fn get(conn: &Connection, key: &str) -> AppResult<Option<String>> {
    Ok(conn
        .query_row("SELECT value FROM settings WHERE key = ?1", params![key], |r| {
            r.get(0)
        })
        .optional()?)
}

pub fn set(conn: &Connection, key: &str, value: &str) -> AppResult<()> {
    conn.execute(
        "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3",
        params![key, value, now_ms()],
    )?;
    Ok(())
}

pub fn updated_at(conn: &Connection, key: &str) -> AppResult<i64> {
    Ok(conn
        .query_row(
            "SELECT updated_at FROM settings WHERE key = ?1",
            params![key],
            |r| r.get(0),
        )
        .optional()?
        .unwrap_or(0))
}
