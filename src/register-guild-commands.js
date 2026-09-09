import "dotenv/config";
import { Client, Events, GatewayIntentBits, REST, Routes } from "discord.js";
import { allCommands } from "./command.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
if (!token || !clientId) throw new Error("DISCORD_TOKEN or DISCORD_CLIENT_ID is not set.");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const rest = new REST({ version: "10" }).setToken(token);

client.once(Events.ClientReady, async () => {
  try {
    for (const guild of client.guilds.cache.values()) {
      await rest.put(Routes.applicationGuildCommands(clientId, guild.id), {
        body: allCommands.map((command) => command.toJSON())
      });
      console.log(`Commands registered to server: ${guild.name}`);
    }
  } finally {
    client.destroy();
  }
});

await client.login(token);
