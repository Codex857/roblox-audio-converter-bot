import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CheckboxBuilder,
  FileUploadBuilder,
  LabelBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";

export function mainMenuComponents() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("music-menu:file")
      .setLabel("Pilih Fail Audio")
      .setEmoji("📁")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("music-menu:audio-link")
      .setLabel("Paste Link Audio")
      .setEmoji("🌐")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("music-menu:youtube")
      .setLabel("YouTube Auto Upload")
      .setEmoji("🔗")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("music-menu:help")
      .setLabel("Bantuan")
      .setEmoji("❓")
      .setStyle(ButtonStyle.Secondary)
  )];
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
      rightsLabel()
    );
}
