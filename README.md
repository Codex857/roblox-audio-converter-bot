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

### Link Library

**Button workflow:** `/menu` → **Link Library** → **Add Original Audio**, **Saved Links**, or **Delete Saved Audio**. Add and delete use private forms with unchecked confirmation boxes. Manage Server permission is checked both when opening the panel and when submitting a form. Existing slash commands remain supported. Use a fresh `/menu` after deployment; an existing permanent `/panel` message needs to be reposted to show the new Library button.

Since v4.2.1, newly saved originals retain their sanitized filename (without the audio extension) as the upload title. Existing entries without title metadata keep the `Library <video ID>` fallback; missing or malformed metadata does not prevent use of the stored audio. No existing files are rewritten automatically.

Admins with **Manage Server** can save an authorized original audio file against a YouTube reference link:

1. `/library add link:<YouTube URL> file:<original audio> rights_confirm:True`
2. Use the same link in `/yt` or the **YouTube Link** menu. The bot checks this server's library first, bypassing the downloader and its cooldown for saved files. The existing speed, preset, rights confirmation and Roblox destination checks still apply.
3. `/library list` lists saved reference links.
4. `/library delete link:<URL> confirm:True` permanently removes that stored original. Restore by adding the original again. Copies already made for active upload jobs can still complete.

Only admins manage the library; users already allowed to upload may use saved entries in their own server. Files are stored under `DATA_DIR/link-library`, never shared across servers. Limit: 20 originals per server, each at most 25 MiB and validated using the existing audio duration checks. Run one replica with a persistent volume. Files remain until explicitly deleted; removing the bot does not automatically erase its library. Abrupt termination can leave `.pending-*` staging directories requiring administrator cleanup. Normal failed saves are cleaned immediately. Stored tracks currently use the YouTube video ID as their generated display title.

Register updated commands after deployment using `npm run register:global` and, if guild-specific commands were registered previously, `npm run register:guilds`. No new secret or login is needed. This feature does not download or unblock YouTube; missing entries still use the existing downloader/fallback flow.

The YouTube feature uses `yt-dlp`. Docker installs a pinned verified binary.

Use YouTube only for public videos/audio that you own, are licensed to use, and are allowed to download. The bot does not use user cookies, does not open private content, and does not bypass DRM.

If YouTube blocks the Railway/cloud server, the bot will not ask for login. It will show three buttons:

- **Upload MP3/WAV Now** - upload the original file manually, then the bot continues editing and uploading to Roblox.
- **Paste Direct Link** - paste a public direct audio file link from a supported host.
- **YouTube Tips** - shows safe troubleshooting advice inside Discord.

YouTube failures are classified separately: bot challenge, rate limit, access denied (403), age verification, login required, unavailable video, timeout, and downloader failure. Raw upstream error text is not sent to Discord or logged.

The bot does not refresh/restart and immediately retry a blocked download. Rate limits and bot challenges pause YouTube requests for 15 minutes; access denied pauses them for 1 minute. Other attempts are spaced at least 10 seconds apart. During a pause, new YouTube jobs receive a countdown without contacting YouTube; file and direct-link uploads remain available. Jobs are not automatically resumed. These guards are process-local and reset on restart; run a single bot replica. Restarting is not an unblock strategy.

The health endpoint retains `youtubeReady` for compatibility, meaning only that the downloader version check succeeded. `youtubeToolInstalled` makes this explicit, `youtubeAccessVerified` remains false (no live access probe), and `youtubeRequests` reports cooldown seconds and the last classified failure. These fields do not prove a particular video is downloadable.

No hosting provider or downloader can guarantee YouTube access. Use your owned/licensed original file, Link Library, or an authorized direct audio URL when YouTube is unavailable.

Upstream references: [yt-dlp extractor guidance](https://github.com/yt-dlp/yt-dlp/wiki/Extractors) and [PO Token guide](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide). Account cookies and third-party token providers are not enabled by this bot.

## Deploy 24/7

Best practical options:

- **VPS with Docker Compose** - best control and most stable for a Discord bot with FFmpeg/yt-dlp. Recommended if Railway keeps getting blocked.
- **Fly.io** - easy Docker deployment with a Singapore region and one always-on machine.
- **Render worker** - simple GitHub-based deployment, but still a cloud/datacenter IP like Railway.
- **Railway** - already supported and working for bot uptime, but YouTube may still block its server IP.

Important: changing host can reduce or change YouTube blocking behavior, but no cloud host can guarantee YouTube access. The bot remains designed to use safe fallbacks: upload MP3/WAV, direct public audio link, and Link Library.

### VPS Docker Compose setup

Use this when you want the bot to run without your PC and without depending on Railway.

1. Rent a small Ubuntu VPS with at least 1 GB RAM.
2. Install Docker and Docker Compose.
3. Clone this repository.
4. Copy `.env.example` to `.env` and fill your real secrets.
5. Start the bot:

```bash
docker compose up -d --build
```

Check status:

```bash
docker compose ps
docker compose logs -f eclipse-audio-bot
curl http://127.0.0.1:3000/health
```

Update after pushing new GitHub code:

```bash
git pull
docker compose up -d --build
```

This uses the included `docker-compose.yml`, keeps `/app/data` in a Docker volume, and restarts automatically after server reboot.

### VPS PM2 setup

Use this only if you do not want Docker.

```bash
npm ci --omit=dev
npm install -g pm2
pm2 start deploy/pm2.ecosystem.config.cjs
pm2 save
pm2 startup
```

The VPS must also have Node.js 22.5+, FFmpeg, ffprobe, and `yt-dlp` installed.

### Fly.io setup

The repository includes `fly.toml`.

```bash
fly launch --no-deploy
fly volumes create eclipse_audio_data --size 1 --region sin
fly secrets set DISCORD_TOKEN=... DISCORD_CLIENT_ID=... SERVER_CONFIG_SECRET=... API_KEY=...
fly deploy
```

Keep one machine running. Do not scale to multiple replicas because Discord commands, upload queues, and YouTube guards are process-local.

### Render setup

The repository includes `render.yaml` for a Docker worker.

1. Create a new Render Blueprint from this GitHub repository.
2. Add secret environment variables in Render.
3. Deploy one worker instance.

Render workers do not expose a public web service by default. If you need the `/health` or `/convert` HTTP endpoints publicly on Render, create a Render Web Service from the same Dockerfile instead of the worker blueprint.

## Railway setup

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

## Optional private YouTube MP3 API

Version 4.4.1 adds `/convert` and `/api/download` aliases without removing the old
endpoint. `API_KEY` is the preferred secret; `YOUTUBE_API_KEY` remains supported.
Both `X-API-Key` and `Authorization: Bearer` are accepted. Keep the existing
`rights_confirm: true` field as well as `url`. Do not put the key in the URL.

To run only the API locally (no Discord login), install Node 22.5+, run `npm ci`,
install the pinned yt-dlp version from the Dockerfile, set `YT_DLP_PATH` and `API_KEY`
in an ignored `.env`, then run `npm run start:api`. Generate a new secret privately
using `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
Never paste its output in an issue or commit it. Standalone startup refuses a missing
key or unavailable FFmpeg, ffprobe, or downloader. The combined Discord process
continues to disable the API when no key is configured so existing bot features remain usable.

Railway: use the existing Dockerfile and volume, set `API_KEY` in service Variables,
keep the existing start command for Discord plus API, or use `npm run start:api` for
a dedicated API service. Bind uses `0.0.0.0:$PORT`. Verify health fields `ffmpeg`,
`ffprobe`, and `yt_dlp`, then POST a permitted video with authentication.

Download and conversion are separate stages. MP3 output uses 192 kbps, is checked
with ffprobe, and is returned directly. Logs contain job ID and stage elapsed times,
not source URLs, credentials or raw stderr. `X-Job-Id` correlates a response with logs.
An extractor adapter with `extract(options)` can replace the source acquisition layer
while retaining conversion. No alternative provider or access-control bypass is installed.
Timeouts return 504, conversion failures 500, blocked/restricted sources 422.

Set `YOUTUBE_API_KEY` to a separate random secret of at least 32 characters to enable
`POST /api/youtube/mp3` on the existing HTTP server. Empty means disabled. Do not
put this key in frontend JavaScript, Discord messages, URLs, or Git. Use HTTPS in
production. This is a private backend endpoint, not a public multi-user API.

Send `Authorization: Bearer <key>` and `Content-Type: application/json` with:

```json
{"url":"https://www.youtube.com/watch?v=VIDEO_ID","rights_confirm":true}
```

Only submit content you own or are permitted to download. Success returns an
`audio/mpeg` attachment directly (not a permanent public download URL). Errors
return `{ "success": false, "data": null, "error": { "code": "...", "message": "..." } }`.
Status codes include 400 invalid input, 401 authentication, 404 disabled,
405 method, 413 size, 415 content type, 429 busy/cooldown, and 502 upstream failure.

The API uses the SAME downloader and global YouTube guard as Discord; the bot
does not make a redundant HTTP call to itself. Existing Discord upload workflows
remain unchanged. Requests are limited to 4 KB, one active API job, and a 10-second
interval after each job. Existing 7-minute / 25 MB audio limits still apply.
Metadata and download stages have bounded timeouts; allow up to six minutes at
your client/reverse proxy. A client disconnect does not cancel an extraction already
running: it finishes or times out before cleanup. Files are removed after streaming
or failure; a process/container crash can leave temporary files until host cleanup.
No queue, persistent cache, public file storage, account cookies, or third-party
download API is added. Deployment remains single-replica because guards are in memory.

This endpoint does NOT remove YouTube bot verification or IP restrictions.
`BOT_BLOCK` is reported as an error, never as a successful download. Tests use
injected fixture downloads and do not prove live YouTube access.

Direct audio links are checked at every redirect, limited to four redirects and 25 MB, blocked if they resolve to internal/private network addresses, and rejected if they return HTML/JSON/XML instead of audio. Link query strings are not written to bot logs.
