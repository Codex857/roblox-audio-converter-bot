import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

function speedOption(option) {
  return option
    .setName("speed")
    .setDescription("Audio speed; 1x is normal")
    .addChoices(
      { name: "0.75x - Slower", value: "0.75" },
      { name: "1x - Normal", value: "1" },
      { name: "1.25x - Slightly faster", value: "1.25" },
      { name: "1.5x - Faster", value: "1.5" },
      { name: "2x - Double speed", value: "2" }
    );
}

function presetOption(option) {
  return option
    .setName("preset")
    .setDescription("Audio style; Preserve Original keeps the original mix")
    .addChoices(
      { name: "Preserve Original", value: "preserve" },
      { name: "Balanced Loudness", value: "balanced" },
      { name: "Bass Boost", value: "bass" },
      { name: "Vocal Clarity", value: "vocal" }
    );
}

function trimOption(option) {
  return option
    .setName("trim")
    .setDescription("Optional start-end seconds, for example 30-90")
    .setMaxLength(30);
}

export const robloxAudioCommand = new SlashCommandBuilder()
  .setName("roblox-audio")
  .setDescription("Convert owned or licensed audio to a Roblox-ready OGG file")
  .addAttachmentOption((option) =>
    option.setName("file").setDescription("Audio MP3, OGG, WAV, FLAC, M4A, atau AAC").setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("quality")
      .setDescription("Output quality; standard is recommended")
      .addChoices(
        { name: "Compact (128 kbps)", value: "compact" },
        { name: "Standard (160 kbps)", value: "standard" },
        { name: "High (192 kbps)", value: "high" }
      )
  )
  .addBooleanOption((option) =>
    option
      .setName("normalize")
      .setDescription("Normalize loudness; leave off to preserve the original mix")
  )
  .addStringOption(speedOption)
  .addStringOption(presetOption)
  .addStringOption(trimOption);

export const robloxUploadCommand = new SlashCommandBuilder()
  .setName("roblox-upload")
  .setDescription("Convert and upload up to 5 licensed audio files to Roblox")
  .addAttachmentOption((option) =>
    option.setName("file").setDescription("First audio file (MP3, OGG, WAV, FLAC, M4A, or AAC)").setRequired(true)
  )
  .addBooleanOption((option) =>
    option.setName("rights_confirm").setDescription("I own or have a license for all uploaded audio").setRequired(true)
  )
  .addAttachmentOption((option) =>
    option.setName("file_2").setDescription("Second audio file (optional)")
  )
  .addAttachmentOption((option) =>
    option.setName("file_3").setDescription("Third audio file (optional)")
  )
  .addAttachmentOption((option) =>
    option.setName("file_4").setDescription("Fourth audio file (optional)")
  )
  .addAttachmentOption((option) =>
    option.setName("file_5").setDescription("Fifth audio file (optional)")
  )
  .addStringOption((option) =>
    option.setName("name").setDescription("Asset name for one file; defaults to the file name").setMaxLength(50)
  )
  .addStringOption((option) =>
    option.setName("description").setDescription("Asset description and license/source notes").setMaxLength(1000)
  )
  .addStringOption(speedOption)
  .addStringOption(presetOption)
  .addStringOption(trimOption);

export const robloxHelpCommand = new SlashCommandBuilder()
  .setName("roblox-help")
  .setDescription("Show the easiest way to use the Roblox audio bot");

export const quickUploadCommand = new SlashCommandBuilder()
  .setName("upload")
  .setDescription("Easy mode: choose one audio file and confirm upload")
  .addAttachmentOption((option) =>
    option.setName("file").setDescription("Choose your audio file").setRequired(true)
  )
  .addStringOption(speedOption)
  .addStringOption(presetOption)
  .addStringOption(trimOption);

export const youtubeUploadCommand = new SlashCommandBuilder()
  .setName("yt")
  .setDescription("Paste a YouTube link, then auto edit and upload")
  .addStringOption((option) =>
    option.setName("link").setDescription("One public YouTube video link").setRequired(true).setMaxLength(300)
  )
  .addBooleanOption((option) =>
    option
      .setName("rights_confirm")
      .setDescription("I own or have a license for this audio")
      .setRequired(true)
  )
  .addStringOption(speedOption)
  .addStringOption(presetOption)
  .addStringOption(trimOption);

export const menuCommand = new SlashCommandBuilder()
  .setName("menu")
  .setDescription("Open the easiest menu for audio, direct links, or YouTube");

export const historyCommand = new SlashCommandBuilder()
  .setName("history")
  .setDescription("Show the latest Roblox audio uploads for this server");

export const generateMusicCommand = new SlashCommandBuilder()
  .setName("generate-music")
  .setDescription("Generate an original AI game soundtrack")
  .addStringOption((option) => option.setName("prompt").setDescription("Describe the original music you want").setRequired(true).setMinLength(10).setMaxLength(1800))
  .addBooleanOption((option) => option.setName("rights_confirm").setDescription("I will not request imitation of an artist or copyrighted song").setRequired(true))
  .addStringOption((option) => option.setName("genre").setDescription("Music genre or game mood").setMaxLength(80))
  .addStringOption((option) => option.setName("mode").setDescription("Instrumental or vocal").addChoices(
    { name: "Instrumental", value: "instrumental" },
    { name: "Vocal", value: "vocal" }
  ))
  .addIntegerOption((option) => option.setName("duration").setDescription("Target duration").addChoices(
    { name: "30 seconds", value: 30 },
    { name: "60 seconds", value: 60 },
    { name: "120 seconds", value: 120 }
  ))
  .addIntegerOption((option) => option.setName("bpm").setDescription("Optional tempo (50-220 BPM)").setMinValue(50).setMaxValue(220))
  .addBooleanOption((option) => option.setName("seamless_loop").setDescription("Make the ending transition smoothly back to the beginning"))
  .addBooleanOption((option) => option.setName("upload_to_roblox").setDescription("Convert and upload the result to this server's Roblox creator"));

export const aiStatusCommand = new SlashCommandBuilder()
  .setName("ai-status")
  .setDescription("Check AI Music readiness and your remaining daily generations");

export const robloxAccountCommand = new SlashCommandBuilder()
  .setName("roblox-account")
  .setDescription("Set up or update this server's Roblox upload credentials");

export const robloxServerCommand = new SlashCommandBuilder()
  .setName("roblox-server")
  .setDescription("Configure the Roblox creator destination for this server")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((subcommand) =>
    subcommand
      .setName("set")
      .setDescription("Set this server's Roblox creator")
      .addStringOption((option) =>
        option
          .setName("creator_type")
          .setDescription("Roblox creator type")
          .setRequired(true)
          .addChoices(
            { name: "Group", value: "Group" },
            { name: "User", value: "User" }
          )
      )
      .addStringOption((option) =>
        option
          .setName("creator_id")
          .setDescription("Roblox group/user ID for this server")
          .setRequired(true)
          .setMaxLength(30)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("status").setDescription("View this server's Roblox creator destination")
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("role-add")
      .setDescription("Allow a Discord role to upload audio")
      .addRoleOption((option) => option.setName("role").setDescription("Role allowed to upload").setRequired(true))
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("role-remove")
      .setDescription("Remove a role from the upload allowlist")
      .addRoleOption((option) => option.setName("role").setDescription("Role to remove").setRequired(true))
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("roles").setDescription("View roles allowed to upload audio")
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("roles-clear").setDescription("Allow every server member to upload")
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("audit-channel")
      .setDescription("Send upload results to an audit log channel")
      .addChannelOption((option) => option
        .setName("channel")
        .setDescription("Text channel for upload logs")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true))
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("audit-clear").setDescription("Disable the upload audit log")
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("clear").setDescription("Clear this server's Roblox creator setup")
  );

export const allCommands = [
  menuCommand,
  generateMusicCommand,
  aiStatusCommand,
  historyCommand,
  robloxAccountCommand,
  robloxServerCommand,
  quickUploadCommand,
  youtubeUploadCommand,
  robloxUploadCommand,
  robloxAudioCommand,
  robloxHelpCommand
];
