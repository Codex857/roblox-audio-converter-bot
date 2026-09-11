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
        .setLabel("YouTube Link")
        .setEmoji("🔗")
        .setStyle(ButtonStyle.Danger)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("music-menu:check")
        .setLabel("Smart Audio Check")
        .setEmoji("🔬")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("music-menu:ai")
        .setLabel("AI Music (Optional)")
        .setEmoji("✨")
        .setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("music-menu:account")
        .setLabel("Setup Roblox")
        .setEmoji("⚙️")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("music-menu:help")
        .setLabel("Help Guide")
        .setEmoji("❓")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("music-menu:tools")
        .setLabel("Developer Tools")
        .setEmoji("🧩")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

export function audioCheckModal() {
  return new ModalBuilder()
    .setCustomId("music-menu:check-modal")
    .setTitle("Audio Health Check")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Choose one audio file")
        .setDescription("Read-only check; nothing is uploaded to Roblox")
        .setFileUploadComponent(new FileUploadBuilder()
          .setCustomId("check_audio_file")
          .setMinValues(1)
          .setMaxValues(1)
          .setRequired(true))
    );
}

export function aiMusicModal() {
  return new ModalBuilder()
    .setCustomId("music-menu:ai-modal")
    .setTitle("Generate Original AI Music")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Describe your soundtrack")
        .setDescription("Mood, instruments, energy, and game scene")
        .setTextInputComponent(new TextInputBuilder()
          .setCustomId("ai_prompt")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("Dark futuristic racing music with heavy bass...")
          .setMinLength(10)
          .setMaxLength(1800)
          .setRequired(true)),
      new LabelBuilder()
        .setLabel("Genre or game mood")
        .setTextInputComponent(new TextInputBuilder()
          .setCustomId("ai_genre")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Synthwave, horror, obby, combat...")
          .setMaxLength(80)
          .setRequired(false)),
      new LabelBuilder()
        .setLabel("Music type")
        .setStringSelectMenuComponent(new StringSelectMenuBuilder()
          .setCustomId("ai_mode")
          .addOptions(
            new StringSelectMenuOptionBuilder().setLabel("Instrumental").setValue("instrumental").setDefault(true),
            new StringSelectMenuOptionBuilder().setLabel("Instrumental seamless loop").setValue("instrumental_loop"),
            new StringSelectMenuOptionBuilder().setLabel("Vocal + original lyrics").setValue("vocal"),
            new StringSelectMenuOptionBuilder().setLabel("Vocal seamless loop").setValue("vocal_loop")
          )),
      new LabelBuilder()
        .setLabel("Duration")
        .setStringSelectMenuComponent(new StringSelectMenuBuilder()
          .setCustomId("ai_duration")
          .addOptions(
            new StringSelectMenuOptionBuilder().setLabel("30 seconds - Fast preview").setValue("30").setDefault(true),
            new StringSelectMenuOptionBuilder().setLabel("60 seconds").setValue("60"),
            new StringSelectMenuOptionBuilder().setLabel("120 seconds").setValue("120")
          )),
      new LabelBuilder()
        .setLabel("Original music confirmation")
        .setDescription("I will not request imitation of an artist or copyrighted song")
        .setCheckboxComponent(new CheckboxBuilder().setCustomId("ai_rights_confirm").setDefault(false))
    );
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

function trimLabel() {
  return new LabelBuilder()
    .setLabel("Trim (optional)")
    .setDescription("Enter start-end seconds, for example 30-90")
    .setTextInputComponent(
      new TextInputBuilder()
        .setCustomId("audio_trim")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Leave empty for the full audio")
        .setMaxLength(30)
        .setRequired(false)
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
      trimLabel(),
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
      trimLabel(),
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
      trimLabel(),
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
