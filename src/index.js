import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  PermissionFlagsBits
} from "discord.js";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { canUseRobloxUpload, createRobloxUploader } from "./roblox.js";
import { createRobloxOAuth } from "./roblox-oauth.js";
import { GuildConfigStore, normalizeCreatorConfig } from "./guild-config-store.js";
import {
  directAudioUploadModal,
  fileUploadModal,
  mainMenuComponents,
  robloxServerSetupModal,
  youtubeFallbackComponents,
  youtubeUploadModal
} from "./menu.js";
import { startServer } from "./server.js";
import { buildUploadExports } from "./upload-results.js";
import { checkYouTubeTool, downloadYouTubeMp3, normalizeYouTubeUrl } from "./youtube.js";
import { downloadDirectAudio, normalizeDirectAudioUrl } from "./direct-audio.js";
import {
  DISCORD_SAFE_MAX_BYTES,
  assetDisplayName,
  convertAudio,
  downloadAttachment,
  inspectAudio,
  inspectConvertedAudio,
  normalizeAudioSpeed,
  safeBaseName,
  validateAttachment
} from "./audio.js";

const token = process.env.DISCORD_TOKEN;
const BOT_VERSION = "2.8.0";
const ytDlpPath = process.env.YT_DLP_PATH?.trim() || "yt-dlp";
const dataDirectory = process.env.DATA_DIR?.trim() || join(process.cwd(), "data");
const robloxOAuthRedirectUri = process.env.ROBLOX_OAUTH_REDIRECT_URI?.trim()
  || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/oauth/roblox/callback` : "");
if (!token) throw new Error("DISCORD_TOKEN belum ditetapkan dalam fail .env.");
if (!ffmpegPath || !ffprobeStatic.path) throw new Error("FFmpeg atau FFprobe tidak tersedia.");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const defaultRoblox = createRobloxUploader({
  apiKey: process.env.ROBLOX_API_KEY,
  creatorType: process.env.ROBLOX_CREATOR_TYPE,
  creatorId: process.env.ROBLOX_CREATOR_ID
});
const robloxOAuth = await createRobloxOAuth({
  clientId: process.env.ROBLOX_OAUTH_CLIENT_ID,
  clientSecret: process.env.ROBLOX_OAUTH_CLIENT_SECRET,
  redirectUri: robloxOAuthRedirectUri,
  dataDirectory
});
const guildConfigStore = await new GuildConfigStore({
  directory: join(dataDirectory, "guild-creator-configs")
}).init();
const deployedUploadGuildIds = [
  process.env.ROBLOX_UPLOAD_GUILD_IDS,
  "1412169906140741725"
].filter(Boolean).join(",");
const robloxAccess = {
  guildId: process.env.ROBLOX_UPLOAD_GUILD_ID,
  guildIds: deployedUploadGuildIds,
  roleId: process.env.ROBLOX_UPLOAD_ROLE_ID,
  roleIds: process.env.ROBLOX_UPLOAD_ROLE_IDS,
  userIds: process.env.ROBLOX_UPLOAD_USER_IDS
};
const jobQueue = [];
const quickUploadConfirmations = new Map();
const defaultUploaderUsers = new Set(String(process.env.ROBLOX_DEFAULT_USER_IDS || process.env.ROBLOX_UPLOAD_USER_IDS || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean));
const MAX_PENDING_FILES = 10;
const MAX_PENDING_FILES_PER_USER = 5;
const QUICK_CONFIRM_MS = 60_000;
let activeFileCount = 0;
let activeUserId = null;
let processing = false;
let youtubeReady = false;
let youtubeToolVersion = null;

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Bot aktif sebagai ${readyClient.user.tag}`);
  try {
    const application = await readyClient.application.fetch();
    if (application.owner?.id) defaultUploaderUsers.add(application.owner.id);
    if (application.owner?.members) {
      for (const member of application.owner.members.values()) {
        if (member.user?.id) defaultUploaderUsers.add(member.user.id);
      }
    }
  } catch (error) {
    console.warn("Tidak dapat membaca owner app Discord:", error instanceof Error ? error.message : error);
  }
});

client.on(Events.Error, (error) => {
  console.error("Discord client error:", error);
});

client.on(Events.GuildCreate, (guild) => {
  const channel = guild.systemChannel || guild.channels.cache.find((item) =>
    item?.isTextBased?.() && item.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.SendMessages)
  );
  if (!channel?.send) return;
  void channel.send({
    content: [
      "Terima kasih invite bot audio Roblox.",
      "Sebelum upload digunakan di server ini, admin perlu set destinasi Roblox:",
      "`/roblox-server set creator_type:Group creator_id:ID_GROUP_ROBLOX`",
      "Selepas itu setiap user guna `/roblox-account` untuk connect Roblox sendiri. Upload akan pergi ke creator ID server ini jika akaun Roblox user itu ada permission."
    ].join("\n"),
    allowedMentions: { parse: [] }
  }).catch(() => {});
});

void checkYouTubeTool(ytDlpPath)
  .then((version) => {
    youtubeReady = true;
    youtubeToolVersion = version;
    console.log(`YouTube downloader aktif: yt-dlp ${version}`);
  })
  .catch((error) => {
    console.error("YouTube downloader tidak tersedia:", error.message);
  });

function jobFileCount(job) {
  return job.attachments?.length || (job.youtube || job.directAudio ? 1 : 0);
}

function pendingFileCount() {
  return activeFileCount + jobQueue.reduce((total, job) => total + jobFileCount(job), 0);
}

function pendingFileCountForUser(discordUserId) {
  const active = activeUserId === discordUserId ? activeFileCount : 0;
  const queued = jobQueue
    .filter((job) => job.interaction?.user?.id === discordUserId)
    .reduce((total, job) => total + jobFileCount(job), 0);
  return active + queued;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : "Ralat tidak diketahui.";
}

function safeDiscordText(value) {
  return String(value).replace(/([\\`*_~|>])/g, "\\$1").slice(0, 180);
}

function speedText(speed = 1) {
  return `${normalizeAudioSpeed(speed)}x`;
}

function editStatus(interaction, content) {
  return interaction.editReply({ content, allowedMentions: { parse: [] } });
}

function makeRobloxConnectButton(discordUserId) {
  if (!robloxOAuth.configured) return [];
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Connect Roblox")
      .setStyle(ButtonStyle.Link)
      .setURL(robloxOAuth.createAuthorizationUrl(discordUserId))
  )];
}

function disconnectRobloxComponents() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("roblox-account:disconnect")
      .setLabel("Disconnect Roblox")
      .setStyle(ButtonStyle.Danger)
  )];
}

function canUseDefaultRoblox(interaction) {
  return defaultRoblox.configured
    && defaultUploaderUsers.has(interaction.user.id)
    && canUseRobloxUpload(interaction, robloxAccess);
}

function resolveUploadTarget(interaction) {
  const guildConfig = interaction.guildId ? guildConfigStore.get(interaction.guildId) : null;
  if (canUseDefaultRoblox(interaction)) {
    return {
      uploader: defaultRoblox,
      label: `${defaultRoblox.creatorType} ${defaultRoblox.creatorId}`
    };
  }
  if (interaction.guildId && !guildConfig) return null;

  const profile = robloxOAuth.getPublicProfile(interaction.user.id);
  if (profile) {
    const creatorType = guildConfig?.creatorType || "User";
    const creatorId = guildConfig?.creatorId || profile.robloxUserId;
    return {
      uploader: createRobloxUploader({
        creatorType,
        creatorId,
        accessTokenProvider: () => robloxOAuth.getAccessToken(interaction.user.id)
      }),
      label: guildConfig
        ? `${creatorType} ${creatorId} (server ini)`
        : `${profile.username} (${profile.robloxUserId})`
    };
  }
  return null;
}

async function replyUploadTargetRequired(interaction) {
  const guildConfig = interaction.guildId ? guildConfigStore.get(interaction.guildId) : null;
  const content = robloxOAuth.configured
    ? [
        "❌ Sila connect akaun Roblox anda dahulu dengan `/roblox-account`.",
        guildConfig
          ? `Server ini sudah diset ke Roblox ${guildConfig.creatorType} ${guildConfig.creatorId}.`
          : "Admin server boleh set destinasi server dengan `/roblox-server set` supaya upload tidak masuk creator yang salah."
      ].join("\n")
    : "❌ Roblox OAuth belum dikonfigurasi oleh pemilik bot. Buat masa ini hanya pemilik bot yang boleh upload ke creator default.";
  await interaction.reply({
    content,
    components: robloxOAuth.configured ? makeRobloxConnectButton(interaction.user.id) : [],
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] }
  });
}

function quickUploadComponents(requestId) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`quick-upload:${requestId}:confirm`)
      .setLabel("Saya ada hak — Upload")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`quick-upload:${requestId}:cancel`)
      .setLabel("Batal")
      .setStyle(ButtonStyle.Secondary)
  )];
}

async function processConversionJob({ interaction, attachments, quality, normalize, speed = 1 }) {
  const attachment = attachments[0];
  let workDir;

  try {
    await interaction.editReply("⏬ Memuat turun audio…");
    workDir = await mkdtemp(join(tmpdir(), "roblox-audio-"));
    const inputPath = join(workDir, `${randomUUID()}${extname(attachment.name || ".audio")}`);
    const outputName = `${safeBaseName(attachment.name)}-roblox.ogg`;
    const outputPath = join(workDir, outputName);

    await downloadAttachment(attachment, inputPath);
    await interaction.editReply("🔎 Memeriksa durasi dan format audio…");
    await inspectAudio(ffprobeStatic.path, inputPath, { speed });
    await interaction.editReply(`🎛️ Menukar audio (${quality}, ${normalize ? "normalize" : "mix asal"}, ${speedText(speed)})…`);
    await convertAudio(ffmpegPath, inputPath, outputPath, { quality, normalize, speed });

    let effectiveQuality = quality;
    let outputStat = await stat(outputPath);
    if (outputStat.size > DISCORD_SAFE_MAX_BYTES && quality !== "compact") {
      await interaction.editReply("📦 Output terlalu besar untuk Discord; mengoptimumkan bitrate…");
      effectiveQuality = "compact";
      await convertAudio(ffmpegPath, inputPath, outputPath, { quality: effectiveQuality, normalize, speed });
      outputStat = await stat(outputPath);
    }
    const output = await inspectConvertedAudio(ffprobeStatic.path, outputPath);
    if (outputStat.size > DISCORD_SAFE_MAX_BYTES) {
      throw new Error("Fail siap melebihi had penghantaran Discord walaupun sudah dioptimumkan.");
    }

    await interaction.editReply("📤 Menghantar fail siap…");
    await interaction.editReply({
      content: [
        `✅ Siap: OGG stereo 48 kHz · ${(output.duration / 60).toFixed(2)} minit · ${(output.size / 1024 / 1024).toFixed(2)} MB.`,
        `Kualiti: ${effectiveQuality}${normalize ? " · loudness dinormalisasi" : " · mix asal dikekalkan"} · speed ${speedText(speed)}.`,
        "Upload hanya jika anda memiliki atau mempunyai lesen untuk audio ini. Kelulusan moderation Roblox tidak dijamin."
      ].join("\n"),
      files: [{ attachment: outputPath, name: outputName }],
      allowedMentions: { parse: [] }
    });
  } catch (error) {
    await interaction.editReply({
      content: `❌ Tak dapat memproses audio: ${errorMessage(error)}`,
      files: [],
      allowedMentions: { parse: [] }
    });
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function startUploadOne({ interaction, attachment, index, total, requestedName, description, uploader, speed = 1 }) {
  let workDir;
  const displayName = requestedName
    ? assetDisplayName(requestedName, { stripExtension: false })
    : assetDisplayName(attachment.name);

  try {
    await editStatus(interaction, `⏬ [${index}/${total}] Memuat turun **${safeDiscordText(attachment.name)}**…`);
    workDir = await mkdtemp(join(tmpdir(), "roblox-upload-"));
    const inputPath = join(workDir, `${randomUUID()}${extname(attachment.name || ".audio")}`);
    const outputName = `${safeBaseName(attachment.name)}-roblox.ogg`;
    const outputPath = join(workDir, outputName);

    await downloadAttachment(attachment, inputPath);
    await editStatus(interaction, `🔎 [${index}/${total}] Memeriksa **${safeDiscordText(attachment.name)}**…`);
    await inspectAudio(ffprobeStatic.path, inputPath, { speed });
    await editStatus(interaction, `🎛️ [${index}/${total}] Menukar ke OGG high quality, loudness sama, speed ${speedText(speed)}…`);
    await convertAudio(ffmpegPath, inputPath, outputPath, { quality: "high", normalize: true, speed });
    await inspectConvertedAudio(ffprobeStatic.path, outputPath);

    await editStatus(interaction, `☁️ [${index}/${total}] Upload **${safeDiscordText(displayName)}** ke Roblox…`);
    const operationPath = await uploader.upload({
      filePath: outputPath,
      fileName: outputName,
      displayName,
      description
    });
    return { index, name: displayName, operationPath };
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function replyWithUploadResults(interaction, results) {
  const successful = results.filter((result) => result.assetId);
  const failed = results.filter((result) => result.error);
  const summary = [
    `${successful.length ? "✅" : "❌"} Selesai: ${successful.length}/${results.length} upload berjaya.`,
    ...successful.map((result) => `✅ ${safeDiscordText(result.name)} — **${result.assetId}**`),
    ...failed.map((result) => `❌ ${safeDiscordText(result.name)} — ${safeDiscordText(result.error)}`),
    successful.length ? "Fail JSON dan Lua dilampirkan. Gunakan audio hanya mengikut hak/lesen anda." : "Tiada aset berjaya diupload."
  ];
  const files = [];
  if (successful.length) {
    const exported = buildUploadExports(successful);
    files.push(
      { attachment: Buffer.from(exported.json, "utf8"), name: "asset_ids.json" },
      { attachment: Buffer.from(exported.lua, "utf8"), name: "sounds.lua" }
    );
  }

  await interaction.editReply({
    content: summary.join("\n").slice(0, 1950),
    files,
    components: [],
    allowedMentions: { parse: [] }
  });
}

async function processUploadJob({ interaction, attachments, upload, uploader, speed = 1 }) {
  const results = [];
  const started = [];

  for (let index = 0; index < attachments.length; index += 1) {
    const attachment = attachments[index];
    const requestedName = attachments.length === 1 ? upload.name : null;
    try {
      started.push(await startUploadOne({
        interaction,
        attachment,
        index: index + 1,
        total: attachments.length,
        requestedName,
        description: upload.description,
        uploader,
        speed
      }));
    } catch (error) {
      results.push({
        index: index + 1,
        name: requestedName
          ? assetDisplayName(requestedName, { stripExtension: false })
          : assetDisplayName(attachment.name),
        error: errorMessage(error)
      });
    }
  }

  if (started.length) {
    await editStatus(
      interaction,
      `⏳ Menunggu Roblox memproses ${started.length} audio secara serentak…`
    );
    const completed = await Promise.all(started.map(async (item) => {
      try {
        const assetId = await uploader.waitForAsset(item.operationPath);
        return { index: item.index, name: item.name, assetId };
      } catch (error) {
        return { index: item.index, name: item.name, error: errorMessage(error) };
      }
    }));
    results.push(...completed);
  }

  results.sort((left, right) => left.index - right.index);
  await replyWithUploadResults(interaction, results);
}

async function processDirectAudioUploadJob({ interaction, directAudio, uploader }) {
  let workDir;
  let displayName = "Audio Link";

  try {
    await editStatus(interaction, "🌐 Membaca link dan memuat turun fail audio…");
    workDir = await mkdtemp(join(tmpdir(), "roblox-direct-audio-"));
    const source = await downloadDirectAudio({ url: directAudio.url, directory: workDir });
    displayName = assetDisplayName(source.name);
    const outputName = `${safeBaseName(source.name)}-roblox.ogg`;
    const outputPath = join(workDir, outputName);

    await editStatus(interaction, `🔎 Memeriksa **${safeDiscordText(displayName)}**…`);
    await inspectAudio(ffprobeStatic.path, source.path, { speed: directAudio.speed });
    await editStatus(interaction, `🎛️ Mengedit **${safeDiscordText(displayName)}** dengan tetapan Roblox, speed ${speedText(directAudio.speed)}…`);
    await convertAudio(ffmpegPath, source.path, outputPath, { quality: "high", normalize: true, speed: directAudio.speed });
    await inspectConvertedAudio(ffprobeStatic.path, outputPath);

    await editStatus(interaction, `☁️ Upload **${safeDiscordText(displayName)}** ke Roblox…`);
    const operationPath = await uploader.upload({
      filePath: outputPath,
      fileName: outputName,
      displayName,
      description: "Audio from a user-confirmed licensed direct source"
    });
    await editStatus(interaction, "⏳ Roblox sedang memproses audio…");
    const assetId = await uploader.waitForAsset(operationPath);
    await replyWithUploadResults(interaction, [{ index: 1, name: displayName, assetId }]);
  } catch (error) {
    await replyWithUploadResults(interaction, [{
      index: 1,
      name: displayName,
      error: errorMessage(error)
    }]);
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function processYouTubeUploadJob({ interaction, youtube, uploader }) {
  let workDir;
  let displayName = "YouTube Audio";

  try {
    await editStatus(interaction, "🔗 Membaca link dan memuat turun audio YouTube sebagai MP3…");
    workDir = await mkdtemp(join(tmpdir(), "roblox-youtube-"));
    const mp3Path = join(workDir, "youtube-source.mp3");
    const outputName = "youtube-roblox.ogg";
    const outputPath = join(workDir, outputName);
    const source = await downloadYouTubeMp3({
      ytDlpPath,
      ffmpegPath,
      url: youtube.url,
      outputPath: mp3Path
    });
    displayName = assetDisplayName(source.title, { stripExtension: false });

    await editStatus(interaction, `🎛️ Mengedit **${safeDiscordText(displayName)}** dengan tetapan Roblox…`);
    await inspectAudio(ffprobeStatic.path, source.path, { speed: youtube.speed });
    await convertAudio(ffmpegPath, source.path, outputPath, { quality: "high", normalize: true, speed: youtube.speed });
    await inspectConvertedAudio(ffprobeStatic.path, outputPath);

    await editStatus(interaction, `☁️ Upload **${safeDiscordText(displayName)}** ke Roblox…`);
    const operationPath = await uploader.upload({
      filePath: outputPath,
      fileName: outputName,
      displayName,
      description: "Audio from a user-confirmed licensed YouTube source"
    });
    await editStatus(interaction, "⏳ Roblox sedang memproses audio…");
    const assetId = await uploader.waitForAsset(operationPath);
    await replyWithUploadResults(interaction, [{ index: 1, name: displayName, assetId }]);
  } catch (error) {
    const message = errorMessage(error);
    if (/YouTube meminta login|menyekat alamat server cloud/i.test(message)) {
      await interaction.editReply({
        content: [
          "⚠️ **YouTube menyekat permintaan server cloud.**",
          "Bot tidak akan meminta login atau cookies anda.",
          "Tekan butang di bawah dan pilih MP3/WAV asal; bot akan terus auto-edit dan upload ke Roblox."
        ].join("\n"),
        files: [],
        components: youtubeFallbackComponents(),
        allowedMentions: { parse: [] }
      });
      return;
    }
    await replyWithUploadResults(interaction, [{
      index: 1,
      name: displayName,
      error: message
    }]);
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function processAudioJob(job) {
  if (job.youtube) await processYouTubeUploadJob(job);
  else if (job.directAudio) await processDirectAudioUploadJob(job);
  else if (job.upload) await processUploadJob(job);
  else await processConversionJob(job);
}

async function drainQueue() {
  if (processing) return;
  processing = true;
  try {
    while (jobQueue.length > 0) {
      const job = jobQueue.shift();
      activeFileCount = jobFileCount(job);
      activeUserId = job.interaction?.user?.id || null;
      try {
        await processAudioJob(job);
      } catch (error) {
        console.error("Audio job error:", error);
        await job.interaction.editReply({
          content: `❌ Kerja audio gagal: ${errorMessage(error)}`,
          files: [],
          allowedMentions: { parse: [] }
        }).catch(() => {});
      } finally {
        activeFileCount = 0;
        activeUserId = null;
      }
    }
  } finally {
    processing = false;
  }
}

async function enqueueJob(job) {
  const pendingBefore = pendingFileCount();
  if (pendingBefore + jobFileCount(job) > MAX_PENDING_FILES) {
    await job.interaction.editReply({
      content: `Queue hampir penuh. Maksimum ${MAX_PENDING_FILES} fail aktif/menunggu; cuba lagi sebentar.`,
      components: [],
      allowedMentions: { parse: [] }
    });
    return false;
  }
  const userPending = pendingFileCountForUser(job.interaction.user.id);
  if (userPending + jobFileCount(job) > MAX_PENDING_FILES_PER_USER) {
    await job.interaction.editReply({
      content: `Queue user penuh. Maksimum ${MAX_PENDING_FILES_PER_USER} fail menunggu untuk setiap user; cuba lagi selepas kerja semasa selesai.`,
      components: [],
      allowedMentions: { parse: [] }
    });
    return false;
  }

  jobQueue.push(job);
  if (pendingBefore > 0) {
    await editStatus(job.interaction, `⏳ Masuk queue. Ada ${pendingBefore} fail di hadapan.`);
  }
  void drainQueue();
  return true;
}

async function showQuickUploadConfirmation(interaction) {
  const target = resolveUploadTarget(interaction);
  if (!target) return replyUploadTargetRequired(interaction);

  const attachment = interaction.options.getAttachment("file", true);
  const speed = normalizeAudioSpeed(interaction.options.getString("speed") || "1");
  try {
    validateAttachment(attachment);
  } catch (error) {
    await interaction.reply({ content: `❌ ${errorMessage(error)}`, flags: MessageFlags.Ephemeral });
    return;
  }

  const requestId = randomUUID().replaceAll("-", "");
  quickUploadConfirmations.set(requestId, {
    ownerId: interaction.user.id,
    interaction,
    attachment,
    target,
    speed
  });
  try {
    await interaction.reply({
      content: [
        `🎵 Fail: **${safeDiscordText(attachment.name)}**`,
        `Bot akan menukar audio speed ${speedText(speed)} dan upload ke Roblox: ${safeDiscordText(target.label)}.`,
        "Tekan butang hijau untuk mengesahkan anda memiliki atau mempunyai lesen audio ini."
      ].join("\n"),
      components: quickUploadComponents(requestId),
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] }
    });
  } catch (error) {
    quickUploadConfirmations.delete(requestId);
    throw error;
  }

  const timer = setTimeout(() => {
    if (!quickUploadConfirmations.delete(requestId)) return;
    void interaction.editReply({
      content: "⌛ Pengesahan tamat masa. Jalankan `/upload` semula.",
      components: [],
      allowedMentions: { parse: [] }
    }).catch(() => {});
  }, QUICK_CONFIRM_MS);
  timer.unref?.();
}

async function showYouTubeConfirmation(interaction) {
  const target = resolveUploadTarget(interaction);
  if (!target) return replyUploadTargetRequired(interaction);
  if (!youtubeReady) {
    await interaction.reply({
      content: "❌ Downloader YouTube belum tersedia. Cuba lagi selepas bot selesai bermula.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  if (!interaction.options.getBoolean("rights_confirm", true)) {
    await interaction.reply({
      content: "❌ Upload dibatalkan. Anda mesti memiliki atau mempunyai lesen audio tersebut.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  let url;
  const speed = normalizeAudioSpeed(interaction.options.getString("speed") || "1");
  try {
    url = normalizeYouTubeUrl(interaction.options.getString("link", true));
  } catch (error) {
    await interaction.reply({ content: `❌ ${errorMessage(error)}`, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await editStatus(interaction, `⏳ Link diterima. Memulakan auto proses speed ${speedText(speed)} dan upload ke ${safeDiscordText(target.label)}…\n<${url}>`);
  await enqueueJob({ interaction, youtube: { url, speed }, uploader: target.uploader });
}

async function handleQuickUploadButton(interaction) {
  const match = /^quick-upload:([a-f0-9]{32}):(confirm|cancel)$/.exec(interaction.customId);
  if (!match) return false;

  const [, requestId, action] = match;
  const pending = quickUploadConfirmations.get(requestId);
  if (!pending) {
    await interaction.reply({ content: "⌛ Permintaan ini sudah tamat atau digunakan.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (interaction.user.id !== pending.ownerId) {
    await interaction.reply({ content: "❌ Butang ini bukan untuk anda.", flags: MessageFlags.Ephemeral });
    return true;
  }

  quickUploadConfirmations.delete(requestId);
  if (action === "cancel") {
    await interaction.update({ content: "Upload dibatalkan.", components: [], allowedMentions: { parse: [] } });
    return true;
  }

  await interaction.update({ content: "⏳ Menyediakan upload…", components: [], allowedMentions: { parse: [] } });
  if (pending.youtube) {
    await enqueueJob({
      interaction: pending.interaction,
      youtube: pending.youtube,
      uploader: pending.target.uploader
    });
  } else {
    await enqueueJob({
      interaction: pending.interaction,
      attachments: [pending.attachment],
      quality: "high",
      normalize: true,
      speed: pending.speed,
      uploader: pending.target.uploader,
      upload: {
        name: null,
        description: "Uploaded from Discord using licensed audio"
      }
    });
  }
  return true;
}

async function showRobloxAccount(interaction) {
  if (ensureGuildAdmin(interaction)) {
    await interaction.showModal(robloxServerSetupModal());
    return;
  }
  if (!robloxOAuth.configured) {
    await interaction.reply({
      content: [
        "❌ Akaun Roblox user belum tersedia kerana OAuth belum dikonfigurasi di Railway.",
        "Minta admin server tekan **Akaun Roblox** untuk isi Roblox Group/User ID server dahulu."
      ].join("\n"),
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  const profile = robloxOAuth.getPublicProfile(interaction.user.id);
  if (profile) {
    await interaction.reply({
      content: [
        "✅ Akaun Roblox anda sudah disambung.",
        `Roblox: **${safeDiscordText(profile.username)}** (${profile.robloxUserId})`,
        "Upload baru akan masuk ke akaun Roblox ini, bukan community/group default."
      ].join("\n"),
      components: disconnectRobloxComponents(),
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] }
    });
    return;
  }
  await interaction.reply({
    content: [
      "Sambung akaun Roblox anda untuk upload ke akaun sendiri.",
      "Bot hanya minta izin rasmi `asset:write`; token disimpan terenkripsi pada server."
    ].join("\n"),
    components: makeRobloxConnectButton(interaction.user.id),
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] }
  });
}

async function handleRobloxAccountButton(interaction) {
  if (interaction.customId !== "roblox-account:disconnect") return false;
  if (!robloxOAuth.configured) {
    await interaction.reply({ content: "❌ Roblox OAuth belum dikonfigurasi.", flags: MessageFlags.Ephemeral });
    return true;
  }
  await robloxOAuth.disconnect(interaction.user.id);
  await interaction.update({
    content: "✅ Akaun Roblox anda sudah diputuskan daripada bot ini.",
    components: [],
    allowedMentions: { parse: [] }
  });
  return true;
}

function ensureGuildAdmin(interaction) {
  return interaction.inGuild()
    && interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

async function showRobloxServer(interaction) {
  if (!interaction.inGuild()) {
    await interaction.reply({ content: "❌ Command ini hanya boleh digunakan dalam server Discord.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!ensureGuildAdmin(interaction)) {
    await interaction.reply({ content: "❌ Hanya admin dengan permission Manage Server boleh ubah setup Roblox server ini.", flags: MessageFlags.Ephemeral });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "status") {
    const config = guildConfigStore.get(interaction.guildId);
    await interaction.reply({
      content: config
        ? `✅ Server ini diset ke Roblox ${config.creatorType} ${config.creatorId}.`
        : "⚠️ Server ini belum ada creator Roblox. Guna `/roblox-server set` dahulu.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (subcommand === "clear") {
    await guildConfigStore.delete(interaction.guildId);
    await interaction.reply({
      content: "✅ Setup creator Roblox server ini sudah dipadam. Upload user biasa akan disekat sampai admin set semula.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const config = normalizeCreatorConfig({
    creatorType: interaction.options.getString("creator_type", true),
    creatorId: interaction.options.getString("creator_id", true),
    updatedBy: interaction.user.id
  });
  const saved = await guildConfigStore.set(interaction.guildId, {
    ...config,
    updatedBy: interaction.user.id
  });
  await interaction.reply({
    content: [
      `✅ Server ini sekarang diset ke Roblox ${saved.creatorType} ${saved.creatorId}.`,
      "Setiap user perlu `/roblox-account` dan akaun Roblox mereka mesti ada permission upload ke creator itu."
    ].join("\n"),
    flags: MessageFlags.Ephemeral
  });
}

async function handleMenuButton(interaction) {
  if (!interaction.customId.startsWith("music-menu:")) return false;

  if (interaction.customId === "music-menu:account") {
    await showRobloxAccount(interaction);
    return true;
  }

  if (interaction.customId === "music-menu:help") {
    await interaction.reply({
      content: [
        "🎵 **Cara guna menu audio Roblox**",
        "**Developer/admin server:**",
        "1. Set creator Roblox server: `/roblox-server set creator_type:Group creator_id:ID_GROUP_ROBLOX`.",
        "2. Check setup: `/roblox-server status`.",
        "3. Pastikan user yang upload sudah connect Roblox dan ada permission upload ke creator itu.",
        "",
        "**User biasa:**",
        "1. Tekan **Pilih Fail Audio** untuk memilih 1–5 fail, **Paste Link Audio** untuk link fail public, atau **YouTube Auto Upload** untuk satu video public.",
        "2. User tekan **Akaun Roblox** untuk connect akaun Roblox sendiri.",
        "3. Tandakan pengesahan bahawa anda memiliki atau mempunyai lesen audio tersebut.",
        "4. Hantar borang dan tunggu bot memberikan Asset ID, JSON serta Lua.",
        "",
        "Link audio menyokong Dropbox, Google Drive, Discord CDN, Cloudflare R2 dan Amazon S3. Link YouTube mesti menggunakan pilihan YouTube.",
        "Semua upload masih melalui moderation Roblox. Playlist, live, video private dan DRM tidak disokong."
      ].join("\n"),
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] }
    });
    return true;
  }

  if (!["music-menu:file", "music-menu:audio-link", "music-menu:youtube"].includes(interaction.customId)) return true;
  if (!resolveUploadTarget(interaction)) {
    await replyUploadTargetRequired(interaction);
    return true;
  }
  if (interaction.customId === "music-menu:youtube" && !youtubeReady) {
    await interaction.reply({
      content: "❌ Downloader YouTube belum tersedia. Cuba lagi selepas bot selesai bermula.",
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  const modals = {
    "music-menu:file": fileUploadModal,
    "music-menu:audio-link": directAudioUploadModal,
    "music-menu:youtube": youtubeUploadModal
  };
  await interaction.showModal(modals[interaction.customId]());
  return true;
}

async function handleMenuModal(interaction) {
  if (interaction.customId === "music-menu:server-setup-modal") {
    if (!ensureGuildAdmin(interaction)) {
      await interaction.reply({
        content: "❌ Hanya admin dengan permission Manage Server boleh set creator Roblox server ini.",
        flags: MessageFlags.Ephemeral
      });
      return true;
    }
    try {
      const saved = await guildConfigStore.set(interaction.guildId, {
        creatorType: interaction.fields.getStringSelectValues("creator_type")[0],
        creatorId: interaction.fields.getTextInputValue("creator_id"),
        updatedBy: interaction.user.id
      });
      await interaction.reply({
        content: [
          `✅ Server ini sekarang diset ke Roblox ${saved.creatorType} ${saved.creatorId}.`,
          saved.creatorType === "Group"
            ? "Ini bermaksud upload akan masuk ke Roblox group/community ID itu."
            : "Ini bermaksud upload akan masuk ke Roblox user creator ID itu.",
          "Sebelum upload, user perlu connect Roblox sendiri dengan `/roblox-account` jika OAuth sudah aktif.",
          "Gunakan `/roblox-server status` untuk check semula ID ini."
        ].join("\n"),
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] }
      });
    } catch (error) {
      await interaction.reply({
        content: `❌ Setup gagal: ${errorMessage(error)}`,
        flags: MessageFlags.Ephemeral
      });
    }
    return true;
  }

  if (![
    "music-menu:file-modal",
    "music-menu:audio-link-modal",
    "music-menu:youtube-modal"
  ].includes(interaction.customId)) return false;

  const target = resolveUploadTarget(interaction);
  if (!target) {
    await replyUploadTargetRequired(interaction);
    return true;
  }
  if (interaction.fields.getCheckbox("rights_confirm") !== true) {
    await interaction.reply({
      content: "❌ Upload dibatalkan. Anda mesti memiliki atau mempunyai lesen audio tersebut.",
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  if (interaction.customId === "music-menu:file-modal") {
    const attachments = [...interaction.fields.getUploadedFiles("audio_files", true).values()];
    const speed = normalizeAudioSpeed(interaction.fields.getStringSelectValues("audio_speed")[0]);
    try {
      for (const attachment of attachments) validateAttachment(attachment);
    } catch (error) {
      await interaction.reply({ content: `❌ ${errorMessage(error)}`, flags: MessageFlags.Ephemeral });
      return true;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await enqueueJob({
      interaction,
      attachments,
      quality: "high",
      normalize: true,
      speed,
      uploader: target.uploader,
      upload: {
        name: null,
        description: "Uploaded from Discord using licensed audio"
      }
    });
    return true;
  }

  if (interaction.customId === "music-menu:audio-link-modal") {
    let url;
    const speed = normalizeAudioSpeed(interaction.fields.getStringSelectValues("audio_speed")[0]);
    try {
      url = normalizeDirectAudioUrl(interaction.fields.getTextInputValue("audio_link"));
    } catch (error) {
      await interaction.reply({ content: `❌ ${errorMessage(error)}`, flags: MessageFlags.Ephemeral });
      return true;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await enqueueJob({ interaction, directAudio: { url, speed }, uploader: target.uploader });
    return true;
  }

  if (!youtubeReady) {
    await interaction.reply({
      content: "❌ Downloader YouTube belum tersedia. Cuba lagi selepas bot selesai bermula.",
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  let url;
  const speed = normalizeAudioSpeed(interaction.fields.getStringSelectValues("audio_speed")[0]);
  try {
    url = normalizeYouTubeUrl(interaction.fields.getTextInputValue("youtube_link"));
  } catch (error) {
    await interaction.reply({ content: `❌ ${errorMessage(error)}`, flags: MessageFlags.Ephemeral });
    return true;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await enqueueJob({ interaction, youtube: { url, speed }, uploader: target.uploader });
  return true;
}

async function handleInteraction(interaction) {
  if (interaction.isButton()) {
    if (await handleRobloxAccountButton(interaction)) return;
    if (await handleQuickUploadButton(interaction)) return;
    await handleMenuButton(interaction);
    return;
  }
  if (interaction.isModalSubmit()) {
    await handleMenuModal(interaction);
    return;
  }
  if (!interaction.isChatInputCommand()) return;
  if (!["menu", "upload", "yt", "roblox-audio", "roblox-upload", "roblox-help", "roblox-account", "roblox-server"].includes(interaction.commandName)) return;

  if (interaction.commandName === "menu") {
    await interaction.reply({
      content: [
        "🎵 **Menu Audio Roblox**",
        "Pilih fail, paste link audio public, atau gunakan YouTube. Bot terus convert, edit dan upload selepas borang dihantar."
      ].join("\n"),
      components: mainMenuComponents(),
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] }
    });
    return;
  }

  if (interaction.commandName === "upload") {
    await showQuickUploadConfirmation(interaction);
    return;
  }

  if (interaction.commandName === "roblox-account") {
    await showRobloxAccount(interaction);
    return;
  }

  if (interaction.commandName === "roblox-server") {
    await showRobloxServer(interaction);
    return;
  }

  if (interaction.commandName === "yt") {
    await showYouTubeConfirmation(interaction);
    return;
  }

  if (interaction.commandName === "roblox-help") {
    await interaction.reply({
      content: [
        "🎵 **Cara guna bot audio Roblox**",
        "**Untuk developer/admin server:**",
        "1. Selepas invite bot, set destinasi Roblox: `/roblox-server set creator_type:Group creator_id:ID_GROUP_ROBLOX`.",
        "2. Guna `creator_type:User` kalau mahu upload ke user creator, bukan group.",
        "3. Guna `/roblox-server status` untuk confirm ID betul sebelum user upload.",
        "4. User yang upload mesti `/roblox-account` dan akaun Roblox itu mesti ada permission upload ke creator tersebut.",
        "5. Guna `/roblox-server clear` kalau tersalah set ID dan mahu sekat upload sementara.",
        "",
        "**Untuk user biasa:**",
        "**Paling mudah:** taip `/menu`, kemudian tekan **Pilih Fail Audio**, **Paste Link Audio** atau **YouTube Auto Upload**.",
        "Tekan **Akaun Roblox** atau guna `/roblox-account` untuk connect Roblox sendiri.",
        "Isi borang ringkas, tandakan pengesahan hak audio, kemudian hantar.",
        "",
        "Menu menyokong 1–5 fail, satu link fail audio public, atau satu link video YouTube public.",
        "Pilih speed `1x`, `1.5x` atau `2x`, kemudian tunggu bot memberikan Asset ID, JSON serta Lua.",
        "",
        "Arahan lama `/upload`, `/yt` dan `/roblox-upload` masih boleh digunakan.",
        "Gunakan audio yang anda miliki atau mempunyai lesen. Semua upload tetap melalui moderation Roblox."
      ].join("\n"),
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] }
    });
    return;
  }

  const directUpload = interaction.commandName === "roblox-upload";
  const target = directUpload ? resolveUploadTarget(interaction) : null;
  if (directUpload && !target) return replyUploadTargetRequired(interaction);
  if (directUpload && !interaction.options.getBoolean("rights_confirm", true)) {
    await interaction.reply({
      content: "❌ Upload dibatalkan. Anda mesti memiliki atau mempunyai lesen semua audio tersebut.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const attachmentOptions = directUpload ? ["file", "file_2", "file_3", "file_4", "file_5"] : ["file"];
  const attachments = attachmentOptions
    .map((name) => interaction.options.getAttachment(name))
    .filter(Boolean);

  try {
    for (const attachment of attachments) validateAttachment(attachment);
  } catch (error) {
    await interaction.reply({ content: `❌ ${errorMessage(error)}`, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply(directUpload ? { flags: MessageFlags.Ephemeral } : undefined);
  const job = {
    interaction,
    attachments,
    quality: directUpload ? "high" : interaction.options.getString("quality") || "standard",
    normalize: directUpload ? true : interaction.options.getBoolean("normalize") || false,
    speed: normalizeAudioSpeed(interaction.options.getString("speed") || "1"),
    uploader: target?.uploader,
    upload: directUpload ? {
      name: interaction.options.getString("name") || null,
      description: interaction.options.getString("description") || "Uploaded from Discord using licensed audio"
    } : null
  };
  await enqueueJob(job);
}

client.on(Events.InteractionCreate, (interaction) => {
  void handleInteraction(interaction).catch(async (error) => {
    console.error("Interaction error:", error);
    if (!interaction.isRepliable()) return;
    const payload = {
      content: "❌ Bot mengalami ralat sementara. Cuba semula sebentar lagi.",
      components: [],
      allowedMentions: { parse: [] }
    };
    if (interaction.deferred || interaction.replied) await interaction.editReply(payload).catch(() => {});
    else await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral }).catch(() => {});
  });
});

client.login(token);

const httpServer = startServer({
  port: Number(process.env.PORT || 3000),
  handleRobloxOAuthCallback: async (url) => {
    try {
      return await robloxOAuth.handleCallback(url);
    } catch (error) {
      throw new Error(robloxOAuth.safeError(error));
    }
  },
  getStatus: () => ({
    version: BOT_VERSION,
    discordReady: client.isReady(),
    guilds: client.guilds.cache.size,
    queue: pendingFileCount(),
    robloxUploadConfigured: defaultRoblox.configured,
    robloxOAuthConfigured: robloxOAuth.configured,
    linkedRobloxUsers: robloxOAuth.linkedCount(),
    corruptRobloxProfiles: robloxOAuth.corruptProfileCount(),
    configuredRobloxServers: guildConfigStore.size,
    corruptRobloxServerConfigs: guildConfigStore.corruptFiles,
    youtubeReady,
    youtubeToolVersion
  })
});

async function shutdown(signal) {
  console.log(`${signal} diterima; menutup bot dengan selamat.`);
  client.destroy();
  httpServer.close();
  process.exit(0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
