use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use crate::db;
use crate::error::{AppError, AppResult};

// ---------- DTO ----------

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub model: String,
    pub system_prompt: Option<String>,
    pub thinking_enabled: i64,
    pub thinking_budget: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Message {
    pub id: String,
    pub conversation_id: String,
    pub parent_id: Option<String>,
    pub role: String,
    pub content: String,
    pub thinking: Option<String>,
    pub tool_calls: Option<String>,
    pub tool_results: Option<String>,
    pub model: Option<String>,
    pub usage: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct NewConversation {
    pub title: String,
    pub model: String,
    pub system_prompt: Option<String>,
    pub thinking_enabled: bool,
    pub thinking_budget: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateConversation {
    pub id: String,
    pub title: Option<String>,
    pub model: Option<String>,
    pub system_prompt: Option<Option<String>>,
    pub thinking_enabled: Option<bool>,
    pub thinking_budget: Option<Option<i64>>,
}

#[derive(Debug, Deserialize)]
pub struct NewMessage {
    pub id: String,
    pub conversation_id: String,
    pub parent_id: Option<String>,
    pub role: String,
    pub content: String,
    pub thinking: Option<String>,
    pub tool_calls: Option<String>,
    pub tool_results: Option<String>,
    pub model: Option<String>,
    pub usage: Option<String>,
}

// ---------- Commands ----------

#[tauri::command]
pub async fn list_conversations() -> AppResult<Vec<Conversation>> {
    let pool = db::pool()?;
    let rows = sqlx::query_as::<_, Conversation>(
        "SELECT id, title, model, system_prompt, thinking_enabled, thinking_budget, created_at, updated_at
         FROM conversations ORDER BY updated_at DESC",
    )
    .fetch_all(&pool)
    .await?;
    Ok(rows)
}

#[tauri::command]
pub async fn get_conversation(id: String) -> AppResult<Conversation> {
    let pool = db::pool()?;
    let row = sqlx::query_as::<_, Conversation>(
        "SELECT id, title, model, system_prompt, thinking_enabled, thinking_budget, created_at, updated_at
         FROM conversations WHERE id = ?1",
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("conversation {id}")))?;
    Ok(row)
}

#[tauri::command]
pub async fn create_conversation(input: NewConversation) -> AppResult<Conversation> {
    let pool = db::pool()?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    let thinking_enabled = if input.thinking_enabled { 1 } else { 0 };

    sqlx::query(
        "INSERT INTO conversations
         (id, title, model, system_prompt, thinking_enabled, thinking_budget, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
    )
    .bind(&id)
    .bind(&input.title)
    .bind(&input.model)
    .bind(&input.system_prompt)
    .bind(thinking_enabled)
    .bind(input.thinking_budget)
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await?;

    Ok(Conversation {
        id,
        title: input.title,
        model: input.model,
        system_prompt: input.system_prompt,
        thinking_enabled,
        thinking_budget: input.thinking_budget,
        created_at: now,
        updated_at: now,
    })
}

#[tauri::command]
pub async fn update_conversation(input: UpdateConversation) -> AppResult<()> {
    let pool = db::pool()?;
    let now = chrono::Utc::now().timestamp_millis();

    if let Some(title) = input.title {
        sqlx::query("UPDATE conversations SET title = ?1, updated_at = ?2 WHERE id = ?3")
            .bind(title)
            .bind(now)
            .bind(&input.id)
            .execute(&pool)
            .await?;
    }
    if let Some(model) = input.model {
        sqlx::query("UPDATE conversations SET model = ?1, updated_at = ?2 WHERE id = ?3")
            .bind(model)
            .bind(now)
            .bind(&input.id)
            .execute(&pool)
            .await?;
    }
    if let Some(system_prompt) = input.system_prompt {
        sqlx::query("UPDATE conversations SET system_prompt = ?1, updated_at = ?2 WHERE id = ?3")
            .bind(system_prompt)
            .bind(now)
            .bind(&input.id)
            .execute(&pool)
            .await?;
    }
    if let Some(thinking_enabled) = input.thinking_enabled {
        let v = if thinking_enabled { 1 } else { 0 };
        sqlx::query(
            "UPDATE conversations SET thinking_enabled = ?1, updated_at = ?2 WHERE id = ?3",
        )
        .bind(v)
        .bind(now)
        .bind(&input.id)
        .execute(&pool)
        .await?;
    }
    if let Some(thinking_budget) = input.thinking_budget {
        sqlx::query("UPDATE conversations SET thinking_budget = ?1, updated_at = ?2 WHERE id = ?3")
            .bind(thinking_budget)
            .bind(now)
            .bind(&input.id)
            .execute(&pool)
            .await?;
    }

    Ok(())
}

#[tauri::command]
pub async fn delete_conversation(id: String) -> AppResult<()> {
    let pool = db::pool()?;
    sqlx::query("DELETE FROM conversations WHERE id = ?1")
        .bind(&id)
        .execute(&pool)
        .await?;
    Ok(())
}

pub async fn delete_many(pool: &SqlitePool, ids: &[String]) -> AppResult<()> {
    let mut tx = pool.begin().await?;
    for id in ids {
        sqlx::query("DELETE FROM conversations WHERE id = ?1")
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(())
}

#[tauri::command]
pub async fn delete_conversations(ids: Vec<String>) -> AppResult<()> {
    let pool = db::pool()?;
    delete_many(&pool, &ids).await
}

#[tauri::command]
pub async fn list_messages(conversation_id: String) -> AppResult<Vec<Message>> {
    let pool = db::pool()?;
    let rows = sqlx::query_as::<_, Message>(
        "SELECT id, conversation_id, parent_id, role, content, thinking, tool_calls, tool_results, model, usage, created_at
         FROM messages WHERE conversation_id = ?1 ORDER BY created_at ASC",
    )
    .bind(&conversation_id)
    .fetch_all(&pool)
    .await?;
    Ok(rows)
}

#[tauri::command]
pub async fn save_message(input: NewMessage) -> AppResult<Message> {
    let pool = db::pool()?;
    let now = chrono::Utc::now().timestamp_millis();

    sqlx::query(
        "INSERT INTO messages
         (id, conversation_id, parent_id, role, content, thinking, tool_calls, tool_results, model, usage, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
    )
    .bind(&input.id)
    .bind(&input.conversation_id)
    .bind(&input.parent_id)
    .bind(&input.role)
    .bind(&input.content)
    .bind(&input.thinking)
    .bind(&input.tool_calls)
    .bind(&input.tool_results)
    .bind(&input.model)
    .bind(&input.usage)
    .bind(now)
    .execute(&pool)
    .await?;

    // touch 会话 updated_at
    sqlx::query("UPDATE conversations SET updated_at = ?1 WHERE id = ?2")
        .bind(now)
        .bind(&input.conversation_id)
        .execute(&pool)
        .await?;

    Ok(Message {
        id: input.id,
        conversation_id: input.conversation_id,
        parent_id: input.parent_id,
        role: input.role,
        content: input.content,
        thinking: input.thinking,
        tool_calls: input.tool_calls,
        tool_results: input.tool_results,
        model: input.model,
        usage: input.usage,
        created_at: now,
    })
}

#[tauri::command]
pub async fn delete_message(id: String) -> AppResult<()> {
    let pool = db::pool()?;
    sqlx::query("DELETE FROM messages WHERE id = ?1")
        .bind(&id)
        .execute(&pool)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn fresh_pool() -> (SqlitePool, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let url = format!("sqlite://{}?mode=rwc", db_path.display());
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .unwrap();
        let init_sql = include_str!("../db/migrations/0001_init.sql");
        sqlx::query(init_sql).execute(&pool).await.unwrap();
        (pool, dir)
    }

    async fn insert_conversation(pool: &SqlitePool, id: &str) {
        sqlx::query(
            "INSERT INTO conversations
             (id, title, model, system_prompt, thinking_enabled, thinking_budget, created_at, updated_at)
             VALUES (?1, 'title', 'MiniMax-M2.7', NULL, 0, NULL, 1, 1)",
        )
        .bind(id)
        .execute(pool)
        .await
        .unwrap();
    }

    async fn insert_message(pool: &SqlitePool, id: &str, conversation_id: &str) {
        sqlx::query(
            "INSERT INTO messages
             (id, conversation_id, parent_id, role, content, thinking, tool_calls, tool_results, model, usage, created_at)
             VALUES (?1, ?2, NULL, 'user', '[]', NULL, NULL, NULL, NULL, NULL, 1)",
        )
        .bind(id)
        .bind(conversation_id)
        .execute(pool)
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn delete_many_removes_conversations_and_cascades_messages() {
        let (pool, _dir) = fresh_pool().await;
        insert_conversation(&pool, "c1").await;
        insert_conversation(&pool, "c2").await;
        insert_conversation(&pool, "c3").await;
        insert_message(&pool, "m1", "c1").await;
        insert_message(&pool, "m2", "c2").await;

        delete_many(&pool, &["c1".to_string(), "c2".to_string()])
            .await
            .unwrap();

        let remaining_conversations: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM conversations")
            .fetch_one(&pool)
            .await
            .unwrap();
        let remaining_messages: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM messages")
            .fetch_one(&pool)
            .await
            .unwrap();

        assert_eq!(remaining_conversations, 1);
        assert_eq!(remaining_messages, 0);
    }
}
