# Discord Roblox Audio Converter

Bot Discord ini menukar audio yang anda miliki atau berlesen kepada satu fail OGG yang memenuhi spesifikasi teknikal Roblox: stereo, 48 kHz, kurang 7 minit dan kurang 20 MB. Ia mengekalkan mix asal (termasuk bass dan vokal), selain resampling dan peak limiter ringan untuk mengelakkan clipping.

Versi 2 menambah queue sehingga 5 kerja menunggu, status kemajuan, preset kualiti Compact/Standard/High, normalisasi loudness pilihan, dan pengoptimuman automatik apabila output menghampiri had upload Discord.

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

Dalam Discord, jalankan `/roblox-audio`, pilih lampiran audio, pilih kualiti jika perlu, dan biarkan `normalize` off untuk mengekalkan mix asal. Tunggu fail `*-roblox.ogg`, kemudian upload sendiri melalui Roblox Creator Dashboard atau Asset Manager.

## Batas

- Input: MP3, OGG, WAV, FLAC, M4A, atau AAC; maksimum 25 MB.
- Output: OGG Vorbis, stereo, 48 kHz, nominal 160 kbps.
- Durasi: maksimum 7 minit.
- Satu proses pada satu masa untuk mengelakkan server kecil kehabisan CPU/RAM.

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

Fail audio kerja disimpan sementara dalam direktori sistem dan dipadam selepas setiap job; volume kekal tidak diperlukan untuk converter sahaja. Sistem langganan memerlukan storan/database kekal dan belum termasuk dalam versi ini.
