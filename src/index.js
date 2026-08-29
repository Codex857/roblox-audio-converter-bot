import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { Client, Events, GatewayIntentBits, MessageFlags, PermissionFlagsBits } from "discord.js";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { createBilling } from "./billing.js";
import { startServer } from "./server.js";
import { SubscriptionStore } from "./subscription-store.js";
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
const store = new SubscriptionStore(process.env.DATA_DIR || "./data");
const billing = createBilling({
  secretKey: process.env.STRIPE_SECRET_KEY,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  publicUrl: process.env.PUBLIC_URL,
  proPriceId: process.env.STRIPE_PRO_PRICE_ID,
  serverPriceId: process.env.STRIPE_SERVER_PRICE_ID
}, store);
const jobQueue = [];
const MAX_PENDING_JOBS = 5;
let processing = false;

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Bot aktif sebagai ${readyClient.user.tag}`);
});

client.on(Events.Error, (error) => {
  console.error("Discord client error:", error);
});

async function processAudioJob({ interaction, attachment, quality, normalize, userId, guildId }) {
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
    const consumed = store.consume(userId, guildId);
    if (!consumed.allowed) throw new Error("Quota bulan ini sudah habis. Gunakan /subscribe untuk menaik taraf.");
    await interaction.editReply(`🎛️ Menukar audio (${quality}, ${normalize ? "normalize" : "mix asal"})…`);
    await convertAudio(ffmpegPath, inputPath, outputPath, { quality, normalize });

    let effectiveQuality = quality;
    let outputInfo = await stat(outputPath);
    if (outputInfo.size > DISCORD_SAFE_MAX_BYTES && quality !== "compact") {
      await interaction.editReply("📦 Output terlalu besar untuk Discord; mengoptimumkan bitrate…");
      effectiveQuality = "compact";
      await convertAudio(ffmpegPath, inputPath, outputPath, { quality: effectiveQuality, normalize });
      outputInfo = await stat(outputPath);
    }
    if (outputInfo.size >= ROBLOX_MAX_BYTES) {
      throw new Error("Hasil masih melebihi had Roblox 20 MB.");
    }

    await interaction.editReply("📤 Menghantar fail siap…");
    await interaction.editReply({
      content: [
        `✅ Siap: OGG stereo 48 kHz · ${(duration / 60).toFixed(2)} minit · ${(outputInfo.size / 1024 / 1024).toFixed(2)} MB.`,
        `Kualiti: ${effectiveQuality}${normalize ? " · loudness dinormalisasi" : " · mix asal dikekalkan"}.`,
        `Pelan ${consumed.tier.toUpperCase()} · baki bulan ini: ${consumed.remaining}/${consumed.limit}.`,
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

  if (interaction.commandName === "subscription") {
    const quota = store.getQuota(interaction.user.id, interaction.guildId);
    await interaction.reply({
      content: `Pelan: **${quota.tier.toUpperCase()}**\nDigunakan: **${quota.used}/${quota.limit}**\nBaki bulan ini: **${quota.remaining}**`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (interaction.commandName === "subscribe") {
    const plan = interaction.options.getString("plan", true);
    if (plan === "server" && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content: "Pelan Server hanya boleh dibeli oleh ahli yang mempunyai permission Manage Server.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const checkoutUrl = await billing.createCheckout({
        plan,
        userId: interaction.user.id,
        guildId: interaction.guildId
      });
      await interaction.editReply(`Teruskan pembayaran ${plan === "server" ? "RM39" : "RM15"}/bulan di Stripe:\n${checkoutUrl}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Pembayaran tidak tersedia.";
      await interaction.editReply(`❌ ${message}`);
    }
    return;
  }

  if (interaction.commandName !== "roblox-audio") return;

  const attachment = interaction.options.getAttachment("file", true);
  const quality = interaction.options.getString("quality") || "standard";
  const normalize = interaction.options.getBoolean("normalize") || false;
  const quota = store.getQuota(interaction.user.id, interaction.guildId);

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

  if (quota.remaining <= 0) {
    await interaction.reply({
      content: "Quota bulan ini sudah habis. Gunakan `/subscribe` untuk Pro atau Server.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  await interaction.deferReply();
  const job = {
    interaction, attachment, quality, normalize,
    userId: interaction.user.id,
    guildId: interaction.guildId,
    tier: quota.tier
  };
  if (quota.tier === "free") jobQueue.push(job);
  else {
    const firstFree = jobQueue.findIndex((queued) => queued.tier === "free");
    if (firstFree === -1) jobQueue.push(job);
    else jobQueue.splice(firstFree, 0, job);
  }
  const position = jobQueue.indexOf(job) + (processing ? 2 : 1);
  if (position > 1) await interaction.editReply(`⏳ Masuk queue. Kedudukan: ${position}.`);
  void drainQueue();
});

client.login(token);

const httpServer = startServer({
  port: Number(process.env.PORT || 3000),
  billing,
  getStatus: () => ({
    discordReady: client.isReady(),
    guilds: client.guilds.cache.size,
    queue: jobQueue.length,
    billingConfigured: billing.configured
  })
});

async function shutdown(signal) {
  console.log(`${signal} diterima; menutup bot dengan selamat.`);
  client.destroy();
  httpServer.close();
  store.close();
  process.exit(0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
