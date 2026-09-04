# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.1.0] - 2026-09-04

### Fixed

- `x:MaskedEmail/set` no longer sends `accountId` as a method argument or `createdBy` as a create field. Stalwart derives both from the credentials that authenticate the request, and neither is part of the documented create shape. `createdBy` now shows the API key's description in the Account Manager.
- JMAP session discovery no longer fails when the session advertises no `primaryAccounts`. An API-key principal often has none, and the account is server-derived anyway.
- Request-level JMAP failures are no longer reported as axios' generic `Request failed with status code 4xx`. HTTP 401 and 403 now name the cause — a rejected API key, or a key missing the `sysMaskedEmailCreate` permission — and are forwarded to Bitwarden with the original status instead of a blanket 500.
- A missing, empty, or scheme-only (`Bearer`) `Authorization` header now returns a 401 that names Bitwarden's **API key** field, instead of the generic `Missing Authorization header`.
- Log writes to a non-writable directory no longer produce an `EACCES` line per log entry. The directory is probed once at startup; on failure the service warns once and logs to stdout only.
- `k8s/deployment.yaml` pinned a pre-v2 image (`main-e7962a1`) and set `STALWART_URL` with an `/api` suffix. Both are v1-era settings: the old image calls the REST `/principal` API that Stalwart removed in v0.16.0, which surfaces in Bitwarden as `Unable to determine principal from API key`. Now pinned to `:2` with a root `STALWART_URL`.

### Added

- `LOG_DIR` environment variable to point request/response logging at a writable volume.
- README section on creating the Stalwart API key (including the required `sysMaskedEmailCreate` permission) and a troubleshooting table mapping each error Bitwarden surfaces to its cause.

### Changed

- The Docker image runs as the non-root `node` user, owns its own log directory, and starts `node` directly rather than through `npm` so it works under `readOnlyRootFilesystem`.
- The Kubernetes deployment mounts an `emptyDir` for logs and enables `readOnlyRootFilesystem`.

---

## [2.0.0] - 2026-07-13

### ⚠️ Breaking Changes

**Stalwart v0.16+ Enterprise Edition is now required.**

The REST `/principal` API that staliaswarden previously called was removed in Stalwart v0.16.0. This release migrates entirely to the JMAP `x:MaskedEmail/set` API, which is an Enterprise-only feature. There is no migration path for Community Edition users — the feature simply does not exist in that edition.

**`STALWART_URL` must no longer include `/api`.**  
Set it to the root of your Stalwart instance: `https://stalwart.example.com`. The service discovers the JMAP endpoint automatically via `/.well-known/jmap`.

**Masked email addresses are now fully server-generated.**  
Previously you could supply a full `local@domain` address. Now only the domain (and an optional prefix hint derived from the site name) is accepted. Stalwart generates the local part.

### Changed

- Authentication is now per-user: each request must carry the caller's own Stalwart API token as a Bearer token. There are no longer shared service credentials.
- Stalwart's server-assigned masked email `id` is returned in the API response `data.id` field (was a client-generated timestamp in v1).

### Added

- JMAP session discovery via `/.well-known/jmap` then `/jmap/session`, with automatic fallback between paths.
- Explicit authentication error (HTTP 401/403) surfaced immediately with a clear message, rather than being swallowed as a connectivity failure.
- `forDomain`, `url`, and `emailPrefix` fields extracted from Bitwarden's auto-generated description and forwarded to Stalwart's MaskedEmail object so the alias appears correctly labelled in Account Manager.
- 5 s timeout on JMAP session discovery probes.
- Test suite (vitest + supertest) covering unit helpers and HTTP endpoints.

### Removed

- `uuid` dependency — IDs are now provided by Stalwart.
- `API_TOKEN`, `ALIAS_DOMAIN`, `FORWARD_TO`, `STALWART_USERNAME`, `STALWART_PASSWORD` environment variables (see `.env.example`).
- REST `/principal` API calls.

---

## [1.0.0] - initial release

Original staliaswarden implementation using Stalwart's REST `/principal` API.
