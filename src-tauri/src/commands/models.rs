use serde::Deserialize;

use crate::error::{AppError, AppResult};

/// 支持 /v1/models 列表的 provider(v1.2 Bug 3.2)。
/// Anthropic 不在列表中 — 它没有公开的 models endpoint,前端走硬编码白名单。
pub const LISTABLE_PROVIDERS: &[&str] = &["deepseek", "openai", "minimaxi"];

/// 把 provider 映射到 chat completions base URL,**不含** `/v1` 后缀。
/// 与 `commands::settings::ALL_PROVIDERS` / 各 adapter 保持一致。
///
/// v1.3 修正:MiniMax 官方主域名为 api.minimax.io(拼音),api.minimaxi.com 是旧域,
/// 仍可解析但部分账号会出现 401。前端 adapter 同步改为 .io。
pub fn base_url_for(provider: &str) -> AppResult<&'static str> {
    match provider {
        "deepseek" => Ok("https://api.deepseek.com"),
        "openai" => Ok("https://api.openai.com/v1"),
        "minimaxi" => Ok("https://api.minimax.io/v1"),
        _ => Err(AppError::InvalidInput(format!("未知 provider: {provider}"))),
    }
}

/// 校验 provider 是否在 LISTABLE_PROVIDERS 内。anthropic / 未知 provider 一律拒。
pub fn validate_listable_provider(provider: &str) -> AppResult<&'static str> {
    if !LISTABLE_PROVIDERS.contains(&provider) {
        return Err(AppError::InvalidInput(format!(
            "provider {} 不支持 /v1/models 列表(仅 {:?} 支持)。请使用硬编码模型列表。",
            provider, LISTABLE_PROVIDERS
        )));
    }
    base_url_for(provider)
}

/// OAI 标准 /v1/models 响应体。
/// 只关心 `data[].id`,其余字段忽略。
#[derive(Debug, Deserialize)]
struct OaiModelsResponse {
    data: Vec<OaiModelEntry>,
}

#[derive(Debug, Deserialize)]
struct OaiModelEntry {
    id: String,
}

/// 纯函数:解析 OAI 格式的 /v1/models 响应,返回 model id 列表。
/// **公开**给单元测试。失败 → `AppError::Other`。
pub fn parse_oai_models_response(body: &str) -> AppResult<Vec<String>> {
    let parsed: OaiModelsResponse = serde_json::from_str(body)
        .map_err(|e| AppError::Other(format!("/v1/models 响应非 OAI 格式: {e}")))?;
    Ok(parsed.data.into_iter().map(|m| m.id).collect())
}

/// 调 provider 的 /v1/models,返回 model id 列表。
/// 网络失败 / 解析失败 → `AppError::Other`(前端 fallback 硬编码)。
#[tauri::command]
pub async fn list_provider_models(
    provider: String,
    api_key: String,
) -> AppResult<Vec<String>> {
    let base = validate_listable_provider(&provider)?;
    let url = format!("{}/models", base);
    log::info!("[models] GET {}", url);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| AppError::Other(format!("reqwest client build: {e}")))?;

    let resp = client
        .get(&url)
        .bearer_auth(&api_key)
        .send()
        .await
        .map_err(|e| AppError::Other(format!("/v1/models 请求失败: {e}")))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::Other(format!(
            "/v1/models 响应 {status}: {}",
            text.chars().take(200).collect::<String>()
        )));
    }

    let body = resp
        .text()
        .await
        .map_err(|e| AppError::Other(format!("/v1/models 读 body 失败: {e}")))?;
    parse_oai_models_response(&body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_listable_provider_accepts_oai_three() {
        for p in LISTABLE_PROVIDERS {
            assert!(validate_listable_provider(p).is_ok(), "{p} 应被接受");
        }
    }

    #[test]
    fn validate_listable_provider_rejects_anthropic() {
        let r = validate_listable_provider("anthropic");
        assert!(r.is_err());
        let msg = r.unwrap_err().to_string();
        assert!(msg.contains("anthropic"), "应明确提到 anthropic");
        assert!(msg.contains("/v1/models"), "应说明原因");
    }

    #[test]
    fn validate_listable_provider_rejects_unknown() {
        let r = validate_listable_provider("gemini");
        assert!(r.is_err());
    }

    #[test]
    fn base_url_for_returns_known_endpoints() {
        assert_eq!(base_url_for("deepseek").unwrap(), "https://api.deepseek.com");
        assert_eq!(base_url_for("openai").unwrap(), "https://api.openai.com/v1");
        // v1.3:MiniMax 域名从 minimaxi.com 改为 minimax.io(官方主域)
        assert_eq!(base_url_for("minimaxi").unwrap(), "https://api.minimax.io/v1");
        assert!(base_url_for("anthropic").is_err());
        assert!(base_url_for("xxx").is_err());
    }

    #[test]
    fn parse_oai_models_response_extracts_ids() {
        let body = r#"{"object":"list","data":[{"id":"m1"},{"id":"m2","object":"model"}]}"#;
        let ids = parse_oai_models_response(body).unwrap();
        assert_eq!(ids, vec!["m1", "m2"]);
    }

    #[test]
    fn parse_oai_models_response_empty_data() {
        let body = r#"{"object":"list","data":[]}"#;
        let ids = parse_oai_models_response(body).unwrap();
        assert_eq!(ids, Vec::<String>::new());
    }

    #[test]
    fn parse_oai_models_response_rejects_non_oai() {
        // 缺 data 字段
        let r = parse_oai_models_response(r#"{"models":["a","b"]}"#);
        assert!(r.is_err());
        // 完全不是 JSON
        let r = parse_oai_models_response("not json");
        assert!(r.is_err());
    }
}
