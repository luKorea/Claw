# Research: Client Auto Update

## Decision: Use Tauri 2 official updater plugin

**Rationale**: The project is a Tauri 2 desktop app and the official updater plugin provides update discovery, signature verification, download, install, and integration with Tauri packaging.

**Alternatives considered**:

- Custom GitHub Releases API check plus manual download link: easier to display, but does not solve signed installation or restart flow.
- Custom downloader/installer: high platform risk and unnecessary compared with Tauri's maintained updater.

## Decision: Use GitHub Releases `latest.json` as update endpoint

**Rationale**: The current project already publishes desktop artifacts from `v*` tags through GitHub Releases. A static manifest keeps the update channel aligned with the existing release flow.

**Alternatives considered**:

- Dedicated update server: more flexible, but adds hosting and operational complexity.
- S3 or CDN manifest: useful later if GitHub access becomes a problem, but not needed for the first release.

## Decision: Prompt before download and install

**Rationale**: The app is a local desktop client that may be used during long AI conversations. Explicit confirmation avoids interrupting the user and avoids surprising network/download behavior.

**Alternatives considered**:

- Silent download and install: smoother when everything works, but harder to explain and riskier if a user is on a limited network.
- Manual-only updates: safe, but misses the core value of automatic update detection.

## Decision: Keep update state in memory

**Rationale**: The feature does not need durable update history. A fresh check on startup/About is simpler and avoids extra database migrations.

**Alternatives considered**:

- Store dismissed versions: useful for advanced behavior, but not necessary for the first version and can hide important security updates.

## Decision: Use updater signing secrets in CI only

**Rationale**: Update signing private keys are supply-chain secrets. The repository should contain only the public key and release workflow references to secret names.

**Alternatives considered**:

- Commit a development key: unsafe because users could install builds signed by a public private key.
- Require local manual signing for every release: too easy to skip and inconsistent with existing tag-based release automation.
