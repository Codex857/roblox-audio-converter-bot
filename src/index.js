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
const BOT_VERSION = "2.9.1";
const ytDlpPath = process.env.YT_DLP_PATH?.trim() || "yt-dlp";
const dataDirectory = process.env.DATA_DIR?.trim() || join(process.cwd(), "data");
const robloxOAuthRedirectUri = process.env.ROBLOX_OAUTH_REDIRECT_URI?.trim()
  || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/oauth/roblox/callback` : "");
if (!token) throw new Error("DISCORD_TOKEN is not set in .env.");
if (!ffmpegPath || !ffprobeStatic.path) throw new Error("FFmpeg or FFprobe is not available.");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const defaultRoblox = createRobloxUploader({
  apiKey: process.env.ROBLOX_API_KEY,
  creatorType: process.env.CREATOR_TYPE || process.env.ROBLOX_CREATOR_TYPE,
  creatorId: process.env.CREATOR_ID || process.env.ROBLOX_CREATOR_ID
});
const robloxOAuth = await createRobloxOAuth({
  clientId: process.env.ROBLOX_OAUTH_CLIENT_ID,
  clientSecret: process.env.ROBLOX_OAUTH_CLIENT_SECRET,
  redirectUri: robloxOAuthRedirectUri,
  dataDirectory
});
const guildConfigStore = await new GuildConfigStore({
  directory: join(dataDirectory, "guild-creator-configs"),
  secret: process.env.SERVER_CONFIG_SECRET || token
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
const DEFAULT_ASSET_DESCRIPTION = "by codex eclipse";
let activeFileCount = 0;
let activeUserId = null;
let processing = false;
let youtubeReady = false;
let youtubeToolVersion = null;
let youtubeRefreshPromise = null;

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Bot is online as ${readyClient.user.tag}`);
  try {
    const application = await readyClient.application.fetch();
    if (application.owner?.id) defaultUploaderUsers.add(application.owner.id);
    if (application.owner?.members) {
      for (const member of application.owner.members.values()) {
        if (member.user?.id) defaultUploaderUsers.add(member.user.id);
      }
    }
  } catch (error) {
    console.warn("Could not read Discord app owner:", error instanceof Error ? error.message : error);
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
      "Thanks for inviting the Roblox audio bot.",
      "Before uploads can be used here, an admin should open `/menu` first.",
      "The bot will ask for this server's `ROBLOX_API_KEY`, `CREATOR_TYPE`, and `CREATOR_ID`.",
      "After setup is complete, `/menu` will show the normal upload options."
    ].join("\n"),
    allowedMentions: { parse: [] }
  }).catch(() => {});
});

async function refreshYouTubeDownloader(reason = "startup") {
  if (!youtubeRefreshPromise) {
    youtubeRefreshPromise = checkYouTubeTool(ytDlpPath)
      .then((version) => {
        youtubeReady = true;
        youtubeToolVersion = version;
        console.log(`YouTube downloader ready after ${reason}: yt-dlp ${version}`);
        return version;
      })
      .catch((error) => {
        youtubeReady = false;
        console.error(`YouTube downloader refresh failed after ${reason}:`, error.message);
        throw error;
      })
      .finally(() => {
        youtubeRefreshPromise = null;
      });
  }
  return youtubeRefreshPromise;
}

void refreshYouTubeDownloader("startup")
  .then((version) => {
    youtubeReady = true;
    youtubeToolVersion = version;
    console.log(`YouTube downloader ready: yt-dlp ${version}`);
  })
  .catch((error) => {
    console.error("YouTube downloader is not available:", error.message);
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
  return error instanceof Error ? error.message : "Unknown error.";
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
  const guildConfig = interaction.guildId ? guildConfigStore.getUploadConfig(interaction.guildId) : null;
  if (guildConfig?.apiKey) {
    return {
      uploader: createRobloxUploader({
        apiKey: guildConfig.apiKey,
        creatorType: guildConfig.creatorType,
        creatorId: guildConfig.creatorId
      }),
      label: `${guildConfig.creatorType} ${guildConfig.creatorId} (this server)`
    };
  }
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
        ? `${creatorType} ${creatorId} (this server)`
        : `${profile.username} (${profile.robloxUserId})`
    };
  }
  return null;
}

async function replyUploadTargetRequired(interaction) {
  const guildConfig = interaction.guildId ? guildConfigStore.get(interaction.guildId) : null;
  const content = guildConfig && !guildConfig.apiKeyConfigured
    ? "❌ This server has a creator ID, but no ROBLOX_API_KEY yet. An admin can open `/menu` and press **Setup Roblox** to add it."
    : "❌ This server has not set up a Roblox API key yet. An admin should open `/menu`, paste ROBLOX_API_KEY, choose Group/User, and enter CREATOR_ID.";
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
      .setLabel("I have rights - Upload")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`quick-upload:${requestId}:cancel`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary)
  )];
}

async function processConversionJob({ interaction, attachments, quality, normalize, speed = 1 }) {
  const attachment = attachments[0];
  let workDir;

  try {
    await interaction.editReply("⏬ Downloading audio...");
    workDir = await mkdtemp(join(tmpdir(), "roblox-audio-"));
    const inputPath = join(workDir, `${randomUUID()}${extname(attachment.name || ".audio")}`);
    const outputName = `${safeBaseName(attachment.name)}-roblox.ogg`;
    const outputPath = join(workDir, outputName);

    await downloadAttachment(attachment, inputPath);
    await interaction.editReply("🔎 Checking audio duration and format...");
    await inspectAudio(ffprobeStatic.path, inputPath, { speed });
    await interaction.editReply(`🎛️ Converting audio (${quality}, ${normalize ? "normalize" : "preserve mix"}, ${speedText(speed)})...`);
    await convertAudio(ffmpegPath, inputPath, outputPath, { quality, normalize, speed });

    let effectiveQuality = quality;
    let outputStat = await stat(outputPath);
    if (outputStat.size > DISCORD_SAFE_MAX_BYTES && quality !== "compact") {
      await interaction.editReply("📦 Output is too large for Discord; optimizing bitrate...");
      effectiveQuality = "compact";
      await convertAudio(ffmpegPath, inputPath, outputPath, { quality: effectiveQuality, normalize, speed });
      outputStat = await stat(outputPath);
    }
    const output = await inspectConvertedAudio(ffprobeStatic.path, outputPath);
    if (outputStat.size > DISCORD_SAFE_MAX_BYTES) {
      throw new Error("The finished file is still over Discord's upload limit after optimization.");
    }

    await interaction.editReply("📤 Sending the finished file...");
    await interaction.editReply({
      content: [
        `✅ Done: 48 kHz stereo OGG · ${(output.duration / 60).toFixed(2)} minutes · ${(output.size / 1024 / 1024).toFixed(2)} MB.`,
        `Quality: ${effectiveQuality}${normalize ? " · loudness normalized" : " · original mix preserved"} · speed ${speedText(speed)}.`,
        "Upload only audio you own or are licensed to use. Roblox moderation approval is not guaranteed."
      ].join("\n"),
      files: [{ attachment: outputPath, name: outputName }],
      allowedMentions: { parse: [] }
    });
  } catch (error) {
    await interaction.editReply({
      content: `❌ Could not process audio: ${errorMessage(error)}`,
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
    await editStatus(interaction, `⏬ [${index}/${total}] Downloading **${safeDiscordText(attachment.name)}**...`);
    workDir = await mkdtemp(join(tmpdir(), "roblox-upload-"));
    const inputPath = join(workDir, `${randomUUID()}${extname(attachment.name || ".audio")}`);
    const outputName = `${safeBaseName(attachment.name)}-roblox.ogg`;
    const outputPath = join(workDir, outputName);

    await downloadAttachment(attachment, inputPath);
    await editStatus(interaction, `🔎 [${index}/${total}] Checking **${safeDiscordText(attachment.name)}**...`);
    await inspectAudio(ffprobeStatic.path, inputPath, { speed });
    await editStatus(interaction, `🎛️ [${index}/${total}] Converting to high quality OGG, normalized loudness, speed ${speedText(speed)}...`);
    await convertAudio(ffmpegPath, inputPath, outputPath, { quality: "high", normalize: true, speed });
    await inspectConvertedAudio(ffprobeStatic.path, outputPath);

    await editStatus(interaction, `☁️ [${index}/${total}] Uploading **${safeDiscordText(displayName)}** to Roblox...`);
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
    `${successful.length ? "✅" : "❌"} Finished: ${successful.length}/${results.length} uploads succeeded.`,
    ...successful.map((result) => `✅ ${safeDiscordText(result.name)} — **${result.assetId}**`),
    ...failed.map((result) => `❌ ${safeDiscordText(result.name)} — ${safeDiscordText(result.error)}`),
    successful.length ? "JSON and Lua files are attached. Use audio only according to your rights/license." : "No assets were uploaded successfully."
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
      `⏳ Waiting for Roblox to process ${started.length} audio file(s)...`
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
    await editStatus(interaction, "🌐 Reading the link and downloading the audio file...");
    workDir = await mkdtemp(join(tmpdir(), "roblox-direct-audio-"));
    const source = await downloadDirectAudio({ url: directAudio.url, directory: workDir });
    displayName = assetDisplayName(source.name);
    const outputName = `${safeBaseName(source.name)}-roblox.ogg`;
    const outputPath = join(workDir, outputName);

    await editStatus(interaction, `🔎 Checking **${safeDiscordText(displayName)}**...`);
    await inspectAudio(ffprobeStatic.path, source.path, { speed: directAudio.speed });
    await editStatus(interaction, `🎛️ Editing **${safeDiscordText(displayName)}** with Roblox settings, speed ${speedText(directAudio.speed)}...`);
    await convertAudio(ffmpegPath, source.path, outputPath, { quality: "high", normalize: true, speed: directAudio.speed });
    await inspectConvertedAudio(ffprobeStatic.path, outputPath);

    await editStatus(interaction, `☁️ Uploading **${safeDiscordText(displayName)}** to Roblox...`);
    const operationPath = await uploader.upload({
      filePath: outputPath,
      fileName: outputName,
      displayName,
      description: DEFAULT_ASSET_DESCRIPTION
    });
    await editStatus(interaction, "⏳ Roblox is processing the audio...");
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
    await editStatus(interaction, "🔗 Reading the link and downloading YouTube audio as MP3...");
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

    await editStatus(interaction, `🎛️ Editing **${safeDiscordText(displayName)}** with Roblox settings...`);
    await inspectAudio(ffprobeStatic.path, source.path, { speed: youtube.speed });
    await convertAudio(ffmpegPath, source.path, outputPath, { quality: "high", normalize: true, speed: youtube.speed });
    await inspectConvertedAudio(ffprobeStatic.path, outputPath);

    await editStatus(interaction, `☁️ Uploading **${safeDiscordText(displayName)}** to Roblox...`);
    const operationPath = await uploader.upload({
      filePath: outputPath,
      fileName: outputName,
      displayName,
      description: DEFAULT_ASSET_DESCRIPTION
    });
    await editStatus(interaction, "⏳ Roblox is processing the audio...");
    const assetId = await uploader.waitForAsset(operationPath);
    await replyWithUploadResults(interaction, [{ index: 1, name: displayName, assetId }]);
  } catch (error) {
    const message = errorMessage(error);
    if (/YouTube is asking for login|blocking the cloud server address/i.test(message)) {
      if (!youtube.retriedAfterRefresh) {
        await editStatus(interaction, "♻️ YouTube blocked the first attempt. Refreshing the YouTube downloader and retrying once...");
        try {
          await refreshYouTubeDownloader("YouTube block");
          return processYouTubeUploadJob({
            interaction,
            youtube: { ...youtube, retriedAfterRefresh: true },
            uploader
          });
        } catch (refreshError) {
          console.warn("YouTube downloader refresh did not fix the block:", errorMessage(refreshError));
        }
      }
      await interaction.editReply({
        content: [
          "⚠️ **YouTube blocked the cloud server request.**",
          youtube.retriedAfterRefresh
            ? "The bot refreshed the YouTube downloader and retried once, but YouTube still blocked the server."
            : "The bot could not refresh the YouTube downloader enough to clear the block.",
          "The bot will not ask for your login or cookies.",
          "Choose one option below: upload the original MP3/WAV, paste a direct public audio file link, or read the YouTube tips."
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
          content: `❌ Audio job failed: ${errorMessage(error)}`,
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
      content: `Queue is almost full. Maximum ${MAX_PENDING_FILES} active/pending files; try again shortly.`,
      components: [],
      allowedMentions: { parse: [] }
    });
    return false;
  }
  const userPending = pendingFileCountForUser(job.interaction.user.id);
  if (userPending + jobFileCount(job) > MAX_PENDING_FILES_PER_USER) {
    await job.interaction.editReply({
      content: `Your queue is full. Maximum ${MAX_PENDING_FILES_PER_USER} pending files per user; try again after the current job finishes.`,
      components: [],
      allowedMentions: { parse: [] }
    });
    return false;
  }

  jobQueue.push(job);
  if (pendingBefore > 0) {
    await editStatus(job.interaction, `⏳ Added to queue. ${pendingBefore} file(s) ahead.`);
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
        `🎵 File: **${safeDiscordText(attachment.name)}**`,
        `The bot will convert audio at speed ${speedText(speed)} and upload to Roblox: ${safeDiscordText(target.label)}.`,
        "Press the green button to confirm you own this audio or have a license to use it."
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
      content: "⌛ Confirmation timed out. Run `/upload` again.",
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
      content: "❌ The YouTube downloader is not ready yet. Try again after the bot finishes starting.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  if (!interaction.options.getBoolean("rights_confirm", true)) {
    await interaction.reply({
      content: "❌ Upload cancelled. You must own this audio or have a license to use it.",
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
  await editStatus(interaction, `⏳ Link received. Starting auto-process at speed ${speedText(speed)} and uploading to ${safeDiscordText(target.label)}...\n<${url}>`);
  await enqueueJob({ interaction, youtube: { url, speed }, uploader: target.uploader });
}

async function handleQuickUploadButton(interaction) {
  const match = /^quick-upload:([a-f0-9]{32}):(confirm|cancel)$/.exec(interaction.customId);
  if (!match) return false;

  const [, requestId, action] = match;
  const pending = quickUploadConfirmations.get(requestId);
  if (!pending) {
    await interaction.reply({ content: "⌛ This request expired or was already used.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (interaction.user.id !== pending.ownerId) {
    await interaction.reply({ content: "❌ This button is not for you.", flags: MessageFlags.Ephemeral });
    return true;
  }

  quickUploadConfirmations.delete(requestId);
  if (action === "cancel") {
    await interaction.update({ content: "Upload cancelled.", components: [], allowedMentions: { parse: [] } });
    return true;
  }

  await interaction.update({ content: "⏳ Preparing upload...", components: [], allowedMentions: { parse: [] } });
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
        description: DEFAULT_ASSET_DESCRIPTION
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
        "❌ This server does not have its own Roblox API key yet.",
        "Ask a server admin to open `/menu` or press **Setup Roblox** to enter `ROBLOX_API_KEY`, choose `CREATOR_TYPE`, and enter `CREATOR_ID`."
      ].join("\n"),
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  const profile = robloxOAuth.getPublicProfile(interaction.user.id);
  if (profile) {
    await interaction.reply({
      content: [
        "✅ Your Roblox account is connected.",
        `Roblox: **${safeDiscordText(profile.username)}** (${profile.robloxUserId})`,
        "New uploads will go to this Roblox account, not the default community/group."
      ].join("\n"),
      components: disconnectRobloxComponents(),
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] }
    });
    return;
  }
  await interaction.reply({
    content: [
      "Connect your Roblox account to upload to your own account.",
      "The bot only asks for the official `asset:write` permission; tokens are stored encrypted on the server."
    ].join("\n"),
    components: makeRobloxConnectButton(interaction.user.id),
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] }
  });
}

async function handleRobloxAccountButton(interaction) {
  if (interaction.customId !== "roblox-account:disconnect") return false;
  if (!robloxOAuth.configured) {
    await interaction.reply({ content: "❌ Roblox OAuth is not configured.", flags: MessageFlags.Ephemeral });
    return true;
  }
  await robloxOAuth.disconnect(interaction.user.id);
  await interaction.update({
    content: "✅ Your Roblox account has been disconnected from this bot.",
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
    await interaction.reply({ content: "❌ This command can only be used in a Discord server.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!ensureGuildAdmin(interaction)) {
    await interaction.reply({ content: "❌ Only admins with Manage Server permission can change this server's Roblox setup.", flags: MessageFlags.Ephemeral });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "status") {
    const config = guildConfigStore.get(interaction.guildId);
    await interaction.reply({
      content: config
        ? [
            `✅ This server is set to Roblox ${config.creatorType} ${config.creatorId}.`,
            `API key: ${config.apiKeyConfigured ? "configured" : "not configured"}`
          ].join("\n")
        : "⚠️ This server does not have a Roblox creator yet. Use `/roblox-server set` first.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (subcommand === "clear") {
    await guildConfigStore.delete(interaction.guildId);
    await interaction.reply({
      content: "✅ This server's Roblox creator setup has been cleared. Normal user uploads are blocked until an admin sets it again.",
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
      `✅ This server is now set to Roblox ${saved.creatorType} ${saved.creatorId}.`,
      saved.apiKeyConfigured
        ? "This server's API key is stored encrypted."
        : "API key is not set yet. An admin can press **Setup Roblox** in `/menu` to add the API key."
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
        "🎵 **How to use the Roblox audio menu**",
        "**Developer/admin server:**",
        "1. Create a Roblox Open Cloud API key in Creator Dashboard > Credentials.",
        "2. Required permissions: Assets `asset:read` and `asset:write`.",
        "3. After inviting the bot, an admin opens `/menu`.",
        "4. If the server is not set up, the bot opens a form for `ROBLOX_API_KEY`, `CREATOR_TYPE`, and `CREATOR_ID`.",
        "5. If you choose `Group`, `CREATOR_ID` is the Group ID and the API key must have access to that group.",
        "6. If you choose `User`, `CREATOR_ID` is the User ID that owns the API key.",
        "7. Check setup: `/roblox-server status`. Change it again: press **Setup Roblox**.",
        "",
        "**Regular users:**",
        "1. Press **Upload File** for 1-5 files, **Paste Link** for a public audio file link, or **YouTube** for one public video.",
        "2. Tick the confirmation that you own the audio or have a license to use it.",
        "3. Submit the form and wait for the bot to return the Asset ID, JSON, and Lua.",
        "",
        "Audio links support Dropbox, Google Drive, Discord CDN, Cloudflare R2, and Amazon S3. YouTube links must use the YouTube option.",
        "All uploads still go through Roblox moderation. Playlists, live streams, private videos, and DRM are not supported."
      ].join("\n"),
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] }
    });
    return true;
  }

  if (interaction.customId === "music-menu:youtube-tips") {
    await interaction.reply({
      content: [
        "💡 **YouTube tips**",
        "YouTube can block cloud servers like Railway even when the video is public.",
        "",
        "**Fastest fix:** download/export the audio yourself, then press **Upload MP3/WAV Now**.",
        "**Direct link fix:** upload your licensed audio file to Dropbox, Google Drive, Discord CDN, Cloudflare R2, or Amazon S3, then press **Paste Direct Link**.",
        "**Best 24/7 fix:** run the bot on a trusted home/server IP instead of a datacenter IP.",
        "",
        "The bot does not use cookies, private videos, DRM bypasses, or account login workarounds."
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
      content: "❌ The YouTube downloader is not ready yet. Try again after the bot finishes starting.",
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
        content: "❌ Only admins with Manage Server permission can set this server's Roblox creator.",
        flags: MessageFlags.Ephemeral
      });
      return true;
    }
    try {
      const saved = await guildConfigStore.set(interaction.guildId, {
        apiKey: interaction.fields.getTextInputValue("roblox_api_key"),
        creatorType: interaction.fields.getStringSelectValues("creator_type")[0],
        creatorId: interaction.fields.getTextInputValue("creator_id"),
        updatedBy: interaction.user.id
      });
      await interaction.reply({
        content: [
          `✅ This server is now set to Roblox ${saved.creatorType} ${saved.creatorId}.`,
          saved.creatorType === "Group"
            ? "Uploads will go to that Roblox group/community ID."
            : "Uploads will go to that Roblox user creator ID.",
          "This server's ROBLOX_API_KEY is stored encrypted.",
          "Use `/roblox-server status` to double-check this ID."
        ].join("\n"),
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] }
      });
    } catch (error) {
      await interaction.reply({
        content: `❌ Setup failed: ${errorMessage(error)}`,
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
      content: "❌ Upload cancelled. You must own this audio or have a license to use it.",
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
        description: DEFAULT_ASSET_DESCRIPTION
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
      content: "❌ The YouTube downloader is not ready yet. Try again after the bot finishes starting.",
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
    const serverConfig = interaction.guildId ? guildConfigStore.get(interaction.guildId) : null;
    if (interaction.inGuild() && (!serverConfig || !serverConfig.apiKeyConfigured)) {
      if (ensureGuildAdmin(interaction)) {
        await interaction.showModal(robloxServerSetupModal());
        return;
      }
      await interaction.reply({
        content: "❌ This server has not set up Roblox yet. Ask an admin to open `/menu`, enter `ROBLOX_API_KEY`, choose `CREATOR_TYPE`, and enter `CREATOR_ID`.",
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] }
      });
      return;
    }
    const destinationLine = serverConfig
      ? `Destination: Roblox ${serverConfig.creatorType} ${serverConfig.creatorId}.`
      : "Destination: bot default.";
    await interaction.reply({
      content: [
        "🎵 **Menu Audio Roblox**",
        destinationLine,
        "Choose an upload method below. The bot will convert, edit, apply speed, and upload to Roblox after you confirm audio rights."
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
        "🎵 **How to use the Roblox audio bot**",
        "**For server developers/admins:**",
        "1. Create an API key in Roblox Creator Dashboard > Credentials.",
        "2. API key permissions: Assets `asset:read` and `asset:write`.",
        "3. After inviting the bot, an admin opens `/menu`.",
        "4. If not set up yet, the bot opens a form for `ROBLOX_API_KEY`, `CREATOR_TYPE`, and `CREATOR_ID`.",
        "5. Choose `Group` + Group ID to upload to a group/community.",
        "6. Choose `User` + User ID to upload to a user creator.",
        "7. For groups, the API key must be given access to that Group ID in Roblox.",
        "8. Use `/roblox-server status` to confirm. Use `/roblox-server clear` if the setup is wrong.",
        "",
        "**For regular users:**",
        "**Easiest way:** type `/menu`, then press **Upload File**, **Paste Link**, or **YouTube**.",
        "Fill the short form, tick the audio rights confirmation, then submit.",
        "",
        "The menu supports 1-5 files, one public audio file link, or one public YouTube video link.",
        "Choose speed `1x`, `1.5x`, or `2x`, then wait for the bot to return the Asset ID, JSON, and Lua.",
        "",
        "Older commands `/upload`, `/yt`, and `/roblox-upload` still work.",
        "Use audio you own or are licensed to use. Every upload still goes through Roblox moderation."
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
      content: "❌ Upload cancelled. You must own every audio file or have a license to use it.",
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
      description: interaction.options.getString("description") || DEFAULT_ASSET_DESCRIPTION
    } : null
  };
  await enqueueJob(job);
}

client.on(Events.InteractionCreate, (interaction) => {
  void handleInteraction(interaction).catch(async (error) => {
    console.error("Interaction error:", error);
    if (!interaction.isRepliable()) return;
    const payload = {
      content: "❌ The bot hit a temporary error. Try again shortly.",
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
  console.log(`${signal} received; shutting down safely.`);
  client.destroy();
  httpServer.close();
  process.exit(0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
