use std::sync::OnceLock;

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};

static POOL: OnceLock<SqlitePool> = OnceLock::new();

pub async fn init(app: &AppHandle) -> AppResult<SqlitePool> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Other(format!("app_data_dir: {e}")))?;
    std::fs::create_dir_all(&dir)?;

    let db_path = dir.join("claw.db");
    let url = format!("sqlite://{}?mode=rwc", db_path.display());

    let opts: SqliteConnectOptions = url
        .parse::<SqliteConnectOptions>()
        .map_err(|e| AppError::Other(format!("sqlite url: {e}")))?
        .create_if_missing(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .busy_timeout(std::time::Duration::from_secs(5));

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(opts)
        .await?;

    POOL.set(pool.clone())
        .map_err(|_| AppError::Other("db pool already initialized".into()))?;

    Ok(pool)
}

pub fn pool() -> AppResult<SqlitePool> {
    POOL.get().cloned().ok_or_else(|| AppError::Other("db pool not ready".into()))
}
