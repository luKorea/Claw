use keyring::Entry;
use reqwest::Client;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::time::Duration;

const SERVICE: &str = "com.claw.client";
const LEGACY_ANTHROPIC_ACCOUNT: &str = "anthropic-api-key";
const PROMPT: &str = "Reply exactly: OK";

#[derive(Clone, Copy)]
enum ProviderKind {
    Anthropic,
    OpenAiCompatible,
}

struct ProviderConfig {
    id: &'static str,
    label: &'static str,
    env_key: &'static str,
    model_env: &'static str,
    default_model: &'static str,
    kind: ProviderKind,
    url: &'static str,
    accounts: &'static [&'static str],
}

const PROVIDERS: &[ProviderConfig] = &[
    ProviderConfig {
        id: "anthropic",
        label: "Anthropic",
        env_key: "CLAW_ANTHROPIC_API_KEY",
        model_env: "CLAW_SMOKE_ANTHROPIC_MODEL",
        default_model: "claude-haiku-4-5-20251001",
        kind: ProviderKind::Anthropic,
        url: "https://api.anthropic.com/v1/messages",
        accounts: &["api-key:anthropic", LEGACY_ANTHROPIC_ACCOUNT],
    },
    ProviderConfig {
        id: "deepseek",
        label: "DeepSeek",
        env_key: "CLAW_DEEPSEEK_API_KEY",
        model_env: "CLAW_SMOKE_DEEPSEEK_MODEL",
        default_model: "deepseek-chat",
        kind: ProviderKind::OpenAiCompatible,
        url: "https://api.deepseek.com/chat/completions",
        accounts: &["api-key:deepseek"],
    },
    ProviderConfig {
        id: "openai",
        label: "OpenAI",
        env_key: "CLAW_OPENAI_API_KEY",
        model_env: "CLAW_SMOKE_OPENAI_MODEL",
        default_model: "gpt-4o-mini",
        kind: ProviderKind::OpenAiCompatible,
        url: "https://api.openai.com/v1/chat/completions",
        accounts: &["api-key:openai"],
    },
    ProviderConfig {
        id: "minimaxi",
        label: "MiniMax",
        env_key: "CLAW_MINIMAXI_API_KEY",
        model_env: "CLAW_SMOKE_MINIMAXI_MODEL",
        default_model: "MiniMax-M2.7",
        kind: ProviderKind::Anthropic,
        url: "https://api.minimax.io/anthropic/v1/messages",
        accounts: &["api-key:minimaxi"],
    },
];

struct Credential {
    secret: String,
    source: String,
}

fn account_name(provider: &str) -> String {
    format!("api-key:{provider}")
}

fn read_keychain_account(account: &str) -> Result<Option<String>, String> {
    let entry = Entry::new(SERVICE, account)
        .map_err(|err| format!("Keychain:{account} entry init failed: {err}"))?;
    match entry.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(format!("Keychain:{account} read failed: {err}")),
    }
}

fn credential_for(
    provider: &ProviderConfig,
    lookup_errors: &mut Vec<String>,
) -> Option<Credential> {
    if let Ok(value) = std::env::var(provider.env_key) {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Some(Credential {
                secret: trimmed.to_string(),
                source: provider.env_key.to_string(),
            });
        }
    }

    let mut accounts = provider
        .accounts
        .iter()
        .map(|account| account.to_string())
        .collect::<Vec<_>>();
    let fallback = account_name(provider.id);
    if !accounts.iter().any(|account| account == &fallback) {
        accounts.push(fallback);
    }

    for account in accounts {
        match read_keychain_account(&account) {
            Ok(Some(secret)) => {
                return Some(Credential {
                    secret,
                    source: format!("Keychain:{account}"),
                });
            }
            Ok(None) => {}
            Err(err) => lookup_errors.push(format!("{} {err}", provider.label)),
        }
    }
    None
}

fn selected_providers() -> Vec<&'static ProviderConfig> {
    let Some(raw) = std::env::var("CLAW_SMOKE_PROVIDERS").ok() else {
        return PROVIDERS.iter().collect();
    };
    let allow: HashSet<String> = raw
        .split(',')
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(ToOwned::to_owned)
        .collect();
    if allow.is_empty() {
        return PROVIDERS.iter().collect();
    }
    PROVIDERS
        .iter()
        .filter(|provider| allow.contains(provider.id))
        .collect()
}

fn timeout() -> Duration {
    let ms = std::env::var("CLAW_SMOKE_TIMEOUT_MS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(60_000);
    Duration::from_millis(ms)
}

fn max_tokens() -> u64 {
    std::env::var("CLAW_SMOKE_MAX_TOKENS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(8)
}

fn model_for(provider: &ProviderConfig) -> String {
    std::env::var(provider.model_env).unwrap_or_else(|_| provider.default_model.to_string())
}

fn request_body(provider: &ProviderConfig, model: &str) -> Value {
    match provider.kind {
        ProviderKind::Anthropic => json!({
            "model": model,
            "max_tokens": max_tokens(),
            "stream": true,
            "messages": [{ "role": "user", "content": PROMPT }],
        }),
        ProviderKind::OpenAiCompatible => json!({
            "model": model,
            "max_tokens": max_tokens(),
            "stream": true,
            "stream_options": { "include_usage": true },
            "messages": [{ "role": "user", "content": PROMPT }],
        }),
    }
}

fn parse_sse_block(block: &str, kind: ProviderKind) -> String {
    let data = block
        .lines()
        .filter_map(|line| line.strip_prefix("data:"))
        .map(str::trim_start)
        .collect::<Vec<_>>()
        .join("\n");

    if data.is_empty() || data == "[DONE]" {
        return String::new();
    }

    let Ok(value) = serde_json::from_str::<Value>(&data) else {
        return String::new();
    };

    match kind {
        ProviderKind::Anthropic => {
            if value.get("type").and_then(Value::as_str) == Some("content_block_start")
                && value.pointer("/content_block/type").and_then(Value::as_str) == Some("text")
            {
                return value
                    .pointer("/content_block/text")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string();
            }
            if value.get("type").and_then(Value::as_str) == Some("content_block_delta")
                && value.pointer("/delta/type").and_then(Value::as_str) == Some("text_delta")
            {
                return value
                    .pointer("/delta/text")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string();
            }
            String::new()
        }
        ProviderKind::OpenAiCompatible => value
            .get("choices")
            .and_then(Value::as_array)
            .map(|choices| {
                choices
                    .iter()
                    .filter_map(|choice| choice.pointer("/delta/content").and_then(Value::as_str))
                    .collect::<Vec<_>>()
                    .join("")
            })
            .unwrap_or_default(),
    }
}

fn find_sse_separator(buffer: &str) -> Option<(usize, usize)> {
    match (buffer.find("\n\n"), buffer.find("\r\n\r\n")) {
        (Some(lf), Some(crlf)) if lf < crlf => Some((lf, 2)),
        (Some(_), Some(crlf)) => Some((crlf, 4)),
        (Some(lf), None) => Some((lf, 2)),
        (None, Some(crlf)) => Some((crlf, 4)),
        (None, None) => None,
    }
}

fn has_sse_data(block: &str) -> bool {
    block
        .lines()
        .filter_map(|line| line.strip_prefix("data:"))
        .map(str::trim_start)
        .any(|data| !data.is_empty() && data != "[DONE]")
}

async fn consume_sse_text(
    mut response: reqwest::Response,
    kind: ProviderKind,
) -> Result<(String, usize), String> {
    let mut buffer = String::new();
    let mut text = String::new();
    let mut event_count = 0;

    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|err| format!("stream read failed: {err}"))?
    {
        buffer.push_str(&String::from_utf8_lossy(&chunk));
        while let Some((sep, sep_len)) = find_sse_separator(&buffer) {
            let block = buffer[..sep].to_string();
            buffer = buffer[sep + sep_len..].to_string();
            if has_sse_data(&block) {
                event_count += 1;
            }
            text.push_str(&parse_sse_block(&block, kind));
        }
    }

    if !buffer.trim().is_empty() {
        if has_sse_data(&buffer) {
            event_count += 1;
        }
        text.push_str(&parse_sse_block(&buffer, kind));
    }

    Ok((text, event_count))
}

fn sanitize(text: &str, secrets: &[String]) -> String {
    secrets.iter().fold(text.to_string(), |acc, secret| {
        if secret.is_empty() {
            acc
        } else {
            acc.replace(secret, "[secret]")
        }
    })
}

async fn smoke_provider(
    client: &Client,
    provider: &ProviderConfig,
    credential: &Credential,
    model: &str,
) -> Result<String, String> {
    let mut request = client
        .post(provider.url)
        .json(&request_body(provider, model));
    request = match provider.kind {
        ProviderKind::Anthropic => request
            .header("x-api-key", &credential.secret)
            .header("anthropic-version", "2023-06-01"),
        ProviderKind::OpenAiCompatible => request.bearer_auth(&credential.secret),
    };

    let response = request.send().await.map_err(|err| err.to_string())?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.map_err(|err| err.to_string())?;
        return Err(format!(
            "HTTP {status}: {}",
            body.chars().take(500).collect::<String>()
        ));
    }

    let (text, event_count) = consume_sse_text(response, provider.kind).await?;
    if event_count == 0 {
        return Err("no streaming SSE events received".to_string());
    }
    let text = text.trim().to_string();
    if text.is_empty() {
        return Err("empty assistant response".to_string());
    }
    if !text.to_ascii_lowercase().contains("ok") {
        return Err(format!(
            "unexpected response: {}",
            text.chars().take(120).collect::<String>()
        ));
    }

    Ok(text)
}

#[tokio::main]
async fn main() {
    let providers = selected_providers();
    let mut lookup_errors = Vec::new();
    let configured = providers
        .iter()
        .filter_map(|provider| {
            credential_for(provider, &mut lookup_errors).map(|credential| (*provider, credential))
        })
        .collect::<Vec<_>>();

    if configured.is_empty() {
        println!(
            "[real-smoke] No configured Provider keys found. Checked env vars and OS Keychain."
        );
        println!("[real-smoke] Env override names: CLAW_ANTHROPIC_API_KEY, CLAW_DEEPSEEK_API_KEY, CLAW_OPENAI_API_KEY, CLAW_MINIMAXI_API_KEY.");
        if !lookup_errors.is_empty() {
            println!("[real-smoke] Keychain lookup issue(s):");
            for err in lookup_errors {
                println!("[real-smoke] - {err}");
            }
        }
        if std::env::var("CLAW_SMOKE_ALLOW_EMPTY").ok().as_deref() == Some("1") {
            return;
        }
        std::process::exit(2);
    }

    let client = Client::builder()
        .timeout(timeout())
        .build()
        .expect("reqwest client should build");
    let secrets = configured
        .iter()
        .map(|(_, credential)| credential.secret.clone())
        .collect::<Vec<_>>();
    let mut failures = Vec::new();

    println!(
        "[real-smoke] Testing {} configured Provider(s). Secrets will not be printed.",
        configured.len()
    );
    if !lookup_errors.is_empty() {
        println!("[real-smoke] Non-fatal Keychain lookup issue(s):");
        for err in &lookup_errors {
            println!("[real-smoke] - {err}");
        }
    }

    for (provider, credential) in configured {
        let model = model_for(provider);
        print!(
            "[real-smoke] {} ({model}, {}) ... ",
            provider.label, credential.source
        );
        match smoke_provider(&client, provider, &credential, &model).await {
            Ok(text) => {
                println!("ok ({:?})", text.chars().take(80).collect::<String>());
            }
            Err(err) => {
                println!("failed");
                println!(
                    "[real-smoke] {} error: {}",
                    provider.label,
                    sanitize(&err, &secrets)
                );
                failures.push(provider.id);
            }
        }
    }

    if failures.is_empty() {
        println!("[real-smoke] All configured Providers passed.");
    } else {
        println!("[real-smoke] Failed Provider(s): {}", failures.join(", "));
        std::process::exit(1);
    }
}
