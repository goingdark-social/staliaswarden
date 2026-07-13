# Staliaswarden

A privacy-focused email alias bridge between Bitwarden and Stalwart mail server.

Originally created by [romdim](https://github.com/romdim/staliaswarden). This is a heavily rewritten version developed for [goingdark.social](https://goingdark.social), a privacy-focused Mastodon instance in the Fediverse.

## Requirements

- **Stalwart Mail Server v0.16+** — the JMAP API used by this service replaced the REST API in v0.16.0.
- **Stalwart Enterprise Edition** — Masked Email is an Enterprise-only feature.

## Why We Rewrote It

The original staliaswarden was designed for single-user setups with shared credentials. For a privacy-respecting community like [goingdark.social](https://goingdark.social), this didn't meet our needs:

- **Per-User Authentication**: Each user authenticates with their own Stalwart API token. No shared credentials between users.
- **Masked Email via JMAP**: Uses Stalwart's `x:MaskedEmail/set` JMAP method — the address is generated server-side and appears cleanly in Stalwart's Account Manager UI.
- **Security Improvements**: Comprehensive request/response logging with secret redaction to prevent credential exposure.
- **Production-Ready**: Added Kubernetes manifests, better error handling, and multiple route compatibility for Bitwarden integration.

This aligns with our core privacy values: users control their own aliases, and no shared secrets are required.

## Problem and Solution

This application lets you create masked email addresses automatically through Bitwarden, which notify your Stalwart email server to create the alias. This helps combat spam on your main email by using unique masked addresses for each service.

Every time you create a new login, just generate a new username through Bitwarden and it will create a masked email in your Stalwart instance that you can immediately use.

## Setup

Clone this repo on your server. Create a `.env` like `.env.example`:

- `STALWART_URL` — base URL of your Stalwart instance, e.g. `https://stalwart.example.com`. No `/api` suffix.
- `PORT` — app's HTTP port (default `3000`).

Run `docker compose up -d`.

## Usage

Generate a masked email through the Bitwarden browser extension.

1. Go to **Generator → Username → Forwarded email alias**.
2. Select **Addy.io** in the Service field.
3. Fill in your email domain (the domain your masked addresses will use).
4. Enter your Stalwart API token — this is passed directly to Stalwart for authentication.
5. Fill in this app's URL as the API URL.

Now every time you create a new login you can generate a new username and Stalwart will create a masked email address for that site, visible in the Account Manager.

## Credits

- Original author: [romdim](https://github.com/romdim/staliaswarden) — Thank you for creating this useful tool!
- Rewrite developed for [goingdark.social](https://goingdark.social) — A privacy-focused Mastodon instance in the Fediverse.
- v0.16 JMAP migration inspired by [metaton8086](https://github.com/metaton8086/random).
