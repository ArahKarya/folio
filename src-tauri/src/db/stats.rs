use rusqlite::{params, Connection};
use std::collections::BTreeMap;

use super::models::{BookTime, DailyStat, LibraryStats};
use super::{day_key, new_id, now_ms};
use crate::error::AppResult;

/// Reading time is banked in chunks by the reader shell, so closing the app
/// mid-chapter never loses more than one interval of tracked time.
pub fn record_session(conn: &Connection, book_id: &str, seconds: i64) -> AppResult<()> {
    if seconds <= 0 {
        return Ok(());
    }
    let now = now_ms();
    conn.execute(
        "INSERT INTO reading_sessions (id, book_id, started_at, seconds, day)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![new_id(), book_id, now - seconds * 1000, seconds, day_key(now)],
    )?;
    Ok(())
}

/// 53 weeks, so the calendar heatmap always has whole columns to draw.
const HISTORY_DAYS: i64 = 371;

/// Books listed in the "most time spent" breakdown.
const TOP_BOOKS: i64 = 10;

pub fn library_stats(conn: &Connection) -> AppResult<LibraryStats> {
    let total_books: i64 = conn.query_row("SELECT COUNT(*) FROM books", [], |r| r.get(0))?;
    let finished_books: i64 = conn.query_row(
        "SELECT COUNT(*) FROM books WHERE finished_at IS NOT NULL",
        [],
        |r| r.get(0),
    )?;
    let favorite_books: i64 =
        conn.query_row("SELECT COUNT(*) FROM books WHERE favorite = 1", [], |r| {
            r.get(0)
        })?;
    let reading_books: i64 = conn.query_row(
        "SELECT COUNT(*) FROM progress p JOIN books b ON b.id = p.book_id
          WHERE p.percent > 0.0 AND p.percent < 1.0 AND b.finished_at IS NULL",
        [],
        |r| r.get(0),
    )?;
    let seconds_total: i64 = conn.query_row(
        "SELECT COALESCE(SUM(seconds), 0) FROM reading_sessions",
        [],
        |r| r.get(0),
    )?;

    let now = now_ms();
    let today = now.div_euclid(86_400_000);
    let mut totals: BTreeMap<String, i64> = BTreeMap::new();
    let mut stmt = conn.prepare(
        "SELECT day, SUM(seconds) FROM reading_sessions WHERE day >= ?1 GROUP BY day",
    )?;
    let oldest = day_key((today - HISTORY_DAYS) * 86_400_000);
    let rows = stmt.query_map(params![oldest], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
    })?;
    for row in rows {
        let (day, seconds) = row?;
        totals.insert(day, seconds);
    }

    // Emit an entry for every day in the window, zeros included, so the chart
    // shows gaps instead of silently compressing them away.
    let mut daily = Vec::with_capacity(HISTORY_DAYS as usize);
    let mut seconds_this_week = 0;
    let mut seconds_today = 0;
    for offset in (0..HISTORY_DAYS).rev() {
        let key = day_key((today - offset) * 86_400_000);
        let seconds = totals.get(&key).copied().unwrap_or(0);
        if offset < 7 {
            seconds_this_week += seconds;
        }
        if offset == 0 {
            seconds_today = seconds;
        }
        daily.push(DailyStat { day: key, seconds });
    }

    // A streak survives "not yet read today"; it only breaks on a missed day
    // that has already ended.
    let mut streak_days = 0;
    for offset in 0..HISTORY_DAYS {
        let key = day_key((today - offset) * 86_400_000);
        let read = totals.get(&key).copied().unwrap_or(0) > 0;
        if read {
            streak_days += 1;
        } else if offset > 0 {
            break;
        }
    }

    // Longest run of consecutive read days anywhere in the window.
    let mut longest_streak = 0;
    let mut run = 0;
    for day in &daily {
        if day.seconds > 0 {
            run += 1;
            longest_streak = longest_streak.max(run);
        } else {
            run = 0;
        }
    }

    let mut stmt = conn.prepare(
        "SELECT book_id, SUM(seconds) AS total FROM reading_sessions
          GROUP BY book_id ORDER BY total DESC LIMIT ?1",
    )?;
    let per_book = stmt
        .query_map(params![TOP_BOOKS], |r| {
            Ok(BookTime {
                book_id: r.get(0)?,
                seconds: r.get(1)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(LibraryStats {
        total_books,
        finished_books,
        reading_books,
        favorite_books,
        seconds_total,
        seconds_this_week,
        seconds_today,
        streak_days,
        longest_streak,
        daily,
        per_book,
    })
}
