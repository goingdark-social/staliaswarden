# Staliaswarden

## Problem and Solution

I created this application in order to combat the spamming I got on my main email. There are many services like SimpleLogin, Anonaddy, etc. that let you create aliases for your main email.

I wanted to have one that works automatically through my password manager, Vault/Bitwarden that notifies my Stalwart email server to create the alias.

So whenever I want to register to a new website, I just create a new email alias through Bbitwarden and it just works.

## Setup

Clone this repo in your server.
Create a `.env` like `.env.example`.

- The `ALIAS_DOMAIN` should be your email domain (optional).
- `FORWARD_TO` should keep the main email all aliases will forward to.
- `STALWART_URL` is the domain (or IP) you host your stalwart instance (must include `/api` path).
- `PORT` is the app's port.

Run `docker compose up -d`.

## Usage

Generate an alias through the bitwarden browser extension.

1. Go to Generator -> Username -> Forwarded email alias.
2. Select Addy.io in the Service field.
3. Fill in your email domain.
4. Enter your Stalwart API token (this will be forwarded to Stalwart for authentication).
5. Fill in this app's url.

The service will forward your Stalwart API token directly to Stalwart to create aliases. No separate authentication is needed - each user provides their own Stalwart API token.

Now every time you create a new login you can ask a new username and it will create one in your stalwart instance which you can immediately use through bitwarden.
Cheers!
