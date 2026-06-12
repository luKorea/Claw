# Data Model: Client Auto Update

## UpdateCheckState

- `status`: `idle | checking | available | not-available | downloading | ready-to-restart | error`
- `currentVersion`: Current installed application version when available.
- `availableUpdate`: Optional `AvailableUpdate`.
- `progress`: Optional `UpdateProgress`.
- `message`: Optional user-facing status or error message.

## AvailableUpdate

- `version`: New release version.
- `date`: Optional release date.
- `body`: Optional release notes.
- `raw`: Opaque plugin update object kept by the wrapper for download/install.

## UpdateProgress

- `downloaded`: Bytes downloaded so far.
- `contentLength`: Optional total bytes.
- `percent`: Optional calculated percentage.

## UpdateManifest

- `version`: Latest release version.
- `notes`: Release notes.
- `pub_date`: Release publication date.
- `platforms`: Map keyed by platform target, each containing artifact `url` and `signature`.

## State Transitions

```text
idle -> checking
checking -> available
checking -> not-available
checking -> error
available -> downloading
downloading -> ready-to-restart
downloading -> error
ready-to-restart -> relaunch requested
error -> checking
```

## Validation Rules

- Update install may start only from `available`.
- Restart prompt may appear only after installation succeeds.
- Manual no-update result must be visible to the user.
- Silent startup errors should not interrupt normal app usage.
