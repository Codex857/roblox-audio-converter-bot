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
import {
  ROBLOX_MAX_BYTES,
  DISCORD_SAFE_MAX_BYTES,
  convertAudio,
  downloadAttachment,
  inspectAudio,
  safeBaseName,
  validateAttachment
} from "./audio.js";

const token = process.env.DISCORD_TOKEN;
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
const MAX_PENDING_JOBS = 5;
let processing = false;

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Bot aktif sebagai ${readyClient.user.tag}`);
});

client.on(Events.Error, (error) => {
  console.error("Discord client error:", error);
});

async function processAudioJob({ interaction, attachment, quality, normalize, upload }) {
  let workDir;

  try {
    await interaction.editReply("⏬ Memuat turun audio…");
    workDir = await mkdtemp(join(tmpdir(), "roblox-audio-"));
    const inputPath = join(workDir, `${randomUUID()}${extname(attachment.name || ".audio")}`);
    const outputName = `${safeBaseName(attachment.name)}-roblox.ogg`;
    const outputPath = join(workDir, outputName);

    await downloadAttachment(attachment, inputPath);
    await interaction.editReply("🔎 Memeriksa durasi dan format audio…");
    const { duration } = await inspectAudio(ffprobeStatic.path, inputPath);
    await interaction.editReply(`🎛️ Menukar audio (${quality}, ${normalize ? "normalize" : "mix asal"})…`);
    await convertAudio(ffmpegPath, inputPath, outputPath, { quality, normalize });

    let effectiveQuality = quality;
    let outputInfo = await stat(outputPath);
    if (!upload && outputInfo.size > DISCORD_SAFE_MAX_BYTES && quality !== "compact") {
      await interaction.editReply("📦 Output terlalu besar untuk Discord; mengoptimumkan bitrate…");
      effectiveQuality = "compact";
      await convertAudio(ffmpegPath, inputPath, outputPath, { quality: effectiveQuality, normalize });
      outputInfo = await stat(outputPath);
    }
    if (outputInfo.size >= ROBLOX_MAX_BYTES) {
      throw new Error("Hasil masih melebihi had Roblox 20 MB.");
    }

    if (upload) {
      await interaction.editReply("☁️ Menghantar audio ke Roblox Open Cloud…");
      const operationPath = await roblox.upload({
        filePath: outputPath,
        fileName: outputName,
        displayName: upload.name,
        description: upload.description
      });
      await interaction.editReply("⏳ Roblox sedang memproses dan memoderasi aset…");
      const assetId = await roblox.waitForAsset(operationPath);
      await interaction.editReply({
        content: [
          `✅ Upload siap: **${upload.name}**`,
          `Asset ID: **${assetId}**`,
          `Lua: \`Sound.SoundId = "rbxassetid://${assetId}"\``,
          "Gunakan aset hanya mengikut hak/lesen dan keputusan moderation Roblox."
        ].join("\n"),
        files: []
      });
      return;
    }

    await interaction.editReply("📤 Menghantar fail siap…");
    await interaction.editReply({
      content: [
        `✅ Siap: OGG stereo 48 kHz · ${(duration / 60).toFixed(2)} minit · ${(outputInfo.size / 1024 / 1024).toFixed(2)} MB.`,
        `Kualiti: ${effectiveQuality}${normalize ? " · loudness dinormalisasi" : " · mix asal dikekalkan"}.`,
        "Upload hanya jika anda memiliki atau mempunyai lesen untuk audio ini. Kelulusan moderation Roblox tidak dijamin."
      ].join("\n"),
      files: [{ attachment: outputPath, name: outputName }]
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ralat tidak diketahui.";
    const reply = `Tak dapat memproses audio: ${message}`;
    if (interaction.deferred || interaction.replied) await interaction.editReply({ content: reply, files: [] });
    else await interaction.reply({ content: reply, ephemeral: true });
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function drainQueue() {
  if (processing) return;
  processing = true;
  try {
    while (jobQueue.length > 0) {
      const job = jobQueue.shift();
      await processAudioJob(job);
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
      content: "❌ Upload dibatalkan. Anda mesti memiliki atau mempunyai lesen audio tersebut.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const attachment = interaction.options.getAttachment("file", true);
  const quality = interaction.options.getString("quality") || "standard";
  const normalize = interaction.options.getBoolean("normalize") || false;

  try {
    validateAttachment(attachment);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fail tidak sah.";
    await interaction.reply({ content: `❌ ${message}`, flags: MessageFlags.Ephemeral });
    return;
  }

  if (jobQueue.length >= MAX_PENDING_JOBS) {
    await interaction.reply({
      content: "Queue penuh (5 kerja menunggu). Cuba lagi sebentar.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  await interaction.deferReply();
  const job = {
    interaction, attachment, quality, normalize,
    upload: directUpload ? {
      name: interaction.options.getString("name") || safeBaseName(attachment.name).replaceAll("-", " "),
      description: interaction.options.getString("description") || "Uploaded from Discord using licensed audio"
    } : null
  };
  jobQueue.push(job);
  const position = jobQueue.indexOf(job) + (processing ? 2 : 1);
  if (position > 1) await interaction.editReply(`⏳ Masuk queue. Kedudukan: ${position}.`);
  void drainQueue();
});

client.login(token);

const httpServer = startServer({
  port: Number(process.env.PORT || 3000),
  getStatus: () => ({
    discordReady: client.isReady(),
    guilds: client.guilds.cache.size,
    queue: jobQueue.length,
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
