# Security Policy

## Secrets

Never commit Discord bot tokens, Stripe keys, webhook secrets, or local `.env` files. Configure secrets through the hosting provider's encrypted environment-variable settings.

If a Discord token is ever printed, pasted into an issue, or included in a commit, reset it immediately in the Discord Developer Portal and replace the deployed secret.

## Reporting a vulnerability

Do not disclose exploitable vulnerabilities or credentials in a public GitHub issue. Contact the repository owner privately through their GitHub profile instead.
