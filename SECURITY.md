# Security Policy

## Secrets

Never commit Discord bot tokens, Roblox API keys, webhook secrets, or local `.env` files. Configure secrets through the hosting provider's encrypted environment-variable settings.

Archives intended for sharing must not contain `.env`. The bot only needs deployed secrets from the hosting provider and never reads API keys from user attachments.

Do not ask Discord users to paste Roblox API keys, cookies, passwords, or login codes. Public users should connect Roblox through the official OAuth flow only. OAuth access and refresh tokens are stored encrypted on the server; keep `ROBLOX_OAUTH_CLIENT_SECRET` private and rotate it if exposed.

YouTube input is restricted to canonical single-video URLs. Do not add generic URL extraction, browser cookies, private-video authentication, or shell-based command construction. Keep yt-dlp pinned and verify its published checksum during container builds.

If a Discord token is ever printed, pasted into an issue, or included in a commit, reset it immediately in the Discord Developer Portal and replace the deployed secret.

## Reporting a vulnerability

Do not disclose exploitable vulnerabilities or credentials in a public GitHub issue. Contact the repository owner privately through their GitHub profile instead.
