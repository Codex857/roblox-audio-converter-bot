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
  MessageFlags
} from "discord.js";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { canUseRobloxUpload, createRobloxUploader } from "./roblox.js";
import { fileUploadModal, mainMenuComponents, youtubeUploadModal } from "./menu.js";
import { startServer } from "./server.js";
import { buildUploadExports } from "./upload-results.js";
import { checkYouTubeTool, downloadYouTubeMp3, normalizeYouTubeUrl } from "./youtube.js";
import {
  DISCORD_SAFE_MAX_BYTES,
  assetDisplayName,
  convertAudio,
  downloadAttachment,
  inspectAudio,
  inspectConvertedAudio,
  safeBaseName,
  validateAttachment
} from "./audio.js";

const token = process.env.DISCORD_TOKEN;
const BOT_VERSION = "2.6.2";
const ytDlpPath = process.env.YT_DLP_PATH?.trim() || "yt-dlp";
if (!token) throw new Error("DISCORD_TOKEN belum ditetapkan dalam fail .env.");
if (!ffmpegPath || !ffprobeStatic.path) throw new Error("FFmpeg atau FFprobe tidak tersedia.");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const roblox = createRobloxUploader({
  apiKey: process.env.ROBLOX_API_KEY,
  creatorType: process.env.ROBLOX_CREATOR_TYPE,
  creatorId: process.env.ROBLOX_CREATOR_ID
});
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
const MAX_PENDING_FILES = 10;
const QUICK_CONFIRM_MS = 60_000;
let activeFileCount = 0;
let processing = false;
let youtubeReady = false;
let youtubeToolVersion = null;

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Bot aktif sebagai ${readyClient.user.tag}`);
});

client.on(Events.Error, (error) => {
  console.error("Discord client error:", error);
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
  return job.attachments?.length || (job.youtube ? 1 : 0);
}

function pendingFileCount() {
  return activeFileCount + jobQueue.reduce((total, job) => total + jobFileCount(job), 0);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : "Ralat tidak diketahui.";
}

function safeDiscordText(value) {
  return String(value).replace(/([\\`*_~|>])/g, "\\$1").slice(0, 180);
}

function editStatus(interaction, content) {
  return interaction.editReply({ content, allowedMentions: { parse: [] } });
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

async function processConversionJob({ interaction, attachments, quality, normalize }) {
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
    await inspectAudio(ffprobeStatic.path, inputPath);
    await interaction.editReply(`🎛️ Menukar audio (${quality}, ${normalize ? "normalize" : "mix asal"})…`);
    await convertAudio(ffmpegPath, inputPath, outputPath, { quality, normalize });

    let effectiveQuality = quality;
    let outputStat = await stat(outputPath);
    if (outputStat.size > DISCORD_SAFE_MAX_BYTES && quality !== "compact") {
      await interaction.editReply("📦 Output terlalu besar untuk Discord; mengoptimumkan bitrate…");
      effectiveQuality = "compact";
      await convertAudio(ffmpegPath, inputPath, outputPath, { quality: effectiveQuality, normalize });
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
        `Kualiti: ${effectiveQuality}${normalize ? " · loudness dinormalisasi" : " · mix asal dikekalkan"}.`,
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

async function startUploadOne({ interaction, attachment, index, total, requestedName, description }) {
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
    await inspectAudio(ffprobeStatic.path, inputPath);
    await editStatus(interaction, `🎛️ [${index}/${total}] Menukar ke OGG high quality dan menyamakan loudness…`);
    await convertAudio(ffmpegPath, inputPath, outputPath, { quality: "high", normalize: true });
    await inspectConvertedAudio(ffprobeStatic.path, outputPath);

    await editStatus(interaction, `☁️ [${index}/${total}] Upload **${safeDiscordText(displayName)}** ke Roblox…`);
    const operationPath = await roblox.upload({
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

async function processUploadJob({ interaction, attachments, upload }) {
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
        description: upload.description
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
        const assetId = await roblox.waitForAsset(item.operationPath);
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

async function processYouTubeUploadJob({ interaction, youtube }) {
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
    await inspectAudio(ffprobeStatic.path, source.path);
    await convertAudio(ffmpegPath, source.path, outputPath, { quality: "high", normalize: true });
    await inspectConvertedAudio(ffprobeStatic.path, outputPath);

    await editStatus(interaction, `☁️ Upload **${safeDiscordText(displayName)}** ke Roblox…`);
    const operationPath = await roblox.upload({
      filePath: outputPath,
      fileName: outputName,
      displayName,
      description: "Audio from a user-confirmed licensed YouTube source"
    });
    await editStatus(interaction, "⏳ Roblox sedang memproses audio…");
    const assetId = await roblox.waitForAsset(operationPath);
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

async function processAudioJob(job) {
  if (job.youtube) await processYouTubeUploadJob(job);
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

  jobQueue.push(job);
  if (pendingBefore > 0) {
    await editStatus(job.interaction, `⏳ Masuk queue. Ada ${pendingBefore} fail di hadapan.`);
  }
  void drainQueue();
  return true;
}

async function showQuickUploadConfirmation(interaction) {
  if (!roblox.configured) {
    await interaction.reply({
      content: "❌ Roblox Open Cloud belum dikonfigurasi oleh pemilik bot.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  if (!canUseRobloxUpload(interaction, robloxAccess)) {
    await interaction.reply({
      content: "❌ Anda tiada akses untuk upload ke creator Roblox bot ini.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const attachment = interaction.options.getAttachment("file", true);
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
    attachment
  });
  try {
    await interaction.reply({
      content: [
        `🎵 Fail: **${safeDiscordText(attachment.name)}**`,
        "Bot akan menukar audio dan upload ke Roblox.",
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
  if (!roblox.configured) {
    await interaction.reply({
      content: "❌ Roblox Open Cloud belum dikonfigurasi oleh pemilik bot.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  if (!youtubeReady) {
    await interaction.reply({
      content: "❌ Downloader YouTube belum tersedia. Cuba lagi selepas bot selesai bermula.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  if (!canUseRobloxUpload(interaction, robloxAccess)) {
    await interaction.reply({
      content: "❌ Anda tiada akses untuk upload ke creator Roblox bot ini.",
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
  try {
    url = normalizeYouTubeUrl(interaction.options.getString("link", true));
  } catch (error) {
    await interaction.reply({ content: `❌ ${errorMessage(error)}`, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await editStatus(interaction, `⏳ Link diterima. Memulakan auto proses dan upload…\n<${url}>`);
  await enqueueJob({ interaction, youtube: { url } });
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
      youtube: pending.youtube
    });
  } else {
    await enqueueJob({
      interaction: pending.interaction,
      attachments: [pending.attachment],
      quality: "high",
      normalize: true,
      upload: {
        name: null,
        description: "Uploaded from Discord using licensed audio"
      }
    });
  }
  return true;
}

async function handleMenuButton(interaction) {
  if (!interaction.customId.startsWith("music-menu:")) return false;

  if (interaction.customId === "music-menu:help") {
    await interaction.reply({
      content: [
        "🎵 **Cara guna menu audio Roblox**",
        "1. Tekan **Pilih Fail Audio** untuk memilih 1–5 fail, atau **YouTube Auto Upload** untuk menampal satu link video public.",
        "2. Tandakan pengesahan bahawa anda memiliki atau mempunyai lesen audio tersebut.",
        "3. Hantar borang dan tunggu bot memberikan Asset ID, JSON serta Lua.",
        "",
        "Semua upload masih melalui moderation Roblox. Playlist, live, video private dan DRM tidak disokong."
      ].join("\n"),
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] }
    });
    return true;
  }

  if (!["music-menu:file", "music-menu:youtube"].includes(interaction.customId)) return true;
  if (!roblox.configured) {
    await interaction.reply({
      content: "❌ Roblox Open Cloud belum dikonfigurasi oleh pemilik bot.",
      flags: MessageFlags.Ephemeral
    });
    return true;
  }
  if (!canUseRobloxUpload(interaction, robloxAccess)) {
    await interaction.reply({
      content: "❌ Anda tiada akses untuk upload ke creator Roblox bot ini.",
      flags: MessageFlags.Ephemeral
    });
    return true;
  }
  if (interaction.customId === "music-menu:youtube" && !youtubeReady) {
    await interaction.reply({
      content: "❌ Downloader YouTube belum tersedia. Cuba lagi selepas bot selesai bermula.",
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  await interaction.showModal(
    interaction.customId === "music-menu:file" ? fileUploadModal() : youtubeUploadModal()
  );
  return true;
}

async function handleMenuModal(interaction) {
  if (!["music-menu:file-modal", "music-menu:youtube-modal"].includes(interaction.customId)) return false;

  if (!roblox.configured) {
    await interaction.reply({
      content: "❌ Roblox Open Cloud belum dikonfigurasi oleh pemilik bot.",
      flags: MessageFlags.Ephemeral
    });
    return true;
  }
  if (!canUseRobloxUpload(interaction, robloxAccess)) {
    await interaction.reply({
      content: "❌ Anda tiada akses untuk upload ke creator Roblox bot ini.",
      flags: MessageFlags.Ephemeral
    });
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
      upload: {
        name: null,
        description: "Uploaded from Discord using licensed audio"
      }
    });
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
  try {
    url = normalizeYouTubeUrl(interaction.fields.getTextInputValue("youtube_link"));
  } catch (error) {
    await interaction.reply({ content: `❌ ${errorMessage(error)}`, flags: MessageFlags.Ephemeral });
    return true;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await enqueueJob({ interaction, youtube: { url } });
  return true;
}

async function handleInteraction(interaction) {
  if (interaction.isButton()) {
    if (await handleQuickUploadButton(interaction)) return;
    await handleMenuButton(interaction);
    return;
  }
  if (interaction.isModalSubmit()) {
    await handleMenuModal(interaction);
    return;
  }
  if (!interaction.isChatInputCommand()) return;
  if (!["menu", "upload", "yt", "roblox-audio", "roblox-upload", "roblox-help"].includes(interaction.commandName)) return;

  if (interaction.commandName === "menu") {
    await interaction.reply({
      content: [
        "🎵 **Menu Audio Roblox**",
        "Pilih cara upload di bawah. YouTube akan terus auto convert, edit dan upload selepas borang dihantar."
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

  if (interaction.commandName === "yt") {
    await showYouTubeConfirmation(interaction);
    return;
  }

  if (interaction.commandName === "roblox-help") {
    await interaction.reply({
      content: [
        "🎵 **Cara guna bot audio Roblox**",
        "**Paling mudah:** taip `/menu`, kemudian tekan **Pilih Fail Audio** atau **YouTube Auto Upload**.",
        "Isi borang ringkas, tandakan pengesahan hak audio, kemudian hantar.",
        "",
        "Menu menyokong 1–5 fail sekali atau satu link video YouTube public.",
        "Tunggu bot memberikan Asset ID, JSON serta Lua.",
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
  if (directUpload && !roblox.configured) {
    await interaction.reply({
      content: "❌ Roblox Open Cloud belum dikonfigurasi oleh pemilik bot.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  if (directUpload && !canUseRobloxUpload(interaction, robloxAccess)) {
    await interaction.reply({
      content: "❌ Anda tiada role/akses untuk upload ke creator Roblox bot ini.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }
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

  await interaction.deferReply();
  const job = {
    interaction,
    attachments,
    quality: directUpload ? "high" : interaction.options.getString("quality") || "standard",
    normalize: directUpload ? true : interaction.options.getBoolean("normalize") || false,
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
  getStatus: () => ({
    version: BOT_VERSION,
    discordReady: client.isReady(),
    guilds: client.guilds.cache.size,
    queue: pendingFileCount(),
    robloxUploadConfigured: roblox.configured,
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
