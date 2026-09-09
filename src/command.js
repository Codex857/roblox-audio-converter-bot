import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

function speedOption(option) {
  return option
    .setName("speed")
    .setDescription("Kelajuan audio; 1x ialah normal")
    .addChoices(
      { name: "1x — Normal", value: "1" },
      { name: "1.5x — Lebih laju", value: "1.5" },
      { name: "2x — Dua kali laju", value: "2" }
    );
}

export const robloxAudioCommand = new SlashCommandBuilder()
  .setName("roblox-audio")
  .setDescription("Tukar audio milik anda kepada OGG yang sesuai untuk Roblox")
  .addAttachmentOption((option) =>
    option.setName("file").setDescription("Audio MP3, OGG, WAV, FLAC, M4A, atau AAC").setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("quality")
      .setDescription("Kualiti output; standard disyorkan")
      .addChoices(
        { name: "Compact (128 kbps)", value: "compact" },
        { name: "Standard (160 kbps)", value: "standard" },
        { name: "High (192 kbps)", value: "high" }
      )
  )
  .addBooleanOption((option) =>
    option
      .setName("normalize")
      .setDescription("Samakan loudness; biarkan off untuk mengekalkan mix asal")
  )
  .addStringOption(speedOption);

export const robloxUploadCommand = new SlashCommandBuilder()
  .setName("roblox-upload")
  .setDescription("Tukar dan upload sehingga 5 audio berlesen terus ke Roblox")
  .addAttachmentOption((option) =>
    option.setName("file").setDescription("Audio pertama (MP3, OGG, WAV, FLAC, M4A, atau AAC)").setRequired(true)
  )
  .addBooleanOption((option) =>
    option.setName("rights_confirm").setDescription("Saya memiliki/hak lesen untuk semua audio ini").setRequired(true)
  )
  .addAttachmentOption((option) =>
    option.setName("file_2").setDescription("Audio kedua (pilihan)")
  )
  .addAttachmentOption((option) =>
    option.setName("file_3").setDescription("Audio ketiga (pilihan)")
  )
  .addAttachmentOption((option) =>
    option.setName("file_4").setDescription("Audio keempat (pilihan)")
  )
  .addAttachmentOption((option) =>
    option.setName("file_5").setDescription("Audio kelima (pilihan)")
  )
  .addStringOption((option) =>
    option.setName("name").setDescription("Nama aset jika hanya satu fail; jika kosong guna nama fail").setMaxLength(50)
  )
  .addStringOption((option) =>
    option.setName("description").setDescription("Penerangan aset dan sumber lesen").setMaxLength(1000)
  )
  .addStringOption(speedOption);

export const robloxHelpCommand = new SlashCommandBuilder()
  .setName("roblox-help")
  .setDescription("Tunjukkan cara paling mudah menggunakan bot audio Roblox");

export const quickUploadCommand = new SlashCommandBuilder()
  .setName("upload")
  .setDescription("Cara mudah: pilih satu lagu dan tekan butang upload")
  .addAttachmentOption((option) =>
    option.setName("file").setDescription("Pilih fail lagu anda").setRequired(true)
  )
  .addStringOption(speedOption);

export const youtubeUploadCommand = new SlashCommandBuilder()
  .setName("yt")
  .setDescription("Tampal link YouTube dan terus auto edit serta upload")
  .addStringOption((option) =>
    option.setName("link").setDescription("Link satu video YouTube public").setRequired(true).setMaxLength(300)
  )
  .addBooleanOption((option) =>
    option
      .setName("rights_confirm")
      .setDescription("Saya memiliki atau mempunyai lesen untuk audio ini")
      .setRequired(true)
  )
  .addStringOption(speedOption);

export const menuCommand = new SlashCommandBuilder()
  .setName("menu")
  .setDescription("Buka menu paling mudah untuk upload audio atau link YouTube");

export const robloxAccountCommand = new SlashCommandBuilder()
  .setName("roblox-account")
  .setDescription("Sambung atau putuskan akaun Roblox peribadi dengan selamat");

export const robloxServerCommand = new SlashCommandBuilder()
  .setName("roblox-server")
  .setDescription("Tetapkan destinasi creator Roblox untuk server ini")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((subcommand) =>
    subcommand
      .setName("set")
      .setDescription("Set creator Roblox server ini")
      .addStringOption((option) =>
        option
          .setName("creator_type")
          .setDescription("Jenis creator Roblox")
          .setRequired(true)
          .addChoices(
            { name: "Group", value: "Group" },
            { name: "User", value: "User" }
          )
      )
      .addStringOption((option) =>
        option
          .setName("creator_id")
          .setDescription("ID group/user Roblox untuk server ini")
          .setRequired(true)
          .setMaxLength(30)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("status").setDescription("Lihat destinasi creator Roblox server ini")
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("clear").setDescription("Padam destinasi creator Roblox server ini")
  );

export const allCommands = [
  menuCommand,
  robloxAccountCommand,
  robloxServerCommand,
  quickUploadCommand,
  youtubeUploadCommand,
  robloxUploadCommand,
  robloxAudioCommand,
  robloxHelpCommand
];
