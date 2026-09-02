# Discord Roblox Audio Converter

Bot Discord ini menukar audio yang anda miliki atau berlesen kepada satu fail OGG yang memenuhi spesifikasi teknikal Roblox: stereo, 48 kHz, kurang 7 minit dan kurang 20 MB. Ia mengekalkan mix asal (termasuk bass dan vokal), selain resampling dan peak limiter ringan untuk mengelakkan clipping.

Versi 2.5 menambah `/menu` sebagai satu pintu utama. Pengguna hanya perlu memilih butang fail atau YouTube, mengisi borang ringkas, mengesahkan hak audio, kemudian bot memprosesnya dan memberikan Asset ID, JSON serta Lua.

Versi 2.6 mendaftarkan command secara global dan menyokong allowlist beberapa server Discord tanpa membuka quota upload Roblox kepada server yang tidak diluluskan.

Versi 2.7 menambah **Paste Link Audio**: bot memuat turun satu fail audio public daripada host yang disokong, mengesahkan fail, auto-edit, upload ke Roblox, kemudian memberi Asset ID, JSON dan Lua.

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

Untuk bot yang digunakan pada beberapa server, jalankan `npm run register:global` supaya command tersedia pada semua server sekarang dan akan datang. `npm run register:guilds` hanya berguna untuk kemas kini segera pada server yang bot sudah sertai.

Jika `DISCORD_GUILD_ID` diisi, slash command muncul segera pada server tersebut. Tanpanya, command didaftarkan secara global dan mungkin mengambil masa untuk muncul.

## Penggunaan

Dalam Discord:

- `/menu` ialah cara paling mudah dan disyorkan. Tekan **Pilih Fail Audio** untuk membuka pemilih 1–5 fail, **Paste Link Audio** untuk menampal link fail public, atau **YouTube Auto Upload** untuk membuka borang YouTube. Tandakan pengesahan hak audio dan hantar.
- **Paste Link Audio** menyokong link public daripada Dropbox, Google Drive, Discord CDN, Cloudflare R2 dan Amazon S3. Bot terus download, periksa, convert, normalize, upload dan memulangkan Asset ID tanpa langkah tambahan.
- Untuk Dropbox, gunakan link share kepada satu fail. Untuk Google Drive, tetapkan akses fail kepada sesiapa yang mempunyai link. Link mestilah fail audio sebenar, bukan halaman login atau folder.
- Jangan tampal URL halaman YouTube ke **Paste Link Audio**; gunakan pilihan **YouTube Auto Upload**. API rasmi YouTube tidak menyediakan muat turun audio.
- `/upload` ialah cara lama untuk satu fail. `/yt` menerima link dan pengesahan hak dalam satu command, kemudian terus auto convert, edit dan upload tanpa butang kedua.
- Jika YouTube menyekat alamat server cloud, bot tidak meminta login/cookies. Ia terus menawarkan butang upload MP3/WAV supaya pengguna boleh menyelesaikan kerja tanpa memulakan semula `/menu`.
- `/roblox-audio` menukar fail dan menghantar OGG untuk anda upload sendiri.
- `/roblox-upload` menerima 1 hingga 5 fail dan pengesahan hak audio. Bot menggunakan OGG high quality 192 kbps dan loudness normalization −14 LUFS / −1.5 dB true peak seperti aplikasi GUI, upload satu demi satu melalui Open Cloud, kemudian memberi Asset ID serta fail `asset_ids.json` dan `sounds.lua`.
- `/roblox-help` menunjukkan panduan ringkas secara private dalam Discord.
- Untuk satu fail, `name` boleh digunakan sebagai nama aset. Untuk beberapa fail, bot menggunakan nama setiap fail secara automatik. `description` digunakan untuk semua fail dalam batch.

Biarkan `normalize` off untuk mengekalkan mix asal. Semua borang dan hasil `/menu` hanya dapat dilihat oleh pengguna yang membukanya. Setiap upload terus memerlukan pengesahan bahawa anda memiliki atau mempunyai lesen audio tersebut.

### Konfigurasi Roblox Open Cloud

Tetapkan secrets berikut pada host, bukan dalam GitHub atau mesej Discord:

- `ROBLOX_API_KEY` — API key dengan permission `asset:write` untuk creator yang dipilih.
- `ROBLOX_CREATOR_TYPE` — `Group` atau `User`.
- `ROBLOX_CREATOR_ID` — ID group/user Roblox.
- `ROBLOX_UPLOAD_GUILD_ID` — ID server Discord yang dibenarkan.
- `ROBLOX_UPLOAD_GUILD_IDS` — beberapa ID server tambahan, dipisahkan dengan koma.
- `ROBLOX_UPLOAD_ROLE_ID` — ID role Discord yang boleh menggunakan `/roblox-upload`. Gunakan ID server/guild yang sama untuk membenarkan role `@everyone`.
- `ROBLOX_UPLOAD_ROLE_IDS` — beberapa ID role tambahan; gunakan `*` untuk semua role dalam server yang sudah dibenarkan.

Untuk group, gunakan akaun automasi khusus yang mempunyai permission group minimum yang diperlukan. Hadkan API key kepada permission dan IP sekecil yang praktikal, putar key jika terdedah, dan jangan gunakan tetapan IP terbuka melainkan host anda memerlukannya.

## Batas

- Input: MP3, OGG, WAV, FLAC, M4A, atau AAC; maksimum 25 MB.
- Link audio: HTTPS sahaja, satu fail public daripada Dropbox, Google Drive, Discord CDN, Cloudflare R2 atau Amazon S3.
- Output `/roblox-audio`: OGG Vorbis, stereo, 48 kHz, nominal 160 kbps.
- Output `/roblox-upload`: OGG Vorbis, stereo, 48 kHz, nominal 192 kbps.
- Durasi: maksimum 7 minit.
- Batch upload: maksimum 5 lagu bagi command; maksimum 10 fail aktif/menunggu.
- Satu conversion/upload berjalan pada satu masa untuk mengelakkan server kecil kehabisan CPU/RAM.

Had format, saiz dan durasi dirujuk daripada dokumentasi rasmi [Roblox Audio Assets](https://create.roblox.com/docs/audio/assets) dan [Open Cloud Assets](https://create.roblox.com/docs/cloud/guides/usage-assets).

Fungsi YouTube menggunakan binary rasmi [yt-dlp](https://github.com/yt-dlp/yt-dlp) yang dipinkan dan disahkan checksum dalam Docker. Untuk penggunaan lokal, pasang yt-dlp dan tetapkan `YT_DLP_PATH` jika executable tidak berada dalam `PATH`.

Gunakan `/yt` hanya untuk video/audio yang anda miliki, berlesen, public dan dibenarkan untuk dimuat turun. Bot tidak menggunakan cookies pengguna, tidak membuka kandungan private dan tidak memintas DRM.

## Deploy 24/7 di Railway

Repository ini mengandungi `Dockerfile`, jadi Railway akan mengesan dan membina container secara automatik.

1. Push folder ini sebagai repository GitHub tersendiri.
2. Di Railway, cipta project daripada repository GitHub tersebut.
3. Tambah variables `DISCORD_TOKEN` dan `DISCORD_CLIENT_ID`. Jangan upload fail `.env`.
4. Gunakan region Asia yang paling dekat dengan pengguna anda jika tersedia.
5. Dalam Service Settings, tetapkan Restart Policy kepada **Always**.
6. Deploy dan pastikan log menunjukkan `Bot aktif sebagai ...`.
7. Jalankan `npm run register:global` secara lokal setiap kali bentuk slash command berubah.

Railway Hobby ialah pilihan praktikal untuk bot kecil yang perlu sentiasa hidup. Kos sebenar bergantung pada RAM, CPU ketika FFmpeg memproses audio, storage, dan network egress. Tetapkan usage alert/limit dan semak anggaran selepas seminggu operasi.

Fail audio kerja disimpan sementara dalam direktori sistem dan dipadam selepas setiap job. Volume kekal tidak diperlukan untuk operasi bot semasa.

Link audio diperiksa semula pada setiap redirect, dihadkan kepada empat redirect dan 25 MB, serta ditolak jika menuju ke alamat IP/rangkaian dalaman atau memulangkan HTML/JSON/XML. Query link tidak ditulis ke log bot. Pemeriksaan FFprobe tetap dijalankan sebelum FFmpeg dan upload Roblox.
