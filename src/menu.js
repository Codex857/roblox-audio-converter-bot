import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CheckboxBuilder,
  FileUploadBuilder,
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";

export function mainMenuComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("music-menu:file")
        .setLabel("Start Upload")
        .setEmoji("📁")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("music-menu:audio-link")
        .setLabel("Paste Link")
        .setEmoji("🌐")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("music-menu:youtube")
        .setLabel("YouTube")
        .setEmoji("🔗")
        .setStyle(ButtonStyle.Danger)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("music-menu:account")
        .setLabel("Setup Roblox")
        .setEmoji("⚙️")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("music-menu:help")
        .setLabel("How to Use")
        .setEmoji("❓")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

export function youtubeFallbackComponents() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("music-menu:file")
      .setLabel("Upload MP3/WAV Now")
      .setEmoji("📁")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("music-menu:audio-link")
      .setLabel("Paste Direct Link")
      .setEmoji("🌐")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("music-menu:youtube-tips")
      .setLabel("YouTube Tips")
      .setEmoji("💡")
      .setStyle(ButtonStyle.Secondary)
  )];
}

function rightsLabel() {
  return new LabelBuilder()
    .setLabel("Audio rights confirmation")
    .setDescription("Required: I own this audio or have a license to use it")
    .setCheckboxComponent(
      new CheckboxBuilder().setCustomId("rights_confirm").setDefault(false)
    );
}

function speedLabel() {
  return new LabelBuilder()
    .setLabel("Audio speed")
    .setDescription("Change tempo without raising or lowering pitch")
    .setStringSelectMenuComponent(
      new StringSelectMenuBuilder()
        .setCustomId("audio_speed")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel("0.75x - Slower").setValue("0.75"),
          new StringSelectMenuOptionBuilder()
            .setLabel("1x - Normal")
            .setValue("1")
            .setDefault(true),
          new StringSelectMenuOptionBuilder().setLabel("1.25x - Slightly faster").setValue("1.25"),
          new StringSelectMenuOptionBuilder().setLabel("1.5x - Faster").setValue("1.5"),
          new StringSelectMenuOptionBuilder().setLabel("2x - Double speed").setValue("2")
        )
    );
}

function presetLabel() {
  return new LabelBuilder()
    .setLabel("Audio style")
    .setDescription("Preserve keeps the original bass, vocal, and dynamics")
    .setStringSelectMenuComponent(
      new StringSelectMenuBuilder()
        .setCustomId("audio_preset")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel("Preserve Original").setValue("preserve").setDefault(true),
          new StringSelectMenuOptionBuilder().setLabel("Balanced Loudness").setValue("balanced"),
          new StringSelectMenuOptionBuilder().setLabel("Bass Boost").setValue("bass"),
          new StringSelectMenuOptionBuilder().setLabel("Vocal Clarity").setValue("vocal")
        )
    );
}

export function fileUploadModal() {
  return new ModalBuilder()
    .setCustomId("music-menu:file-modal")
    .setTitle("Upload Audio to Roblox")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Choose 1 to 5 audio files")
        .setDescription("MP3, OGG, WAV, FLAC, M4A, or AAC")
        .setFileUploadComponent(
          new FileUploadBuilder()
            .setCustomId("audio_files")
            .setMinValues(1)
            .setMaxValues(5)
            .setRequired(true)
        ),
      speedLabel(),
      presetLabel(),
      rightsLabel()
    );
}

export function youtubeUploadModal() {
  return new ModalBuilder()
    .setCustomId("music-menu:youtube-modal")
    .setTitle("YouTube Auto Convert & Upload")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Public YouTube video link")
        .setDescription("Playlists, live videos, and private videos are not supported")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("youtube_link")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("https://www.youtube.com/watch?v=...")
            .setMaxLength(300)
            .setRequired(true)
        ),
      speedLabel(),
      presetLabel(),
      rightsLabel()
    );
}

export function directAudioUploadModal() {
  return new ModalBuilder()
    .setCustomId("music-menu:audio-link-modal")
    .setTitle("Paste Link Audio")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Direct public audio file link")
        .setDescription("Dropbox, Google Drive, Discord CDN, R2, or S3")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("audio_link")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("https://.../song.mp3")
            .setMaxLength(1000)
            .setRequired(true)
        ),
      speedLabel(),
      presetLabel(),
      rightsLabel()
    );
}

export function robloxServerSetupModal() {
  return new ModalBuilder()
    .setCustomId("music-menu:server-setup-modal")
    .setTitle("Setup Creator Roblox Server")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Roblox Open Cloud API Key")
        .setDescription("Paste this server developer API key. The bot stores it encrypted.")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("roblox_api_key")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("Enter ROBLOX_API_KEY")
            .setMaxLength(2000)
            .setRequired(true)
        ),
      new LabelBuilder()
        .setLabel("Roblox creator type")
        .setDescription("Choose one")
        .setStringSelectMenuComponent(
          new StringSelectMenuBuilder()
            .setCustomId("creator_type")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(
              new StringSelectMenuOptionBuilder()
                .setLabel("Group")
                .setDescription("Upload to a Roblox group/community")
                .setValue("Group")
                .setDefault(true),
              new StringSelectMenuOptionBuilder()
                .setLabel("User")
                .setDescription("Upload to a Roblox user creator")
                .setValue("User")
            )
        ),
      new LabelBuilder()
        .setLabel("Creator ID Roblox")
        .setDescription("Enter ONE ID only: Group ID for Group, User ID for User")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("creator_id")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Example: 123456789")
            .setMaxLength(30)
            .setRequired(true)
        )
    );
}
