# YouTube requirements comparison

This project remains a Node.js/discord.js Roblox uploader. The supplied Python MP3 bot specification is a review checklist, not a replacement architecture.

| Requirement | Existing implementation / status |
| --- | --- |
| Slash command and rights confirmation | `/yt` and menu modal exist; rights confirmation is required |
| URL validation | HTTPS host allowlist, canonical video ID, credentials/port rejection; playlist-only links rejected; video+playlist links process only the video |
| Metadata before download | Duration/live/playlist checks precede media download |
| Duration | 420 seconds retained for the Roblox flow; not increased to 900 |
| Final MP3 size | 25 MiB enforced after conversion; currently fixed, not environment configurable |
| MP3 output | Intermediate MP3 uses highest-quality setting; final output remains Roblox OGG, not a new 192 kbps Discord download command |
| Concurrency | Main queue processes one job globally; downloader guard also rejects overlapping calls |
| User cooldown | `USER_COOLDOWN_SECONDS` exists; users may queue multiple jobs within existing queue limits |
| Timeout | Child process bounded: metadata 60s and download/conversion 300s; currently fixed |
| Injection / filenames | `execFile` argument arrays without shell; canonical URL; fixed filenames inside randomized `mkdtemp` job directory |
| Cleanup | Handler removes temporary directory in `finally`; cleanup failure is currently swallowed, and abrupt process termination can leave files |
| Error classification | Bot/login/age/region, unavailable, HTTP denial/rate limit, timeout, size, missing downloader/FFmpeg, generic failure |
| UX | Reading/downloading, editing, uploading, Roblox processing; no separate intermediate MP3 conversion progress |
| Secrets | YouTube errors expose safe messages/codes; no account cookies enabled |
| Tests | URL validation, error redaction/classification, guard concurrency and failure recovery tested; real YouTube downloads and all cleanup/Discord failure paths are not fully integration-tested |

## Changes from this review

- Ignore debug lines and match HTTP status context, not arbitrary `429`/`403` substrings in IDs or build numbers.
- Distinguish region restrictions and missing FFmpeg.
- Prevent overlapping downloader calls even after the normal spacing interval elapses; release the slot on success or failure.

The earlier IPv4 diagnostic passed verbose output to the old classifier. Its reported `RATE_LIMIT` is not sufficient evidence of an actual HTTP 429; the original sanitized result did not preserve enough detail to establish that. The independently observed Discord `BOT_BLOCK` remains a separate result.

## Run and test

```sh
npm ci
npm test
npm start
```

Configure `.env` following README.md before starting. Do not run another live instance using the production Discord token alongside Railway. No Python packages or second bot are required.

Passing local tests does not establish that YouTube permits access from Railway. These changes do not bypass YouTube restrictions.
