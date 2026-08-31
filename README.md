# Discord Roblox Audio Converter

Bot Discord ini menukar audio yang anda miliki atau berlesen kepada satu fail OGG yang memenuhi spesifikasi teknikal Roblox: stereo, 48 kHz, kurang 7 minit dan kurang 20 MB. Ia mengekalkan mix asal (termasuk bass dan vokal), selain resampling dan peak limiter ringan untuk mengelakkan clipping.

Versi 2.1 menambah upload pukal sehingga 5 lagu dalam satu command, queue maksimum 10 fail aktif/menunggu, status kemajuan setiap lagu, semakan semula fail OGG sebelum upload, mesej ralat Roblox yang lebih jelas, dan eksport Asset ID dalam JSON serta Lua.

Versi semasa tidak mempunyai bayaran, langganan atau quota bulanan. Akses upload dikawal menggunakan server dan role Discord.

Bot ini **bukan** alat untuk memintas copyright detection atau moderation. Menukar format tidak memberikan hak untuk memuat naik lagu orang lain dan tidak menjamin Roblox akan menerima sesuatu aset.

## Persediaan

1. Pasang Node.js 20 atau lebih baru.
2. Cipta Discord Application dan Bot di Discord Developer Portal.
3. Aktifkan scope `bot` dan `applications.commands` ketika menjemput bot.
4. Salin `.env.example` kepada `.env`, kemudian masukkan token, application ID, dan test server ID.
5. Jalankan:

```powershell
npm install
npm run register
npm start
```

Selepas bot sudah dipasang pada server, jalankan `npm run register:guilds` jika anda mahu command muncul serta-merta pada server tersebut.

Jika `DISCORD_GUILD_ID` diisi, slash command muncul segera pada server tersebut. Tanpanya, command didaftarkan secara global dan mungkin mengambil masa untuk muncul.

## Penggunaan

Dalam Discord:

- `/roblox-audio` menukar fail dan menghantar OGG untuk anda upload sendiri.
- `/roblox-upload` menerima 1 hingga 5 fail dan pengesahan hak audio. Bot menggunakan OGG high quality 192 kbps, mengekalkan mix asal, upload satu demi satu melalui Open Cloud, kemudian memberi Asset ID serta fail `asset_ids.json` dan `sounds.lua`.
- Untuk satu fail, `name` boleh digunakan sebagai nama aset. Untuk beberapa fail, bot menggunakan nama setiap fail secara automatik. `description` digunakan untuk semua fail dalam batch.

Biarkan `normalize` off untuk mengekalkan mix asal. Setiap upload terus memerlukan pengesahan bahawa anda memiliki atau mempunyai lesen audio tersebut.

### Konfigurasi Roblox Open Cloud

Tetapkan secrets berikut pada host, bukan dalam GitHub atau mesej Discord:

- `ROBLOX_API_KEY` — API key dengan permission `asset:write` untuk creator yang dipilih.
- `ROBLOX_CREATOR_TYPE` — `Group` atau `User`.
- `ROBLOX_CREATOR_ID` — ID group/user Roblox.
- `ROBLOX_UPLOAD_GUILD_ID` — ID server Discord yang dibenarkan.
- `ROBLOX_UPLOAD_ROLE_ID` — ID role Discord yang boleh menggunakan `/roblox-upload`. Gunakan ID server/guild yang sama untuk membenarkan role `@everyone`.

Untuk group, gunakan akaun automasi khusus yang mempunyai permission group minimum yang diperlukan. Hadkan API key kepada permission dan IP sekecil yang praktikal, putar key jika terdedah, dan jangan gunakan tetapan IP terbuka melainkan host anda memerlukannya.

## Batas

- Input: MP3, OGG, WAV, FLAC, M4A, atau AAC; maksimum 25 MB.
- Output `/roblox-audio`: OGG Vorbis, stereo, 48 kHz, nominal 160 kbps.
- Output `/roblox-upload`: OGG Vorbis, stereo, 48 kHz, nominal 192 kbps.
- Durasi: maksimum 7 minit.
- Batch upload: maksimum 5 lagu bagi command; maksimum 10 fail aktif/menunggu.
- Satu conversion/upload berjalan pada satu masa untuk mengelakkan server kecil kehabisan CPU/RAM.

Had format, saiz dan durasi dirujuk daripada dokumentasi rasmi [Roblox Audio Assets](https://create.roblox.com/docs/audio/assets) dan [Open Cloud Assets](https://create.roblox.com/docs/cloud/guides/usage-assets).

## Deploy 24/7 di Railway

Repository ini mengandungi `Dockerfile`, jadi Railway akan mengesan dan membina container secara automatik.

1. Push folder ini sebagai repository GitHub tersendiri.
2. Di Railway, cipta project daripada repository GitHub tersebut.
3. Tambah variables `DISCORD_TOKEN` dan `DISCORD_CLIENT_ID`. Jangan upload fail `.env`.
4. Gunakan region Asia yang paling dekat dengan pengguna anda jika tersedia.
5. Dalam Service Settings, tetapkan Restart Policy kepada **Always**.
6. Deploy dan pastikan log menunjukkan `Bot aktif sebagai ...`.
7. Jalankan `npm run register:guilds` secara lokal setiap kali bentuk slash command berubah.

Railway Hobby ialah pilihan praktikal untuk bot kecil yang perlu sentiasa hidup. Kos sebenar bergantung pada RAM, CPU ketika FFmpeg memproses audio, storage, dan network egress. Tetapkan usage alert/limit dan semak anggaran selepas seminggu operasi.

Fail audio kerja disimpan sementara dalam direktori sistem dan dipadam selepas setiap job. Volume kekal tidak diperlukan untuk operasi bot semasa.
