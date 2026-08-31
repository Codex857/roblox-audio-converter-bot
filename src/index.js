import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { canUseRobloxUpload, createRobloxUploader } from "./roblox.js";
import { startServer } from "./server.js";
import { buildUploadExports } from "./upload-results.js";
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
const BOT_VERSION = "2.1.1";
if (!token) throw new Error("DISCORD_TOKEN belum ditetapkan dalam fail .env.");
if (!ffmpegPath || !ffprobeStatic.path) throw new Error("FFmpeg atau FFprobe tidak tersedia.");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const roblox = createRobloxUploader({
  apiKey: process.env.ROBLOX_API_KEY,
  creatorType: process.env.ROBLOX_CREATOR_TYPE,
  creatorId: process.env.ROBLOX_CREATOR_ID
});
const robloxAccess = {
  guildId: process.env.ROBLOX_UPLOAD_GUILD_ID,
  roleId: process.env.ROBLOX_UPLOAD_ROLE_ID,
  userIds: process.env.ROBLOX_UPLOAD_USER_IDS
};
const jobQueue = [];
const MAX_PENDING_FILES = 10;
let activeFileCount = 0;
let processing = false;

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Bot aktif sebagai ${readyClient.user.tag}`);
});

client.on(Events.Error, (error) => {
  console.error("Discord client error:", error);
});

function pendingFileCount() {
  return activeFileCount + jobQueue.reduce((total, job) => total + job.attachments.length, 0);
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

async function uploadOne({ interaction, attachment, index, total, requestedName, description }) {
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
    await editStatus(interaction, `⏳ [${index}/${total}] Roblox sedang memproses **${safeDiscordText(displayName)}**…`);
    const assetId = await roblox.waitForAsset(operationPath);
    return { name: displayName, assetId };
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function processUploadJob({ interaction, attachments, upload }) {
  const results = [];

  for (let index = 0; index < attachments.length; index += 1) {
    const attachment = attachments[index];
    const requestedName = attachments.length === 1 ? upload.name : null;
    try {
      results.push(await uploadOne({
        interaction,
        attachment,
        index: index + 1,
        total: attachments.length,
        requestedName,
        description: upload.description
      }));
    } catch (error) {
      results.push({
        name: requestedName
          ? assetDisplayName(requestedName, { stripExtension: false })
          : assetDisplayName(attachment.name),
        error: errorMessage(error)
      });
    }
  }

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
    allowedMentions: { parse: [] }
  });
}

async function processAudioJob(job) {
  if (job.upload) await processUploadJob(job);
  else await processConversionJob(job);
}

async function drainQueue() {
  if (processing) return;
  processing = true;
  try {
    while (jobQueue.length > 0) {
      const job = jobQueue.shift();
      activeFileCount = job.attachments.length;
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

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (!["roblox-audio", "roblox-upload"].includes(interaction.commandName)) return;

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
  const pendingBefore = pendingFileCount();
  if (pendingBefore + attachments.length > MAX_PENDING_FILES) {
    await interaction.editReply({
      content: `Queue hampir penuh. Maksimum ${MAX_PENDING_FILES} fail aktif/menunggu; cuba lagi sebentar.`,
      allowedMentions: { parse: [] }
    });
    return;
  }
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
  jobQueue.push(job);
  if (pendingBefore > 0) {
    await editStatus(interaction, `⏳ Masuk queue. Ada ${pendingBefore} fail di hadapan.`);
  }
  void drainQueue();
});

client.login(token);

const httpServer = startServer({
  port: Number(process.env.PORT || 3000),
  getStatus: () => ({
    version: BOT_VERSION,
    discordReady: client.isReady(),
    guilds: client.guilds.cache.size,
    queue: pendingFileCount(),
    robloxUploadConfigured: roblox.configured
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
