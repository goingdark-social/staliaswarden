# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
