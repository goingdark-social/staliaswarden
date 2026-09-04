# staliaswarden — Claude Code guidance

## Project overview

HTTP bridge between Bitwarden (masked email alias generator) and Stalwart Mail Server's JMAP API. Bitwarden calls this service using the Addy.io API shape; the service translates that into a `x:MaskedEmail/set` JMAP call.

**Requires Stalwart v0.16+ Enterprise Edition.** The old REST `/principal` API was removed in v0.16.0.

## Stack

- Node.js 22, pure ESM (`"type": "module"`)
- Express 5, axios, dotenv
- Tests: vitest + supertest (devDependencies)

## Key files

| File | Purpose |
|------|---------|
| `src/index.js` | Express app, route handlers, `getBaseLabel`, `extractDomainFromDescription` |
| `src/stalwart.js` | JMAP session discovery + `x:MaskedEmail/set` call |
| `src/config.js` | Reads `STALWART_URL` and `PORT` from env |
| `src/logger.js` | Structured request/response logging with secret redaction |

## Running tests

```bash
NODE_ENV=test npm test        # run once
npm run test:watch            # watch mode
```

Tests mock `axios`, `stalwart.js`, `logger.js`, and `config.js` — no live Stalwart instance needed.

## Environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `STALWART_URL` | Yes | Root URL of Stalwart, e.g. `https://stalwart.example.com`. **Must include the protocol (`https://`). No `/api` suffix.** |
| `PORT` | No | Default `3000` |
| `LOG_DIR` | No | Directory for request/response logs. Default `./logs`. Probed once at startup; if unwritable, file logging is disabled with a single warning and the service logs to stdout only. |

## Release process

Bump `"version"` in `package.json` and add a matching `## [x.y.z]` section to `CHANGELOG.md` as part of the PR. On merge to `main`:

1. Tests run (`NODE_ENV=test npm test`) — release is blocked on failure.
2. If the tag doesn't already exist, the workflow creates it, extracts the CHANGELOG section, appends GitHub's auto-generated commit list, and publishes a GitHub Release.
3. The same `release.yml` job then builds and pushes semver Docker image tags (`:2`, `:2.1`, `:2.1.0`, `:latest`) to `ghcr.io/goingdark-social/staliaswarden`. (`build-and-push.yml` only publishes branch/PR/sha tags; it has no tag trigger.)

Major version bumps must document breaking changes in `CHANGELOG.md` before merging.

## Architecture notes

- `discoverJmapSession` tries `/.well-known/jmap` then `/jmap/session`. Network errors skip to the next path; auth errors (401/403) throw immediately.
- The advertised `apiUrl` in the JMAP session is always rewritten to use the configured origin so traffic goes through the same host/proxy as `STALWART_URL`.
- `addAliasToStalwart`'s first parameter (`desiredAlias`) is always a bare domain (e.g. `example.com`), never a full email address. The JMAP server generates the local part.
- The `x:MaskedEmail/set` call sends no `accountId` method argument and no `createdBy` create field. Per Stalwart's schema reference both are server-set from the credentials that authenticate the request; the documented create shape omits them. Accepted create fields are `enabled`, `description`, `forDomain`, `url`, `emailPrefix`, `emailDomain`.
- Creating a masked email requires the `sysMaskedEmailCreate` permission on the API key. A 403 from the JMAP POST means the key authenticated but lacks it.
- `discoverJmapSession` reads `accountId` for logging only. A session with no `primaryAccounts` is still usable — API-key principals often advertise none.
- HTTP 401/403 from Stalwart are re-thrown with a `status` property so `handleCreateAlias` can forward the real status to Bitwarden instead of a blanket 500.
- All axios clients carry a `timeout`: 5 s for session-discovery probes (`axios.get` in `discoverJmapSession`), 10 s for the JMAP POST client built by `buildHttpClient`.
- `STALWART_URL` is validated as a well-formed URL (must include `https://`) at the top of `addAliasToStalwart`, giving a clear error before any network call.
- `getBaseLabel` has a known limitation: a bare ccTLD domain like `example.co.uk` (3 parts) is indistinguishable from `sub.example.com` (also 3 parts) without a public suffix list. The function returns the middle label (`co`). This matches the original `alias.js` behaviour and is documented in the unit tests.

## Code conventions

- No comments unless the WHY is non-obvious.
- No error handling for scenarios that can't happen — trust Express and axios guarantees.
- `export` only what tests need; keep the public surface minimal.
- `app.listen` is guarded by `process.env.NODE_ENV !== 'test'` so supertest can import the app without binding a port.
