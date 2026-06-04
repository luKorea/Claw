use keyring::Entry;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

const SERVICE: &str = "com.claw.client";

/// 旧版本(v1.0)用的单一 account name,首次启动时自动迁移到 `api-key:{provider}` 命名。
const LEGACY_ACCOUNT: &str = "anthropic-api-key";

/// 支持的 provider 列表(v1.1+)。
const ALL_PROVIDERS: &[&str] = &["anthropic", "deepseek", "openai", "minimaxi"];

fn account_name(provider: &str) -> String {
    format!("api-key:{provider}")
}

fn validate_provider(provider: &str) -> AppResult<()> {
    if ALL_PROVIDERS.contains(&provider) {
        Ok(())
    } else {
        Err(AppError::InvalidInput(format!(
            "未知 provider: {provider}。可选: {}",
            ALL_PROVIDERS.join(", ")
        )))
    }
}

/// 校验 set_api_key 输入:provider 白名单 + trim + 非空 + sk- 前缀。
/// 返回 trim 后的 key 字符串(可直接写入 Keychain)。
/// **公开**给单元测试,业务命令复用同一份校验逻辑。
pub fn validate_input(provider: &str, api_key: &str) -> AppResult<String> {
    validate_provider(provider)?;
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput("API Key 不能为空".into()));
    }
    if !trimmed.starts_with("sk-") {
        return Err(AppError::InvalidInput("API Key 必须以 sk- 开头".into()));
    }
    Ok(trimmed.to_string())
}

fn entry(provider: &str) -> AppResult<Entry> {
    Ok(Entry::new(SERVICE, &account_name(provider))?)
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
    match provider {
        "anthropic" | "deepseek" | "openai" | "minimaxi" => format!("sk-…{suffix}"),
        _ => format!("…{suffix}"),
    }
}

#[tauri::command]
pub async fn get_api_key_status(provider: String) -> AppResult<ApiKeyStatus> {
    validate_provider(&provider)?;
    let entry = entry(&provider)?;
    match entry.get_password() {
        Ok(secret) => Ok(ApiKeyStatus {
            configured: true,
            preview: Some(preview_for(&provider, &secret)),
        }),
        Err(keyring::Error::NoEntry) => {
            // 旧 v1.0 用户:尝试读 LEGACY_ACCOUNT
            if provider == "anthropic" {
                if let Ok(legacy) = Entry::new(SERVICE, LEGACY_ACCOUNT) {
                    if let Ok(legacy_secret) = legacy.get_password() {
                        return Ok(ApiKeyStatus {
                            configured: true,
                            preview: Some(preview_for(&provider, &legacy_secret)),
                        });
                    }
                }
            }
            Ok(ApiKeyStatus {
                configured: false,
                preview: None,
            })
        }
        Err(e) => Err(AppError::Keyring(e)),
    }
}

#[tauri::command]
pub async fn set_api_key(provider: String, api_key: String) -> AppResult<()> {
    let trimmed = validate_input(&provider, &api_key)?;
    let entry = entry(&provider)?;
    entry.set_password(&trimmed)?;
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
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::Keyring(e)),
    }
}

#[tauri::command]
pub async fn get_api_key(provider: String) -> AppResult<String> {
    validate_provider(&provider)?;
    let entry = entry(&provider)?;
    match entry.get_password() {
        Ok(secret) => Ok(secret),
        Err(keyring::Error::NoEntry) => {
            // 旧 v1.0 用户的 legacy fallback
            if provider == "anthropic" {
                if let Ok(legacy) = Entry::new(SERVICE, LEGACY_ACCOUNT) {
                    if let Ok(secret) = legacy.get_password() {
                        return Ok(secret);
                    }
                }
            }
            Err(AppError::NotFound("API Key 未配置".into()))
        }
        Err(other) => Err(AppError::Keyring(other)),
    }
}

/// 启动时前端调用,用于知道哪些 provider 已有 key。
/// 兼容旧 v1.0 LEGACY_ACCOUNT 视为 anthropic 已配置。
#[tauri::command]
pub async fn list_configured_providers() -> AppResult<Vec<String>> {
    let mut out = Vec::new();
    for &p in ALL_PROVIDERS {
        let entry = Entry::new(SERVICE, &account_name(p))?;
        if entry.get_password().is_ok() {
            out.push(p.to_string());
            continue;
        }
        if p == "anthropic" {
            if let Ok(legacy) = Entry::new(SERVICE, LEGACY_ACCOUNT) {
                if legacy.get_password().is_ok() {
                    out.push(p.to_string());
                }
            }
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
    fn validate_provider_rejects_unknown() {
        let r = validate_provider("gemini");
        assert!(r.is_err());
        let msg = r.unwrap_err().to_string();
        assert!(msg.contains("gemini"), "应提到非法 provider 名");
        assert!(msg.contains("可选"), "应给出可选列表");
    }

    #[test]
    fn preview_for_all_providers_use_sk_prefix() {
        // v1.1:所有 provider 统一 sk-… 后缀
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
    fn validate_input_rejects_non_sk_prefix() {
        let r = validate_input("openai", "eyJhbGciOi...");
        assert!(r.is_err());
        assert!(r.unwrap_err().to_string().contains("sk-"));
    }

    #[test]
    fn validate_input_rejects_unknown_provider_before_trim() {
        let r = validate_input("gemini", "sk-abc");
        assert!(r.is_err());
    }
}
