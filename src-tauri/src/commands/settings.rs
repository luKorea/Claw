use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, MutexGuard, OnceLock};

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
/// 返回 trim 后的 key 字符串(可直接写入 Keychain)。
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

#[derive(Default)]
struct ApiKeyCache {
    /// 仅保存在当前应用进程内,用于避免同一轮启动反复触发 macOS Keychain 授权弹窗。
    secrets: HashMap<String, String>,
    absent: HashSet<String>,
}

static API_KEY_CACHE: OnceLock<Mutex<ApiKeyCache>> = OnceLock::new();

fn api_key_cache() -> &'static Mutex<ApiKeyCache> {
    API_KEY_CACHE.get_or_init(|| Mutex::new(ApiKeyCache::default()))
}

fn lock_cache() -> AppResult<MutexGuard<'static, ApiKeyCache>> {
    api_key_cache()
        .lock()
        .map_err(|_| AppError::Other("API Key cache lock poisoned".into()))
}

fn remember_secret(cache: &mut ApiKeyCache, provider: &str, secret: String) {
    cache.absent.remove(provider);
    cache.secrets.insert(provider.to_string(), secret);
}

fn remember_absent(cache: &mut ApiKeyCache, provider: &str) {
    cache.secrets.remove(provider);
    cache.absent.insert(provider.to_string());
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

fn get_secret_cached(provider: &str) -> AppResult<Option<String>> {
    let mut cache = lock_cache()?;
    if let Some(secret) = cache.secrets.get(provider) {
        return Ok(Some(secret.clone()));
    }
    if cache.absent.contains(provider) {
        return Ok(None);
    }

    // 串行化首次 Keychain 读取,避免多个 React hook 同时挂载时并发弹窗。
    match read_secret_uncached(provider)? {
        Some(secret) => {
            remember_secret(&mut cache, provider, secret.clone());
            Ok(Some(secret))
        }
        None => {
            remember_absent(&mut cache, provider);
            Ok(None)
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApiKeyStatus {
    pub configured: bool,
    /// 脱敏预览:按 provider 决定前缀
    pub preview: Option<String>,
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

#[tauri::command]
pub async fn get_api_key_status(provider: String) -> AppResult<ApiKeyStatus> {
    validate_provider(&provider)?;
    match get_secret_cached(&provider)? {
        Some(secret) => Ok(ApiKeyStatus {
            configured: true,
            preview: Some(preview_for(&provider, &secret)),
        }),
        None => Ok(ApiKeyStatus {
            configured: false,
            preview: None,
        }),
    }
}

#[tauri::command]
pub async fn set_api_key(provider: String, api_key: String) -> AppResult<()> {
    let trimmed = validate_input(&provider, &api_key)?;
    let entry = entry(&provider)?;
    entry.set_password(&trimmed)?;
    {
        let mut cache = lock_cache()?;
        remember_secret(&mut cache, &provider, trimmed);
    }
    // 迁移:首次写入新位置时,删除旧 LEGACY_ACCOUNT
    if provider == "anthropic" {
        if let Ok(legacy) = Entry::new(SERVICE, LEGACY_ACCOUNT) {
            let _ = legacy.delete_credential();
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_api_key(provider: String) -> AppResult<()> {
    validate_provider(&provider)?;
    let entry = entry(&provider)?;
    match entry.delete_credential() {
        Ok(_) => {
            let mut cache = lock_cache()?;
            remember_absent(&mut cache, &provider);
            Ok(())
        }
        Err(keyring::Error::NoEntry) => {
            let mut cache = lock_cache()?;
            remember_absent(&mut cache, &provider);
            Ok(())
        }
        Err(e) => Err(AppError::Keyring(e)),
    }
}

#[tauri::command]
pub async fn get_api_key(provider: String) -> AppResult<String> {
    validate_provider(&provider)?;
    match get_secret_cached(&provider)? {
        Some(secret) => Ok(secret),
        None => Err(AppError::NotFound("API Key 未配置".into())),
    }
}

/// 启动时前端调用,用于知道哪些 provider 已有 key。
/// 兼容旧 v1.0 LEGACY_ACCOUNT 视为 anthropic 已配置。
#[tauri::command]
pub async fn list_configured_providers() -> AppResult<Vec<String>> {
    let mut out = Vec::new();
    for &p in ALL_PROVIDERS {
        if get_secret_cached(p)?.is_some() {
            out.push(p.to_string());
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

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

    #[test]
    fn cache_remember_secret_replaces_absent_marker() {
        let mut cache = ApiKeyCache::default();
        remember_absent(&mut cache, "deepseek");
        remember_secret(&mut cache, "deepseek", "sk-test".to_string());

        assert!(!cache.absent.contains("deepseek"));
        assert_eq!(
            cache.secrets.get("deepseek").map(String::as_str),
            Some("sk-test")
        );
    }

    #[test]
    fn cache_remember_absent_removes_secret() {
        let mut cache = ApiKeyCache::default();
        remember_secret(&mut cache, "openai", "sk-test".to_string());
        remember_absent(&mut cache, "openai");

        assert!(cache.absent.contains("openai"));
        assert!(!cache.secrets.contains_key("openai"));
    }
}
