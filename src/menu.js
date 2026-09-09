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
        .setLabel("Upload Fail")
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
        .setLabel("Cara Guna")
        .setEmoji("❓")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

export function youtubeFallbackComponents() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("music-menu:file")
      .setLabel("Upload MP3/WAV Sekarang")
      .setEmoji("📁")
      .setStyle(ButtonStyle.Primary)
  )];
}

function rightsLabel() {
  return new LabelBuilder()
    .setLabel("Pengesahan hak audio")
    .setDescription("Wajib ditanda: saya memiliki atau mempunyai lesen audio ini")
    .setCheckboxComponent(
      new CheckboxBuilder().setCustomId("rights_confirm").setDefault(false)
    );
}

function speedLabel() {
  return new LabelBuilder()
    .setLabel("Kelajuan audio")
    .setDescription("1x normal; 1.5x atau 2x mempercepat tanpa menaikkan pitch")
    .setStringSelectMenuComponent(
      new StringSelectMenuBuilder()
        .setCustomId("audio_speed")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel("1x — Normal")
            .setValue("1")
            .setDefault(true),
          new StringSelectMenuOptionBuilder().setLabel("1.5x — Lebih laju").setValue("1.5"),
          new StringSelectMenuOptionBuilder().setLabel("2x — Dua kali laju").setValue("2")
        )
    );
}

export function fileUploadModal() {
  return new ModalBuilder()
    .setCustomId("music-menu:file-modal")
    .setTitle("Upload Audio ke Roblox")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Pilih 1 hingga 5 fail audio")
        .setDescription("MP3, OGG, WAV, FLAC, M4A atau AAC")
        .setFileUploadComponent(
          new FileUploadBuilder()
            .setCustomId("audio_files")
            .setMinValues(1)
            .setMaxValues(5)
            .setRequired(true)
        ),
      speedLabel(),
      rightsLabel()
    );
}

export function youtubeUploadModal() {
  return new ModalBuilder()
    .setCustomId("music-menu:youtube-modal")
    .setTitle("YouTube Auto Convert & Upload")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Link satu video YouTube public")
        .setDescription("Playlist, live dan video private tidak disokong")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("youtube_link")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("https://www.youtube.com/watch?v=...")
            .setMaxLength(300)
            .setRequired(true)
        ),
      speedLabel(),
      rightsLabel()
    );
}

export function directAudioUploadModal() {
  return new ModalBuilder()
    .setCustomId("music-menu:audio-link-modal")
    .setTitle("Paste Link Audio")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Link terus ke fail audio public")
        .setDescription("Dropbox, Google Drive, Discord CDN, R2 atau S3")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("audio_link")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("https://.../lagu.mp3")
            .setMaxLength(1000)
            .setRequired(true)
        ),
      speedLabel(),
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
        .setDescription("Paste API key developer server ini. Bot simpan encrypted.")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("roblox_api_key")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("Masukkan ROBLOX_API_KEY")
            .setMaxLength(2000)
            .setRequired(true)
        ),
      new LabelBuilder()
        .setLabel("Jenis creator Roblox")
        .setDescription("Pilih satu sahaja")
        .setStringSelectMenuComponent(
          new StringSelectMenuBuilder()
            .setCustomId("creator_type")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(
              new StringSelectMenuOptionBuilder()
                .setLabel("Group")
                .setDescription("Upload masuk ke Roblox group/community")
                .setValue("Group")
                .setDefault(true),
              new StringSelectMenuOptionBuilder()
                .setLabel("User")
                .setDescription("Upload masuk ke Roblox user creator")
                .setValue("User")
            )
        ),
      new LabelBuilder()
        .setLabel("Creator ID Roblox")
        .setDescription("Isi SATU ID sahaja: Group ID jika pilih Group, User ID jika pilih User")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("creator_id")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Contoh: 123456789")
            .setMaxLength(30)
            .setRequired(true)
        )
    );
}
