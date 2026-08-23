pub mod annotations;
pub mod books;
pub mod collections;
pub mod models;
pub mod settings;
pub mod stats;

use parking_lot::Mutex;
use rusqlite::Connection;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::AppResult;

/// The library database. One connection behind a mutex: every command is short,
/// and SQLite writes serialise anyway, so a pool would only add moving parts.
pub struct Db(pub Mutex<Connection>);

impl Db {
    pub fn open(path: &Path) -> AppResult<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA foreign_keys = ON;",
        )?;
        migrate(&conn)?;
        Ok(Db(Mutex::new(conn)))
    }
}

const MIGRATIONS: &[&str] = &[
    // v1 — initial schema.
    r#"
    CREATE TABLE books (
        id           TEXT PRIMARY KEY,
        title        TEXT NOT NULL,
        author       TEXT,
        format       TEXT NOT NULL,
        file_name    TEXT NOT NULL,
        file_size    INTEGER NOT NULL DEFAULT 0,
        hash         TEXT NOT NULL,
        language     TEXT,
        publisher    TEXT,
        description  TEXT,
        series       TEXT,
        series_index REAL,
        cover        TEXT,
        page_count   INTEGER,
        added_at     INTEGER NOT NULL,
        last_opened_at INTEGER,
        finished_at  INTEGER,
        updated_at   INTEGER NOT NULL
    );

    CREATE TABLE progress (
        book_id    TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
        percent    REAL NOT NULL DEFAULT 0,
        location   TEXT,
        updated_at INTEGER NOT NULL
    );

    -- deleted_at is a tombstone, not a nicety: folder sync needs to know the
    -- difference between "never seen on this device" and "deleted here".
    CREATE TABLE annotations (
        id           TEXT PRIMARY KEY,
        book_id      TEXT NOT NULL,
        kind         TEXT NOT NULL,
        location     TEXT NOT NULL,
        location_end TEXT,
        page         INTEGER,
        chapter      TEXT,
        text         TEXT,
        note         TEXT,
        color        TEXT,
        created_at   INTEGER NOT NULL,
        updated_at   INTEGER NOT NULL,
        deleted_at   INTEGER
    );
    CREATE INDEX annotations_book ON annotations(book_id, deleted_at);

    CREATE TABLE collections (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
    );

    CREATE TABLE book_collections (
        book_id       TEXT NOT NULL,
        collection_id TEXT NOT NULL,
        updated_at    INTEGER NOT NULL,
        deleted_at    INTEGER,
        PRIMARY KEY (book_id, collection_id)
    );

    CREATE TABLE reading_sessions (
        id         TEXT PRIMARY KEY,
        book_id    TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        seconds    INTEGER NOT NULL,
        day        TEXT NOT NULL
    );
    CREATE INDEX reading_sessions_day ON reading_sessions(day);

    CREATE TABLE settings (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at INTEGER NOT NULL
    );
    "#,
];

fn migrate(conn: &Connection) -> AppResult<()> {
    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    for (index, sql) in MIGRATIONS.iter().enumerate() {
        let target = index as i64 + 1;
        if version < target {
            conn.execute_batch(sql)?;
            conn.execute_batch(&format!("PRAGMA user_version = {target}"))?;
        }
    }
    Ok(())
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

static COUNTER: AtomicU64 = AtomicU64::new(0);

/// Local identifier for rows that are not content-addressed (annotations,
/// collections, sessions). Time-ordered prefix keeps them sortable and makes
/// collisions between two devices practically impossible.
pub fn new_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    let seq = COUNTER.fetch_add(1, Ordering::Relaxed);
    // xorshift the pair so ids do not leak a readable clock.
    let mut x = nanos ^ (seq.wrapping_mul(0x9E37_79B9_7F4A_7C15));
    x ^= x << 13;
    x ^= x >> 7;
    x ^= x << 17;
    format!("{:012x}{:08x}", nanos & 0xFFFF_FFFF_FFFF, x as u32)
}

/// `YYYY-MM-DD` in UTC — the grouping key for reading statistics.
pub fn day_key(ms: i64) -> String {
    let days = ms.div_euclid(86_400_000);
    let (y, m, d) = civil_from_days(days);
    format!("{y:04}-{m:02}-{d:02}")
}

/// Howard Hinnant's days-from-civil, inverted. Avoids pulling in a date crate
/// for the one calendar conversion the app performs.
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 }.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}
