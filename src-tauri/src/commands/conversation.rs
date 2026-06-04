use serde::{Deserialize, Serialize};
use sqlx::FromRow;

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
        sqlx::query(
            "UPDATE conversations SET system_prompt = ?1, updated_at = ?2 WHERE id = ?3",
        )
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
        sqlx::query(
            "UPDATE conversations SET thinking_budget = ?1, updated_at = ?2 WHERE id = ?3",
        )
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
