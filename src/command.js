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

export const subscribeCommand = new SlashCommandBuilder()
  .setName("subscribe")
  .setDescription("Langgan Pro atau Server untuk quota tambahan")
  .addStringOption((option) =>
    option
      .setName("plan")
      .setDescription("Pro untuk diri sendiri; Server dikongsi satu server")
      .setRequired(true)
      .addChoices(
        { name: "Pro — RM15/bulan, 100 conversion", value: "pro" },
        { name: "Server — RM39/bulan, 500 conversion", value: "server" }
      )
  );

export const subscriptionCommand = new SlashCommandBuilder()
  .setName("subscription")
  .setDescription("Semak pelan, penggunaan dan baki quota bulan ini");

export const allCommands = [robloxAudioCommand, subscribeCommand, subscriptionCommand];
