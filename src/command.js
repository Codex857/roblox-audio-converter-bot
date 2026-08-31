import { SlashCommandBuilder } from "discord.js";

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
  );

export const robloxUploadCommand = new SlashCommandBuilder()
  .setName("roblox-upload")
  .setDescription("Tukar dan upload audio berlesen terus ke Roblox")
  .addAttachmentOption((option) =>
    option.setName("file").setDescription("Audio MP3, OGG, WAV, FLAC, M4A, atau AAC").setRequired(true)
  )
  .addBooleanOption((option) =>
    option.setName("rights_confirm").setDescription("Saya memiliki/hak lesen untuk upload audio ini").setRequired(true)
  )
  .addStringOption((option) =>
    option.setName("name").setDescription("Nama aset; kosongkan untuk guna nama fail").setMaxLength(50)
  )
  .addStringOption((option) =>
    option.setName("description").setDescription("Penerangan aset dan sumber lesen").setMaxLength(1000)
  );

export const allCommands = [robloxAudioCommand, robloxUploadCommand];
