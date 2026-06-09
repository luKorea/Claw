use keyring::Entry;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::collections::HashMap;

use crate::db;
use crate::error::{AppError, AppResult};

const SERVICE: &str = "com.claw.client";

/// 旧版本(v1.0)用的单一 account name,首次启动时自动迁移到 `api-key:{provider}` 命名。
const LEGACY_ACCOUNT: &str = "anthropic-api-key";

/// 支持的 provider 列表(v1.1+)。
const ALL_PROVIDERS: &[&str] = &["anthropic", "deepseek", "openai", "minimaxi"];

fn account_name(provider: &str) -> String {
    format!("api-key:{provider}")
}

fn is_custom_provider(provider: &str) -> bool {
    let Some(id) = provider.strip_prefix("custom:") else {
        return false;
    };
    !id.is_empty()
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

fn validate_provider(provider: &str) -> AppResult<()> {
    if ALL_PROVIDERS.contains(&provider) || is_custom_provider(provider) {
        Ok(())
    } else {
        Err(AppError::InvalidInput(format!(
            "未知 provider: {provider}。可选: {} 或 custom:<id>",
            ALL_PROVIDERS.join(", ")
        )))
    }
}

/// 校验 set_api_key 输入:provider 白名单 + trim + 非空。
/// MiniMax 目前走 `sk-cp-...` / `sk-` 风格 Key,但不同 Provider 的 Key 格式可能继续变化。
/// 通用检查仅 trim + 非空,不再硬要求 `sk-` 前缀(避免 MiniMax 用户配不上)。
/// 返回 trim 后的 key 字符串(可直接写入本机配置)。
/// **公开**给单元测试,业务命令复用同一份校验逻辑。
pub fn validate_input(provider: &str, api_key: &str) -> AppResult<String> {
    validate_provider(provider)?;
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput("API Key 不能为空".into()));
    }
    Ok(trimmed.to_string())
}

fn entry(provider: &str) -> AppResult<Entry> {
    Ok(Entry::new(SERVICE, &account_name(provider))?)
}

fn read_secret_uncached(provider: &str) -> AppResult<Option<String>> {
    let entry = entry(provider)?;
    match entry.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => {
            // 旧 v1.0 用户:尝试读 LEGACY_ACCOUNT
            if provider == "anthropic" {
                if let Ok(legacy) = Entry::new(SERVICE, LEGACY_ACCOUNT) {
                    if let Ok(legacy_secret) = legacy.get_password() {
                        return Ok(Some(legacy_secret));
                    }
                }
            }
            Ok(None)
        }
        Err(e) => Err(AppError::Keyring(e)),
    }
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyStatus {
    pub configured: bool,
    /// 脱敏预览:按 provider 决定前缀
    pub preview: Option<String>,
    /// false 表示旧版本 Keychain 里可能已有 Key,但用户还未显式导入。
    pub metadata_known: bool,
}

fn preview_for(provider: &str, secret: &str) -> String {
    let len = secret.len();
    let suffix = if len >= 4 { &secret[len - 4..] } else { "" };
    // minimaxi 走 Anthropic 兼容协议,key 是 sk-cp-...(Anthropic 风格)。
    // 与 anthropic / openai / deepseek 都 sk- 前缀对齐。
    match provider {
        "anthropic" | "deepseek" | "openai" | "minimaxi" => format!("sk-…{suffix}"),
        p if is_custom_provider(p) => format!("…{suffix}"),
        _ => format!("…{suffix}"),
    }
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

async fn get_api_key_status_from_pool(
    pool: &SqlitePool,
    provider: &str,
) -> AppResult<ApiKeyStatus> {
    validate_provider(provider)?;
    let key_row = sqlx::query_as::<_, (Option<String>,)>(
        "SELECT preview
         FROM api_keys
         WHERE provider = ?1",
    )
    .bind(provider)
    .fetch_optional(pool)
    .await?;

    if let Some((preview,)) = key_row {
        return Ok(ApiKeyStatus {
            configured: true,
            preview,
            metadata_known: true,
        });
    }

    let metadata_row = sqlx::query_as::<_, (i64, i64)>(
        "SELECT configured, metadata_known
         FROM api_key_metadata
         WHERE provider = ?1",
    )
    .bind(provider)
    .fetch_optional(pool)
    .await?;

    let Some((legacy_configured, metadata_known)) = metadata_row else {
        return Ok(ApiKeyStatus {
            configured: false,
            preview: None,
            metadata_known: false,
        });
    };

    Ok(ApiKeyStatus {
        configured: false,
        preview: None,
        metadata_known: legacy_configured == 0 && metadata_known != 0,
    })
}

async fn upsert_api_key_metadata(
    pool: &SqlitePool,
    provider: &str,
    configured: bool,
    preview: Option<&str>,
    metadata_known: bool,
) -> AppResult<()> {
    validate_provider(provider)?;
    sqlx::query(
        "INSERT INTO api_key_metadata
          (provider, configured, preview, metadata_known, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(provider) DO UPDATE SET
          configured = excluded.configured,
          preview = excluded.preview,
          metadata_known = excluded.metadata_known,
          updated_at = excluded.updated_at",
    )
    .bind(provider)
    .bind(if configured { 1_i64 } else { 0_i64 })
    .bind(preview)
    .bind(if metadata_known { 1_i64 } else { 0_i64 })
    .bind(now_ms())
    .execute(pool)
    .await?;
    Ok(())
}

async fn write_metadata_from_secret(
    pool: &SqlitePool,
    provider: &str,
    secret: Option<&str>,
) -> AppResult<ApiKeyStatus> {
    let preview = secret.map(|value| preview_for(provider, value));
    upsert_api_key_metadata(pool, provider, secret.is_some(), preview.as_deref(), true).await?;
    Ok(ApiKeyStatus {
        configured: secret.is_some(),
        preview,
        metadata_known: true,
    })
}

async fn write_api_key_to_pool(
    pool: &SqlitePool,
    provider: &str,
    secret: &str,
) -> AppResult<ApiKeyStatus> {
    validate_provider(provider)?;
    let preview = preview_for(provider, secret);
    sqlx::query(
        "INSERT INTO api_keys
          (provider, api_key, storage, preview, updated_at)
         VALUES (?1, ?2, 'plain', ?3, ?4)
         ON CONFLICT(provider) DO UPDATE SET
          api_key = excluded.api_key,
          storage = excluded.storage,
          preview = excluded.preview,
          updated_at = excluded.updated_at",
    )
    .bind(provider)
    .bind(secret)
    .bind(&preview)
    .bind(now_ms())
    .execute(pool)
    .await?;

    write_metadata_from_secret(pool, provider, Some(secret)).await
}

async fn delete_api_key_from_pool(pool: &SqlitePool, provider: &str) -> AppResult<ApiKeyStatus> {
    validate_provider(provider)?;
    sqlx::query("DELETE FROM api_keys WHERE provider = ?1")
        .bind(provider)
        .execute(pool)
        .await?;
    write_metadata_from_secret(pool, provider, None).await
}

async fn get_api_key_from_pool(pool: &SqlitePool, provider: &str) -> AppResult<Option<String>> {
    validate_provider(provider)?;
    let row = sqlx::query_as::<_, (String,)>("SELECT api_key FROM api_keys WHERE provider = ?1")
        .bind(provider)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(|(secret,)| secret))
}

async fn list_configured_providers_from_pool(pool: &SqlitePool) -> AppResult<Vec<String>> {
    let mut out = Vec::new();
    for &provider in ALL_PROVIDERS {
        if get_api_key_from_pool(pool, provider).await?.is_some() {
            out.push(provider.to_string());
        }
    }
    Ok(out)
}

async fn list_api_key_statuses_from_pool(
    pool: &SqlitePool,
) -> AppResult<HashMap<String, ApiKeyStatus>> {
    let mut statuses = HashMap::new();
    for &provider in ALL_PROVIDERS {
        statuses.insert(
            provider.to_string(),
            get_api_key_status_from_pool(pool, provider).await?,
        );
    }
    Ok(statuses)
}

#[tauri::command]
pub async fn get_api_key_status(provider: String) -> AppResult<ApiKeyStatus> {
    validate_provider(&provider)?;
    let pool = db::pool()?;
    get_api_key_status_from_pool(&pool, &provider).await
}

#[tauri::command]
pub async fn list_api_key_statuses() -> AppResult<HashMap<String, ApiKeyStatus>> {
    let pool = db::pool()?;
    list_api_key_statuses_from_pool(&pool).await
}

#[tauri::command]
pub async fn set_api_key(provider: String, api_key: String) -> AppResult<()> {
    let trimmed = validate_input(&provider, &api_key)?;
    let pool = db::pool()?;
    write_api_key_to_pool(&pool, &provider, &trimmed).await?;
    Ok(())
}

#[tauri::command]
pub async fn delete_api_key(provider: String) -> AppResult<()> {
    validate_provider(&provider)?;
    let pool = db::pool()?;
    delete_api_key_from_pool(&pool, &provider).await?;
    Ok(())
}

#[tauri::command]
pub async fn get_api_key(provider: String) -> AppResult<String> {
    validate_provider(&provider)?;
    let pool = db::pool()?;
    match get_api_key_from_pool(&pool, &provider).await? {
        Some(secret) => Ok(secret),
        None => Err(AppError::NotFound("API Key 未配置".into())),
    }
}

/// 显式从旧 Keychain 导入某个 provider 的 Key。
/// 仅由用户点击“从旧 Keychain 导入”触发,会读取一次 Keychain 明文并写入 SQLite 配置。
#[tauri::command]
pub async fn sync_api_key_status(provider: String) -> AppResult<ApiKeyStatus> {
    validate_provider(&provider)?;
    let secret = read_secret_uncached(&provider)?;
    let pool = db::pool()?;
    match secret {
        Some(value) => write_api_key_to_pool(&pool, &provider, &value).await,
        None => delete_api_key_from_pool(&pool, &provider).await,
    }
}

/// 启动时前端调用,用于知道哪些 provider 已有 key。
/// 仅读取 SQLite 配置,不扫描 Keychain;旧 Key 需用户显式导入。
#[tauri::command]
pub async fn list_configured_providers() -> AppResult<Vec<String>> {
    let pool = db::pool()?;
    list_configured_providers_from_pool(&pool).await
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

    #[test]
    fn account_name_namespace_prefix() {
        assert_eq!(account_name("anthropic"), "api-key:anthropic");
        assert_eq!(account_name("minimaxi"), "api-key:minimaxi");
    }

    #[test]
    fn validate_provider_accepts_all_v11() {
        for p in ALL_PROVIDERS {
            assert!(validate_provider(p).is_ok(), "{p} 应被接受");
        }
    }

    #[test]
    fn validate_provider_accepts_custom_provider_ids() {
        assert!(validate_provider("custom:local_1").is_ok());
        assert!(validate_provider("custom:anthropic-proxy").is_ok());
    }

    #[test]
    fn validate_provider_rejects_malformed_custom_provider_ids() {
        for p in ["custom:", "custom:../x", "custom:abc/def", "custom:abc def"] {
            assert!(validate_provider(p).is_err(), "{p} 应被拒绝");
        }
    }

    #[test]
    fn validate_provider_rejects_unknown() {
        let r = validate_provider("gemini");
        assert!(r.is_err());
        let msg = r.unwrap_err().to_string();
        assert!(msg.contains("gemini"), "应提到非法 provider 名");
        assert!(msg.contains("可选"), "应给出可选列表");
    }

    #[test]
    fn preview_for_sk_providers_use_sk_prefix() {
        // v1.3 修正:minimaxi 走 Anthropic 兼容协议,key 是 sk-cp-... 格式,
        // 跟其他三家一起走 sk-… 后缀。
        for p in ["anthropic", "deepseek", "openai", "minimaxi"] {
            let s = preview_for(p, "sk-anything-1234");
            assert!(s.starts_with("sk-"), "{p} 预览应 sk-: {s}");
            assert!(s.ends_with("1234"), "{p} 应保留后 4 位");
        }
    }

    #[test]
    fn preview_for_unknown_provider_falls_back() {
        let s = preview_for("gemini", "xxxx1234");
        assert_eq!(s, "…1234");
    }

    #[test]
    fn preview_for_custom_provider_hides_prefix() {
        let s = preview_for("custom:local_1", "secret-value-9876");
        assert_eq!(s, "…9876");
    }

    #[test]
    fn preview_for_short_key_safe_degrade() {
        let s = preview_for("anthropic", "abc");
        // len=3 < 4,slice 越界 → 应安全降级
        assert!(s.starts_with("sk-"));
    }

    #[tokio::test]
    async fn metadata_missing_returns_unknown_without_keychain_read() {
        let (pool, _dir) = fresh_pool().await;
        let status = get_api_key_status_from_pool(&pool, "anthropic")
            .await
            .unwrap();

        assert_eq!(
            status,
            ApiKeyStatus {
                configured: false,
                preview: None,
                metadata_known: false,
            }
        );
    }

    #[tokio::test]
    async fn write_api_key_to_pool_records_configured_status() {
        let (pool, _dir) = fresh_pool().await;

        let written = write_api_key_to_pool(&pool, "deepseek", "sk-test-1234")
            .await
            .unwrap();
        let status = get_api_key_status_from_pool(&pool, "deepseek")
            .await
            .unwrap();

        assert_eq!(written, status);
        assert_eq!(
            status,
            ApiKeyStatus {
                configured: true,
                preview: Some("sk-…1234".to_string()),
                metadata_known: true,
            }
        );
        assert_eq!(
            get_api_key_from_pool(&pool, "deepseek").await.unwrap(),
            Some("sk-test-1234".to_string())
        );
    }

    #[tokio::test]
    async fn delete_api_key_marks_known_absent() {
        let (pool, _dir) = fresh_pool().await;

        write_api_key_to_pool(&pool, "openai", "sk-proj-1234")
            .await
            .unwrap();
        delete_api_key_from_pool(&pool, "openai").await.unwrap();
        let status = get_api_key_status_from_pool(&pool, "openai").await.unwrap();

        assert_eq!(
            status,
            ApiKeyStatus {
                configured: false,
                preview: None,
                metadata_known: true,
            }
        );
        assert_eq!(get_api_key_from_pool(&pool, "openai").await.unwrap(), None);
    }

    #[tokio::test]
    async fn legacy_metadata_configured_without_api_key_prompts_import() {
        let (pool, _dir) = fresh_pool().await;

        write_metadata_from_secret(&pool, "anthropic", Some("sk-ant-1234"))
            .await
            .unwrap();
        let status = get_api_key_status_from_pool(&pool, "anthropic")
            .await
            .unwrap();

        assert_eq!(
            status,
            ApiKeyStatus {
                configured: false,
                preview: None,
                metadata_known: false,
            }
        );
    }

    #[tokio::test]
    async fn list_configured_providers_reads_static_api_keys_only() {
        let (pool, _dir) = fresh_pool().await;

        write_api_key_to_pool(&pool, "anthropic", "sk-ant-1234")
            .await
            .unwrap();
        write_api_key_to_pool(&pool, "custom:local_1", "secret-5678")
            .await
            .unwrap();
        write_metadata_from_secret(&pool, "deepseek", Some("sk-old-metadata"))
            .await
            .unwrap();

        let configured = list_configured_providers_from_pool(&pool).await.unwrap();

        assert_eq!(configured, vec!["anthropic".to_string()]);
    }

    #[tokio::test]
    async fn list_api_key_statuses_returns_all_static_providers() {
        let (pool, _dir) = fresh_pool().await;

        write_api_key_to_pool(&pool, "minimaxi", "sk-cp-1234")
            .await
            .unwrap();
        let statuses = list_api_key_statuses_from_pool(&pool).await.unwrap();

        assert_eq!(statuses.len(), ALL_PROVIDERS.len());
        assert!(statuses.get("minimaxi").unwrap().configured);
        assert!(!statuses.get("openai").unwrap().configured);
    }

    #[test]
    fn validate_input_valid_anthropic_trims() {
        let r = validate_input("anthropic", "  sk-ant-1234  ");
        assert!(r.is_ok());
        assert_eq!(r.unwrap(), "sk-ant-1234");
    }

    #[test]
    fn validate_input_rejects_empty() {
        let r = validate_input("anthropic", "   ");
        assert!(r.is_err());
        assert!(r.unwrap_err().to_string().contains("不能为空"));
    }

    #[test]
    fn validate_input_accepts_minimaxi_sk_cp_prefix() {
        // v1.3 修正:MiniMax 走 Anthropic 兼容协议,key 格式是 sk-cp-...。
        // 后端只校验非空 + trim,不强制任何具体前缀。
        let r = validate_input("minimaxi", "sk-cp-w8Wej...1234");
        assert!(r.is_ok());
        assert_eq!(r.unwrap(), "sk-cp-w8Wej...1234");
    }

    #[test]
    fn validate_input_accepts_legacy_sk_prefix() {
        // 兼容:sk- 前缀(Anthropic / OpenAI / 旧 MiniMax 账号)仍接受
        let r = validate_input("openai", "sk-proj-1234");
        assert!(r.is_ok());
        assert_eq!(r.unwrap(), "sk-proj-1234");
    }

    #[test]
    fn validate_input_rejects_unknown_provider_before_trim() {
        let r = validate_input("gemini", "sk-abc");
        assert!(r.is_err());
    }
}
