# Discord Roblox Audio Converter

This Discord bot converts audio you own or are licensed to use into Roblox-compatible OGG files: stereo, 48 kHz, under 7 minutes, and under 20 MB. It keeps the original mix as much as possible, including bass and vocals, while applying Roblox-friendly conversion settings.

The bot can:

- show one simple `/menu` with buttons instead of confusing commands;
- accept 1-5 uploaded audio files;
- accept one public direct audio link from supported hosts;
- accept one public YouTube link, convert it to MP3, edit it, and upload it when YouTube allows the cloud server request;
- offer manual MP3/WAV upload, direct-link upload, and help-tip fallbacks when YouTube blocks the server;
- upload to Roblox Open Cloud and return the Asset ID, JSON, and Lua output;
- let each Discord server configure its own Roblox API key, creator type, and creator ID.

This bot does not include monthly subscriptions, payments, or quotas.

Important: this is not a copyright or moderation bypass tool. Converting audio does not give anyone permission to upload music they do not own, and Roblox moderation approval is never guaranteed.

## Setup

1. Install Node.js 22.5 or newer.
2. Create a Discord Application and Bot in the Discord Developer Portal.
3. Invite the bot with the `bot` and `applications.commands` scopes.
4. Copy `.env.example` to `.env`.
5. Add at least `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`.
6. Run:

```powershell
npm install
npm run register
npm start
```

For a public bot used in multiple servers, run:

```powershell
npm run register:global
```

Global slash commands can take time to appear in every server. If `DISCORD_GUILD_ID` is set, `npm run register` registers commands to that test server immediately.

## Recommended Discord workflow

For a new server:

1. Invite the bot.
2. A server admin opens `/menu`.
3. If the server is not configured, the bot opens a setup form.
4. Enter:
   - `ROBLOX_API_KEY`
   - `CREATOR_TYPE` as `Group` or `User`
   - `CREATOR_ID`
5. After setup, `/menu` shows normal upload options.

For Roblox setup:

- Create the API key at Roblox Creator Dashboard > Credentials.
- Required API key permissions: Assets `asset:read` and `asset:write`.
- For group uploads, add the Group ID in the API key access permissions.
- If `CREATOR_TYPE=Group`, `CREATOR_ID` must be the Roblox Group ID.
- If `CREATOR_TYPE=User`, `CREATOR_ID` must be the Roblox User ID.
- The server API key is stored encrypted and is never shown back in Discord.
- Before saving, the bot verifies that the selected Roblox User or Group exists.
- `/roblox-server status` shows only a short one-way API-key fingerprint, never the key itself.

## Discord commands

- `/menu` - easiest option. Opens the upload menu.
- `/history` - shows the latest 10 upload results and Asset IDs for this server.
- `/generate-music` - generates an original AI game soundtrack and optionally uploads it to Roblox.
- `/ai-status` - shows AI Music readiness and your remaining daily generations.
- `/audio-check` - gives a read-only audio health score before upload.
- `/panel` - posts a permanent button-based control panel (Manage Server permission required).
- `/lua-sound` - generates safe Roblox Studio scripts for one sound, playlists, random playback, or crossfades.
- `/roblox-help` - shows a private English help guide.
- `/roblox-server status` - shows this Discord server's Roblox creator setup.
- `/roblox-server set` - manually sets creator type and creator ID only.
- `/roblox-server role-add` - allows one Discord role to upload.
- `/roblox-server role-remove` - removes one role from the upload allowlist.
- `/roblox-server roles` - shows the current upload-role policy.
- `/roblox-server roles-clear` - allows every server member to upload again.
- `/roblox-server audit-channel` - sends upload results to a selected text channel.
- `/roblox-server audit-clear` - disables the audit log channel.
- `/roblox-server clear` - clears this server's Roblox setup.
- `/upload` - quick single-file upload flow.
- `/yt` - YouTube link flow.
- `/roblox-audio` - converts a file and sends back an OGG for manual upload.
- `/roblox-upload` - uploads 1-5 files directly to Roblox.

The easiest path for normal users is `/menu` > **Start Upload**, **Paste Link**, or **YouTube**.
Admins always retain upload access. If no upload roles are configured, every server member may upload.

The v4.1 menu is organized into Upload, Smart Tools, and Setup/Help rows. It shows the current Roblox destination and role access in an embed. **Developer Tools** explains the free commands, while both **Help Guide** and `/roblox-help` provide the complete admin and user workflow.

## Upload options

## Free audio tools

Use `/audio-check` to inspect codec, duration, file size, sample rate, channels, mean volume and peak headroom without uploading the file. The bot returns a 0-100 health score and practical recommendations.

Every health report now includes a generated waveform PNG. The permanent panel also includes **Check Audio**, so regular users do not need to remember the slash command.

Use `/lua-sound` with up to 20 Asset IDs to download a reviewed, dependency-free Luau script. Templates never use `loadstring`, HTTP downloads, or obfuscated code.

Admins can use `/panel` once in a chosen channel to post the shared Eclipse Audio control panel. Its buttons continue working after bot restarts because they use stable component IDs.

## AI music generation (Discord MVP)

Set `GEMINI_API_KEY` in Railway to enable Google Lyria. The optional `MUSIC_GENERATION_MODEL` defaults to `lyria-3.5`.

Use `/generate-music`, describe an original soundtrack, choose instrumental/vocal, duration and optional BPM, then choose whether to upload directly to Roblox. Without direct upload, the bot returns a Roblox-ready OGG preview. API errors, timeouts and rate limits are handled without exposing the key.

The easiest flow is `/menu` > **AI Music**. After generation, preview buttons let the same user upload directly to Roblox, generate a fresh variation, or discard the temporary result. Preview data expires after 15 minutes and is removed on restart.

Set `AI_DAILY_USER_LIMIT` (default `5`) to control API cost. Users can check their UTC daily allowance with `/ai-status`. Instrumental and vocal generations can also request a seamless loop suitable for Roblox background music.

Do not request an exact imitation of a named artist or copyrighted song.

All upload flows require the user to confirm that they own the audio or have a license to use it.

Supported file inputs:

- MP3
- OGG
- WAV
- FLAC
- M4A
- AAC

Supported public direct audio links:

- Dropbox
- Google Drive
- Discord CDN
- Cloudflare R2
- Amazon S3

Do not paste a YouTube page URL into **Paste Link**. Use the **YouTube** option for YouTube.

Audio speed choices:

- `0.75x` - slower
- `1x` - normal
- `1.25x` - slightly faster
- `1.5x` - faster
- `2x` - double speed

Pitch is not raised; the bot uses tempo adjustment.

Audio style choices:

- `Preserve Original` - keeps the original mix, bass, vocals, and dynamics as closely as possible.
- `Balanced Loudness` - applies loudness normalization.
- `Bass Boost` - applies a controlled low-frequency boost.
- `Vocal Clarity` - applies a controlled presence-frequency boost.

Optional trim:

- Enter `start-end` in seconds, such as `30-90`, to upload only that part of the audio.
- Leave it empty to process the complete audio.
- The final duration after trim and speed must remain under Roblox's 7-minute limit.

## Environment variables

Required for Discord:

- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID`
- `DISCORD_GUILD_ID` for fast test-server command registration

Optional default Roblox creator config:

- `ROBLOX_API_KEY`
- `CREATOR_TYPE` - `Group` or `User`
- `CREATOR_ID` - Roblox Group ID or User ID
- `ROBLOX_CREATOR_TYPE` and `ROBLOX_CREATOR_ID` are legacy aliases

Access controls for the default creator:

- `ROBLOX_UPLOAD_GUILD_ID`
- `ROBLOX_UPLOAD_GUILD_IDS`
- `ROBLOX_UPLOAD_ROLE_ID`
- `ROBLOX_UPLOAD_ROLE_IDS`
- `ROBLOX_DEFAULT_USER_IDS`

Per-server setup storage:

- `DATA_DIR=/app/data`
- `SERVER_CONFIG_SECRET` for a dedicated encryption secret
- `USER_COOLDOWN_SECONDS=10` to control per-user queue cooldown

If `SERVER_CONFIG_SECRET` is empty, the bot uses `DISCORD_TOKEN` as the encryption secret for per-server API keys.
For production, set a stable random `SERVER_CONFIG_SECRET` so rotating the Discord token does not make saved credentials unreadable.

Optional Roblox OAuth:

- `ROBLOX_OAUTH_CLIENT_ID`
- `ROBLOX_OAUTH_CLIENT_SECRET`
- `ROBLOX_OAUTH_REDIRECT_URI`

OAuth redirect URL format:

```text
https://YOUR-BOT-DOMAIN/oauth/roblox/callback
```

Required OAuth scopes:

- `openid`
- `profile`
- `asset:read`
- `asset:write`

## Limits

- Input file size: 25 MB maximum.
- Roblox output size: under 20 MB.
- Roblox duration: under 7 minutes after speed is applied.
- Batch upload: maximum 5 files per command.
- Queue: maximum 10 active/pending files globally and 5 pending files per user.
- Default queue cooldown: 10 seconds per accepted user job.
- Upload history: latest 500 records per Discord server on persistent storage.
- One conversion/upload runs at a time to avoid exhausting small Railway containers.

Audio limits are based on Roblox Audio Assets and Open Cloud Assets documentation.

## YouTube behavior

The YouTube feature uses `yt-dlp`. Docker installs a pinned verified binary.

Use YouTube only for public videos/audio that you own, are licensed to use, and are allowed to download. The bot does not use user cookies, does not open private content, and does not bypass DRM.

If YouTube blocks the Railway/cloud server, the bot will not ask for login. It will show three buttons:

- **Upload MP3/WAV Now** - upload the original file manually, then the bot continues editing and uploading to Roblox.
- **Paste Direct Link** - paste a public direct audio file link from a supported host.
- **YouTube Tips** - shows safe troubleshooting advice inside Discord.

Common open-source Discord music bots use the same practical stack: `yt-dlp` plus FFmpeg. Several projects also note that cloud/datacenter IPs may be blocked by YouTube, so the reliable production options are a manual/direct-link fallback or running the bot on a trusted home/server IP.

## Deploy 24/7 on Railway

This repository includes a `Dockerfile`, so Railway can build it automatically.

1. Push this folder to GitHub.
2. Create a Railway project from the GitHub repository.
3. Add Railway variables `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`.
4. Add `DATA_DIR=/app/data`.
5. Add a Railway volume mounted at `/app/data` so per-server API key setup survives restarts.
6. In Service Settings, set Restart Policy to **Always**.
7. Deploy.
8. Confirm logs show `Bot is online as ...`.
9. Run `npm run register:global` locally whenever slash command descriptions or options change.

Railway Hobby is a practical option for a small always-on bot. Actual cost depends on RAM, CPU used by FFmpeg, storage, and network egress. Set usage alerts/limits and review cost after the first week.

Temporary working audio files are stored in the system temp directory and deleted after each job. Persistent storage is only needed for encrypted server configuration and optional OAuth profiles.

Direct audio links are checked at every redirect, limited to four redirects and 25 MB, blocked if they resolve to internal/private network addresses, and rejected if they return HTML/JSON/XML instead of audio. Link query strings are not written to bot logs.
