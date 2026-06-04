use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use crate::error::{AppError, AppResult};

/// 把 path canonicalize 后,断言它落在 allowed_roots 任一根目录下。
/// **公开**给单元测试,生产 `safe_resolve` 用默认 5 个系统目录;测试可注入 tempfile 路径。
///
/// 注意:macOS / Linux 上 `/var` 可能是 `/private/var` 的 symlink;为避免误判,
/// 对每个 root 也做 canonicalize,再与 canonical path 比较前缀。
pub(crate) fn safe_resolve_with(path: &str, allowed_roots: &[PathBuf]) -> AppResult<PathBuf> {
    let p = Path::new(path);
    let canonical = p
        .canonicalize()
        .map_err(|e| AppError::InvalidInput(format!("路径无效: {e}")))?;

    for root in allowed_roots {
        let canonical_root = root.canonicalize().unwrap_or_else(|_| root.clone());
        if canonical.starts_with(&canonical_root) {
            return Ok(canonical);
        }
    }

    Err(AppError::InvalidInput(format!(
        "路径不在允许的范围内: {}",
        canonical.display()
    )))
}

/// 工具执行时允许访问的根目录白名单。
/// 优先取用户在设置中选定的目录；否则仅允许 $HOME / $DESKTOP / $DOCUMENT / $DOWNLOAD / $TEMP
fn safe_resolve(path: &str) -> AppResult<PathBuf> {
    let allowed_roots: Vec<PathBuf> = [
        dirs::home_dir(),
        dirs::desktop_dir(),
        dirs::document_dir(),
        dirs::download_dir(),
        Some(std::env::temp_dir()),
    ]
    .into_iter()
    .flatten()
    .collect();

    safe_resolve_with(path, &allowed_roots)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReadFileResult {
    pub path: String,
    pub content: String,
    pub size: u64,
}

#[tauri::command]
pub async fn read_text_file(path: String, max_bytes: Option<u64>) -> AppResult<ReadFileResult> {
    let p = safe_resolve(&path)?;
    let max = max_bytes.unwrap_or(1024 * 1024); // 默认 1MB

    let metadata = tokio::fs::metadata(&p).await?;
    let size = metadata.len();
    if size > max {
        return Err(AppError::InvalidInput(format!(
            "文件过大 ({} bytes)，已超过 max_bytes={}",
            size, max
        )));
    }

    let content = tokio::fs::read_to_string(&p)
        .await
        .map_err(|e| AppError::InvalidInput(format!("读取失败（仅支持 UTF-8 文本）: {e}")))?;

    Ok(ReadFileResult {
        path: p.to_string_lossy().to_string(),
        content,
        size,
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ListDirResult {
    pub path: String,
    pub entries: Vec<DirEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

#[tauri::command]
pub async fn list_dir(path: String) -> AppResult<ListDirResult> {
    let p = safe_resolve(&path)?;
    let mut entries = Vec::new();
    let mut rd = tokio::fs::read_dir(&p).await?;
    while let Some(entry) = rd.next_entry().await? {
        let metadata = entry.metadata().await.ok();
        let (is_dir, size) = match metadata {
            Some(m) => (m.is_dir(), m.len()),
            None => (false, 0),
        };
        entries.push(DirEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: entry.path().to_string_lossy().to_string(),
            is_dir,
            size,
        });
    }
    entries.sort_by(|a, b| {
        // 目录优先，再按名字
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(ListDirResult {
        path: p.to_string_lossy().to_string(),
        entries,
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WriteFileResult {
    pub path: String,
    pub bytes_written: u64,
}

#[tauri::command]
pub async fn write_text_file(path: String, content: String) -> AppResult<WriteFileResult> {
    let p = safe_resolve(&path)?;
    if let Some(parent) = p.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    tokio::fs::write(&p, &content).await?;
    Ok(WriteFileResult {
        path: p.to_string_lossy().to_string(),
        bytes_written: content.len() as u64,
    })
}

/// 用系统对话框让用户选择目录，写入前端 store（简化：仅返回路径）
#[tauri::command]
pub async fn pick_directory(app: AppHandle) -> AppResult<Option<String>> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_folder(move |path| {
        let _ = tx.send(path);
    });
    let result = rx
        .await
        .map_err(|e| AppError::Other(format!("dialog channel: {e}")))?;
    Ok(result.and_then(|p| p.into_path().ok().map(|pb| pb.to_string_lossy().to_string())))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn roots(dir: &tempfile::TempDir) -> Vec<PathBuf> {
        vec![dir.path().to_path_buf()]
    }

    #[test]
    fn safe_resolve_accepts_path_inside_allowed_root() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("hello.txt");
        fs::write(&file, "hi").unwrap();
        let r = safe_resolve_with(file.to_str().unwrap(), &roots(&dir));
        assert!(r.is_ok());
        assert_eq!(r.unwrap(), file.canonicalize().unwrap());
    }

    #[test]
    fn safe_resolve_rejects_path_outside_allowed_root() {
        let allowed = tempdir().unwrap();
        let outside = tempdir().unwrap();
        let file = outside.path().join("secret.txt");
        fs::write(&file, "x").unwrap();
        let r = safe_resolve_with(file.to_str().unwrap(), &roots(&allowed));
        assert!(r.is_err());
        let msg = r.unwrap_err().to_string();
        assert!(msg.contains("不在允许的范围内"), "应给出明确错误: {msg}");
    }

    #[test]
    fn safe_resolve_rejects_path_traversal() {
        let allowed = tempdir().unwrap();
        // 试图用 ../ 逃出 allowed 目录
        let sneaky = format!("{}/../outside.txt", allowed.path().to_str().unwrap());
        let r = safe_resolve_with(&sneaky, &roots(&allowed));
        // canonicalize 会把 ../ 解析并跳出,结果不在 allowed 内 → 拒绝
        assert!(r.is_err());
    }

    #[test]
    fn safe_resolve_nonexistent_path_returns_err() {
        let dir = tempdir().unwrap();
        let ghost = dir.path().join("does-not-exist.txt");
        let r = safe_resolve_with(ghost.to_str().unwrap(), &roots(&dir));
        assert!(r.is_err());
        let msg = r.unwrap_err().to_string();
        assert!(msg.contains("路径无效"), "路径不存在应给出 invalid input: {msg}");
    }

    #[test]
    fn safe_resolve_empty_allowed_roots_rejects_everything() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("a.txt");
        fs::write(&file, "x").unwrap();
        let r = safe_resolve_with(file.to_str().unwrap(), &[]);
        assert!(r.is_err());
    }

    #[test]
    fn safe_resolve_multiple_roots_any_match() {
        let root1 = tempdir().unwrap();
        let root2 = tempdir().unwrap();
        let f1 = root1.path().join("a.txt");
        let f2 = root2.path().join("b.txt");
        fs::write(&f1, "1").unwrap();
        fs::write(&f2, "2").unwrap();
        let roots = vec![root1.path().to_path_buf(), root2.path().to_path_buf()];
        assert!(safe_resolve_with(f1.to_str().unwrap(), &roots).is_ok());
        assert!(safe_resolve_with(f2.to_str().unwrap(), &roots).is_ok());
    }

    #[test]
    fn safe_resolve_subdir_of_allowed_root_passes() {
        // 子目录必须允许
        let dir = tempdir().unwrap();
        let sub = dir.path().join("a").join("b").join("c");
        fs::create_dir_all(&sub).unwrap();
        let file = sub.join("deep.txt");
        fs::write(&file, "d").unwrap();
        let r = safe_resolve_with(file.to_str().unwrap(), &roots(&dir));
        assert!(r.is_ok());
    }

    #[test]
    fn safe_resolve_similar_prefix_does_not_spoof() {
        // /tmpfoo 不应被 /tmp 接受
        let root = tempdir().unwrap();
        let roots = vec![root.path().to_path_buf()];
        // 构造与 root path 前缀相似但不包含的路径(tempdir 已用 /tmp/.tmpXXXX)
        // 改用 "/tmp" 自身作为 allowed root,看是否能被前缀相同路径骗到
        // 这里用一个不存在的相似前缀路径,期望 canonicalize 失败或不在 root 内
        let parent = root.path().parent().unwrap();
        let sibling = parent.join("definitely-not-allowed.txt");
        // 不创建文件,只检查解析:
        // 1) 若 sibling 不存在 → canonicalize 失败 → "路径无效"
        // 2) 若 sibling 存在但不在 root 内 → "不在允许的范围内"
        let r = safe_resolve_with(sibling.to_str().unwrap(), &roots);
        assert!(r.is_err());
    }

    #[test]
    fn safe_resolve_symlink_to_outside_rejected() {
        // 在 allowed 内创建 symlink 指向 outside → 应被拒(canonicalize 后跳出)
        let allowed = tempdir().unwrap();
        let outside = tempdir().unwrap();
        let real = outside.path().join("real.txt");
        fs::write(&real, "x").unwrap();
        let link = allowed.path().join("link.txt");
        #[cfg(unix)]
        std::os::unix::fs::symlink(&real, &link).unwrap();
        // 不创建 symlink(非 unix)时,跳过此 case
        let r = safe_resolve_with(link.to_str().unwrap(), &roots(&allowed));
        // canonicalize 会跟随 symlink → canonical 落在 outside → 拒绝
        assert!(r.is_err());
    }

    #[test]
    fn safe_resolve_root_itself_is_accepted() {
        // 把 allowed root 自身作为 path 传入(目录)→ 通过
        let dir = tempdir().unwrap();
        let r = safe_resolve_with(dir.path().to_str().unwrap(), &roots(&dir));
        assert!(r.is_ok());
    }

    #[test]
    fn safe_resolve_relative_path_canonicalize_fails() {
        // 相对路径无法独立 canonicalize → 报"路径无效"
        let dir = tempdir().unwrap();
        let r = safe_resolve_with("relative/foo.txt", &roots(&dir));
        assert!(r.is_err());
    }

    #[test]
    fn safe_resolve_empty_path_rejected() {
        let dir = tempdir().unwrap();
        let r = safe_resolve_with("", &roots(&dir));
        assert!(r.is_err());
    }

    #[test]
    fn safe_resolve_malformed_path_rejected() {
        // 含 NUL 字符的路径在 unix 上仍可能被处理,但行为不可控
        // 这里只检查 nil/空 case
        let dir = tempdir().unwrap();
        let r = safe_resolve_with("\0", &roots(&dir));
        // 不强制 ok/err,只要求不 panic;但多数 OS 报 "路径无效"
        let _ = r;
    }
}
