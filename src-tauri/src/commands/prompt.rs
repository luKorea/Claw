use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use crate::db;
use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct PromptPreset {
    pub id: String,
    pub name: String,
    pub content: String,
    pub builtin: i64,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct NewPromptPreset {
    pub name: String,
    pub content: String,
    pub builtin: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePromptPreset {
    pub id: String,
    pub name: Option<String>,
    pub content: Option<String>,
}

// ============================================================
// 纯函数层(v1.2 Bug 4 强约束补救)— 接受 &SqlitePool,可独立测试
// ============================================================

pub async fn list_all(pool: &SqlitePool) -> AppResult<Vec<PromptPreset>> {
    let rows = sqlx::query_as::<_, PromptPreset>(
        "SELECT id, name, content, builtin, created_at
         FROM prompt_presets ORDER BY builtin DESC, created_at ASC",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn create(
    pool: &SqlitePool,
    id: &str,
    name: &str,
    content: &str,
    builtin: i64,
    created_at: i64,
) -> AppResult<PromptPreset> {
    sqlx::query(
        "INSERT INTO prompt_presets (id, name, content, builtin, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
    )
    .bind(id)
    .bind(name)
    .bind(content)
    .bind(builtin)
    .bind(created_at)
    .execute(pool)
    .await?;
    Ok(PromptPreset {
        id: id.to_string(),
        name: name.to_string(),
        content: content.to_string(),
        builtin,
        created_at,
    })
}

pub async fn update_partial(
    pool: &SqlitePool,
    id: &str,
    name: Option<&str>,
    content: Option<&str>,
) -> AppResult<()> {
    if let Some(name) = name {
        sqlx::query("UPDATE prompt_presets SET name = ?1 WHERE id = ?2")
            .bind(name)
            .bind(id)
            .execute(pool)
            .await?;
    }
    if let Some(content) = content {
        sqlx::query("UPDATE prompt_presets SET content = ?1 WHERE id = ?2")
            .bind(content)
            .bind(id)
            .execute(pool)
            .await?;
    }
    Ok(())
}

pub async fn delete(pool: &SqlitePool, id: &str) -> AppResult<()> {
    sqlx::query("DELETE FROM prompt_presets WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

// ============================================================
// Tauri command 包装层 — 内部调纯函数
// ============================================================

#[tauri::command]
pub async fn list_prompt_presets() -> AppResult<Vec<PromptPreset>> {
    let pool = db::pool()?;
    list_all(&pool).await
}

#[tauri::command]
pub async fn create_prompt_preset(input: NewPromptPreset) -> AppResult<PromptPreset> {
    let pool = db::pool()?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    let builtin = if input.builtin.unwrap_or(false) { 1 } else { 0 };
    create(&pool, &id, &input.name, &input.content, builtin, now).await
}

#[tauri::command]
pub async fn update_prompt_preset(input: UpdatePromptPreset) -> AppResult<()> {
    let pool = db::pool()?;
    update_partial(
        &pool,
        &input.id,
        input.name.as_deref(),
        input.content.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn delete_prompt_preset(id: String) -> AppResult<()> {
    let pool = db::pool()?;
    delete(&pool, &id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    /// 建一个临时 sqlite + 跑 0001_init migration,返回 pool + temp dir guard
    async fn fresh_pool() -> (SqlitePool, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let url = format!("sqlite://{}?mode=rwc", db_path.display());
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .unwrap();
        // 0001_init.sql 包含 prompt_presets 表
        let init_sql = include_str!("../db/migrations/0001_init.sql");
        sqlx::query(init_sql).execute(&pool).await.unwrap();
        (pool, dir)
    }

    #[tokio::test]
    async fn list_all_empty_db_returns_empty_vec() {
        let (pool, _dir) = fresh_pool().await;
        let r = list_all(&pool).await.unwrap();
        assert_eq!(r.len(), 0);
    }

    #[tokio::test]
    async fn create_then_list_returns_preset() {
        let (pool, _dir) = fresh_pool().await;
        create(&pool, "p1", "My Preset", "content x", 0, 1000)
            .await
            .unwrap();
        let list = list_all(&pool).await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "p1");
        assert_eq!(list[0].name, "My Preset");
        assert_eq!(list[0].content, "content x");
        assert_eq!(list[0].builtin, 0);
        assert_eq!(list[0].created_at, 1000);
    }

    #[tokio::test]
    async fn update_partial_only_name() {
        let (pool, _dir) = fresh_pool().await;
        create(&pool, "p1", "Old", "old content", 0, 1000)
            .await
            .unwrap();
        // 只改 name
        update_partial(&pool, "p1", Some("New"), None)
            .await
            .unwrap();
        let list = list_all(&pool).await.unwrap();
        assert_eq!(list[0].name, "New");
        assert_eq!(list[0].content, "old content"); // content 不变
    }

    #[tokio::test]
    async fn delete_removes_preset() {
        let (pool, _dir) = fresh_pool().await;
        create(&pool, "p1", "A", "a", 0, 1000).await.unwrap();
        create(&pool, "p2", "B", "b", 0, 2000).await.unwrap();
        delete(&pool, "p1").await.unwrap();
        let list = list_all(&pool).await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "p2");
    }
}
