import { ActionRowBuilder, ButtonBuilder, ButtonStyle, CheckboxBuilder, FileUploadBuilder, LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, PermissionFlagsBits } from "discord.js";
import { normalizeYouTubeUrl } from "./youtube.js";

export function libraryButtons() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("library:add").setLabel("Add Original Audio").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("library:list").setLabel("Saved Links").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("library:delete").setLabel("Delete Saved Audio").setStyle(ButtonStyle.Danger)
  )];
}

export function libraryModal(action) {
  if (!["add", "delete"].includes(action)) throw new Error("Unknown library action.");
  const modal = new ModalBuilder().setCustomId(`library:${action}-modal`)
    .setTitle(action === "add" ? "Save Original Audio" : "Delete Saved Audio")
    .addLabelComponents(new LabelBuilder().setLabel("YouTube reference link")
      .setTextInputComponent(new TextInputBuilder().setCustomId("link").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(500)));
  if (action === "add") modal.addLabelComponents(new LabelBuilder().setLabel("Your original audio file")
    .setDescription("Up to 25 MB; shared within this server")
    .setFileUploadComponent(new FileUploadBuilder().setCustomId("file").setMinValues(1).setMaxValues(1).setRequired(true)));
  return modal.addLabelComponents(new LabelBuilder()
    .setLabel(action === "add" ? "I may store and share this audio" : "Permanently delete this saved audio")
    .setDescription(action === "add" ? "You own it or have permission for this server's use" : "Cannot be undone. Active uploads may still complete.")
    .setCheckboxComponent(new CheckboxBuilder().setCustomId("confirm").setDefault(false)));
}

export function createLibraryMenuHandler({ store, saveAudio }) {
  return async interaction => {
    if (!(interaction.isButton() || interaction.isModalSubmit()) || !interaction.customId?.startsWith("library:")) return false;
    if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: "Manage Server permission is required to manage Link Library.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const action = interaction.customId.slice("library:".length);
    if (interaction.isButton() && ["add", "delete"].includes(action)) {
      await interaction.showModal(libraryModal(action));
      return true;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      let content;
      if (interaction.isButton() && action === "home") {
        content = "📚 **Server Link Library**\n1. Add your original file and its YouTube reference link.\n2. Use that same link in YouTube Link or /yt.\nThe saved file is used without contacting YouTube. Up to 20 files, 25 MB each. Stored until deleted; separate for every server.";
      } else if (interaction.isButton() && action === "list") {
        const links = await store.list(interaction.guildId);
        content = links.length ? `📚 **Saved links (${links.length}/20)**\n${links.map(id => `<https://youtu.be/${id}>`).join("\n")}\nCopy a link into YouTube Link or /yt to use it.` : "Your library is empty. Press Add Original Audio to save your first track.";
      } else if (interaction.isModalSubmit() && ["add-modal", "delete-modal"].includes(action)) {
        if (interaction.fields.getCheckbox("confirm") !== true) throw new Error("Please tick the confirmation box. Nothing was changed.");
        const url = normalizeYouTubeUrl(interaction.fields.getTextInputValue("link"));
        if (action === "add-modal") {
          const files = [...interaction.fields.getUploadedFiles("file", true).values()];
          if (files.length !== 1) throw new Error("Choose exactly one original audio file.");
          await saveAudio(interaction.guildId, url, files[0]);
          content = "✅ Original audio saved. Use the same link in YouTube Link or /yt. This file has not been uploaded to Roblox yet.";
        } else {
          await store.remove(interaction.guildId, url);
          content = "Saved audio removed, if present. Restore it by adding the original file again. Active uploads may still complete.";
        }
      } else throw new Error("This library action is unavailable. Open /menu again.");
      await interaction.editReply({ content, components: libraryButtons(), allowedMentions: { parse: [] } });
    } catch (error) {
      const message = error?.code ? "Storage or download failed. Contact the bot administrator." : (error instanceof Error ? error.message : "Unexpected error.");
      await interaction.editReply({ content: `❌ ${message}`.slice(0, 1900), components: libraryButtons(), allowedMentions: { parse: [] } });
    }
    return true;
  };
}
