import "dotenv/config";
import { REST, Routes } from "discord.js";
import { allCommands } from "./command.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const globalOnly = process.argv.includes("--global");
const guildId = globalOnly ? null : process.env.DISCORD_GUILD_ID;

if (!token || !clientId) {
  throw new Error("Tetapkan DISCORD_TOKEN dan DISCORD_CLIENT_ID dalam .env.");
}

const rest = new REST({ version: "10" }).setToken(token);
const route = guildId
  ? Routes.applicationGuildCommands(clientId, guildId)
  : Routes.applicationCommands(clientId);

await rest.put(route, { body: allCommands.map((command) => command.toJSON()) });
console.log(guildId ? "Command didaftarkan pada test server." : "Command global didaftarkan untuk semua server.");
