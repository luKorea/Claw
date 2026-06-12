# Quickstart: Client Auto Update

## Prerequisites

- GitHub Release publishing remains tag based: push `vX.Y.Z`.
- `TAURI_SIGNING_PRIVATE_KEY` is configured in GitHub Actions Secrets.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is configured only if the private key was generated with a password.
- The public key in `src-tauri/tauri.conf.json` matches the private key used by CI.

## Signing Key Setup

Generate a production key when preparing the first auto-update release:

```bash
pnpm tauri signer generate -w ~/.tauri/claw-client-updater.key
```

Then:

- Copy the generated public key into `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`.
- Store the private key content or private key path content in GitHub Actions Secret `TAURI_SIGNING_PRIVATE_KEY`.
- Store the key password in `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if the key has a password.
- Keep a secure backup of the private key and password; losing them breaks updates for already-installed apps.

## Local Verification

```bash
pnpm install
pnpm test:run src/lib/updater.test.ts src/components/updater/UpdatePrompt.test.tsx src/components/settings/AboutTab.test.tsx
pnpm typecheck
pnpm lint
cargo test --lib --manifest-path src-tauri/Cargo.toml
TAURI_SIGNING_PRIVATE_KEY=/path/to/claw-client-updater.key TAURI_SIGNING_PRIVATE_KEY_PASSWORD='...' pnpm tauri build
```

Expected outcome:

- Frontend tests cover startup check, manual check, update available, no update, error, progress, and restart prompt states.
- Tauri build succeeds and generates updater artifacts when signing environment variables are available.

## Manual End-to-End Scenario

1. Install an older Claw release locally.
2. Publish a newer tag release, for example `v0.1.4`.
3. Confirm the GitHub Release contains platform installers, updater artifacts, signatures, and `latest.json`.
4. Launch the older installed app.
5. Confirm an update prompt appears within 30 seconds.
6. Click `立即更新`.
7. Confirm progress is shown.
8. After installation completes, click restart.
9. Open About settings and confirm the app version matches the newer release.
10. Confirm conversations, prompts, API Key metadata, custom providers, and MCP servers still exist.

## Failure Scenarios

- Disconnect network and click `检查更新`: About settings should show a visible failure message.
- Temporarily remove `latest.json` from a test release: manual check should fail without breaking settings.
- Close the update prompt before clicking update: no download should start.
- Trigger download/install failure: the prompt should show a retryable error.
