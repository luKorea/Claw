# Claw 客户端自动更新配置与发布流程

本文档记录 Claw 自动更新的密钥配置、GitHub Actions Secret 配置、发布流程、验证步骤和常见故障处理。

## 1. 基本原则

- 普通下载和自动更新是两条链路:
  - 普通下载: 用户从 GitHub Releases 下载 `.dmg`、`.msi`、`.AppImage`、`.deb`。
  - 自动更新: 已安装了带 updater 的客户端后,后续版本通过 `latest.json`、更新包和签名完成应用内更新。
- 自动更新必须使用签名校验:
  - 私钥只放本机安全位置和 GitHub Actions Secrets。
  - 公钥写进 `src-tauri/tauri.conf.json`。
- 私钥丢失后,已经安装的客户端无法继续接收新更新;私钥泄露会带来供应链风险。

## 2. 生成 updater key

推荐在本机生成正式 key:

```bash
pnpm tauri signer generate -w ~/.tauri/claw-client-updater.key
```

生成后会得到:

```text
Private: ~/.tauri/claw-client-updater.key
Public:  ~/.tauri/claw-client-updater.key.pub
```

如果生成时密码留空,后续 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 可以为空。  
如果生成时设置了密码,必须保存该密码,并配置到 GitHub Actions Secret。

## 3. 更新仓库中的公钥

查看公钥:

```bash
cat ~/.tauri/claw-client-updater.key.pub
```

把输出内容完整复制到:

```text
src-tauri/tauri.conf.json
```

位置:

```json
{
  "plugins": {
    "updater": {
      "pubkey": "这里填 .pub 文件内容",
      "endpoints": [
        "https://github.com/luKorea/Claw/releases/latest/download/latest.json"
      ]
    }
  }
}
```

注意: CI 使用的私钥必须和这里的公钥匹配,否则用户能手动下载,但应用内自动更新会签名校验失败。

## 4. 配置 GitHub Actions Secrets

在仓库根目录执行:

```bash
cd /Users/luhanguo/Desktop/claw-client
gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/claw-client-updater.key
```

如果 key 设置了密码:

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

然后按提示输入密码。

如果 key 没有密码,可以不配置 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。当前 workflow 会引用这个 secret,GitHub Actions 中未配置时会作为空值处理。

检查 secret 是否存在:

```bash
gh secret list
```

网页配置路径:

```text
GitHub 仓库 -> Settings -> Secrets and variables -> Actions -> New repository secret
```

需要配置:

```text
TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY_PASSWORD  # 仅当 key 有密码时需要
```

## 5. 本地构建验证

无密码 key:

```bash
TAURI_SIGNING_PRIVATE_KEY=~/.tauri/claw-client-updater.key TAURI_SIGNING_PRIVATE_KEY_PASSWORD= pnpm tauri build
```

有密码 key:

```bash
TAURI_SIGNING_PRIVATE_KEY=~/.tauri/claw-client-updater.key TAURI_SIGNING_PRIVATE_KEY_PASSWORD='你的密码' pnpm tauri build
```

成功后应该看到 updater artifact:

```text
src-tauri/target/release/bundle/macos/Claw.app.tar.gz
src-tauri/target/release/bundle/macos/Claw.app.tar.gz.sig
```

Windows / Linux 的产物会在对应平台 runner 中生成。

## 6. 发布流程

发布前确认版本:

```bash
node scripts/sync-release-version.mjs 0.1.4
pnpm typecheck
pnpm lint
pnpm test:run
cargo test --lib --manifest-path src-tauri/Cargo.toml
```

提交版本修改后推送 main:

```bash
git push origin main
```

创建并推送 release tag:

```bash
git tag v0.1.4
git push origin v0.1.4
```

当前 `.github/workflows/publish-release.yml` 会:

- 构建 Windows x64、macOS universal、Linux x64。
- 上传普通安装包。
- 使用 `TAURI_SIGNING_PRIVATE_KEY` 生成 updater 签名。
- 通过 `includeUpdaterJson: true` 上传 `latest.json`。

## 7. Release 验收清单

GitHub Release 中至少要确认:

- 普通安装包存在:
  - macOS: `.dmg`
  - Windows: `.msi` 或 `.exe`
  - Linux: `.AppImage` / `.deb`
- updater 资产存在:
  - macOS: `.tar.gz`
  - 对应 `.sig`
  - `latest.json`
- `latest.json` 中版本号等于 release 版本。
- `latest.json` 中平台 URL 指向本次 release 的资产。
- `latest.json` 中 signature 非空。

## 8. 用户升级路径

首次接入自动更新时:

1. 老用户安装的旧版本没有 updater,不会自动弹更新。
2. 需要先让用户手动下载并安装一个“带 updater 的基础版本”。
3. 从下一个更高版本开始,这些用户才会收到应用内自动更新提醒。

也就是说,自动更新真正生效至少需要两个版本:

```text
v0.1.4: 首个带 updater 的基础版本,用户手动安装
v0.1.5: 用户从 v0.1.4 应用内自动更新
```

## 9. 常见故障

### Release workflow 失败:缺少 signing key

检查 GitHub Secret:

```bash
gh secret list
```

确认存在:

```text
TAURI_SIGNING_PRIVATE_KEY
```

### 本地构建报 `incorrect updater private key password`

原因通常是:

- key 有密码但没有设置 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。
- key 没有密码但 CLI 尝试交互读取密码。

无密码 key 本地构建使用:

```bash
TAURI_SIGNING_PRIVATE_KEY=~/.tauri/claw-client-updater.key TAURI_SIGNING_PRIVATE_KEY_PASSWORD= pnpm tauri build
```

### 客户端提示有更新但安装失败

重点检查:

- `tauri.conf.json` 中的 `pubkey` 是否和 CI 私钥匹配。
- Release 中 `.sig` 是否存在。
- `latest.json` 是否指向正确资产。

### 用户完全收不到更新

重点检查:

- 用户当前安装的版本是否已经包含 updater。
- GitHub Release 是否包含 `latest.json`。
- `tauri.conf.json` endpoint 是否是:

```text
https://github.com/luKorea/Claw/releases/latest/download/latest.json
```

### 用户可以手动下载但不能自动更新

普通下载不依赖 updater 签名,自动更新依赖。优先检查私钥、公钥、`.sig` 和 `latest.json`。

## 10. 密钥备份建议

- 私钥文件: `~/.tauri/claw-client-updater.key`
- 公钥文件: `~/.tauri/claw-client-updater.key.pub`
- 如果设置了密码,密码必须一起备份。
- 建议放入密码管理器或加密磁盘。
- 不要提交到 Git。
- 不要通过聊天工具、邮件、issue、PR 描述传播私钥内容。
