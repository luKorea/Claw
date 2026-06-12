mod pool;

pub use pool::pool;

use crate::error::AppResult;

const INIT_SQL: &str = include_str!("migrations/0001_init.sql");

async fn ensure_custom_provider_stream_mode(pool: &sqlx::SqlitePool) -> AppResult<()> {
    let columns = sqlx::query_as::<_, (i64, String, String, i64, Option<String>, i64)>(
        "PRAGMA table_info(custom_providers)",
    )
    .fetch_all(pool)
    .await?;
    if columns.iter().any(|column| column.1 == "stream_mode") {
        return Ok(());
    }

    sqlx::query(
        "ALTER TABLE custom_providers
         ADD COLUMN stream_mode TEXT NOT NULL DEFAULT 'auto'",
    )
    .execute(pool)
    .await?;
    Ok(())
}

async fn ensure_mcp_server_columns(pool: &sqlx::SqlitePool) -> AppResult<()> {
    let columns = sqlx::query_as::<_, (i64, String, String, i64, Option<String>, i64)>(
        "PRAGMA table_info(mcp_servers)",
    )
    .fetch_all(pool)
    .await?;

    if !columns.iter().any(|column| column.1 == "updated_at") {
        sqlx::query(
            "ALTER TABLE mcp_servers
             ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0",
        )
        .execute(pool)
        .await?;
        sqlx::query("UPDATE mcp_servers SET updated_at = created_at WHERE updated_at = 0")
            .execute(pool)
            .await?;
    }

    if !columns.iter().any(|column| column.1 == "last_status") {
        sqlx::query("ALTER TABLE mcp_servers ADD COLUMN last_status TEXT")
            .execute(pool)
            .await?;
    }

    if !columns.iter().any(|column| column.1 == "tools") {
        sqlx::query("ALTER TABLE mcp_servers ADD COLUMN tools TEXT")
            .execute(pool)
            .await?;
    }

    Ok(())
}

pub async fn init_pool(app: &tauri::AppHandle) -> AppResult<()> {
    let pool = pool::init(app).await?;
    sqlx::query(INIT_SQL).execute(&pool).await?;
    ensure_custom_provider_stream_mode(&pool).await?;
    ensure_mcp_server_columns(&pool).await?;
    log::info!("db initialized");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    #[tokio::test]
    async fn adds_stream_mode_to_legacy_custom_provider_table_once() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::query(
            "CREATE TABLE custom_providers (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL
            )",
        )
        .execute(&pool)
        .await
        .unwrap();

        ensure_custom_provider_stream_mode(&pool).await.unwrap();
        ensure_custom_provider_stream_mode(&pool).await.unwrap();

        let columns = sqlx::query_as::<_, (i64, String, String, i64, Option<String>, i64)>(
            "PRAGMA table_info(custom_providers)",
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        let stream_mode = columns
            .iter()
            .find(|column| column.1 == "stream_mode")
            .unwrap();
        assert_eq!(stream_mode.4.as_deref(), Some("'auto'"));
    }

    #[tokio::test]
    async fn adds_mcp_columns_to_legacy_table_once() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::query(
            "CREATE TABLE mcp_servers (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              transport TEXT NOT NULL,
              config TEXT NOT NULL,
              enabled INTEGER NOT NULL DEFAULT 1,
              created_at INTEGER NOT NULL
            )",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO mcp_servers (id, name, transport, config, enabled, created_at)
             VALUES ('mcp_legacy', 'Legacy', 'local-command', '{}', 1, 42)",
        )
        .execute(&pool)
        .await
        .unwrap();

        ensure_mcp_server_columns(&pool).await.unwrap();
        ensure_mcp_server_columns(&pool).await.unwrap();

        let columns = sqlx::query_as::<_, (i64, String, String, i64, Option<String>, i64)>(
            "PRAGMA table_info(mcp_servers)",
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        assert!(columns.iter().any(|column| column.1 == "updated_at"));
        assert!(columns.iter().any(|column| column.1 == "last_status"));
        assert!(columns.iter().any(|column| column.1 == "tools"));

        let updated_at = sqlx::query_as::<_, (i64,)>(
            "SELECT updated_at FROM mcp_servers WHERE id = 'mcp_legacy'",
        )
        .fetch_one(&pool)
        .await
        .unwrap()
        .0;
        assert_eq!(updated_at, 42);
    }
}
