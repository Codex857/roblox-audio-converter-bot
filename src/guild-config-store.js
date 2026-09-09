import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const GUILD_ID = /^\d{15,25}$/;
const CREATOR_TYPES = new Set(["User", "Group"]);

export function normalizeCreatorConfig(config = {}) {
  const rawCreatorType = String(config.creatorType || "").trim().toLowerCase();
  const creatorType = rawCreatorType === "group" ? "Group" : rawCreatorType === "user" ? "User" : String(config.creatorType || "").trim();
  const creatorId = String(config.creatorId || "").trim();
  if (!CREATOR_TYPES.has(creatorType)) throw new Error("Pilih Group atau User sahaja.");
  if (!/^\d+$/.test(creatorId)) throw new Error("Isi nombor ID sahaja. Jika pilih Group, isi Group ID. Jika pilih User, isi User ID.");
  return { creatorType, creatorId };
}

function validateGuildId(guildId) {
  const value = String(guildId || "");
  if (!GUILD_ID.test(value)) throw new Error("Discord server ID tidak sah.");
  return value;
}

function publicConfig(config) {
  if (!config) return null;
  return {
    creatorType: config.creatorType,
    creatorId: config.creatorId,
    updatedBy: config.updatedBy || null,
    updatedAt: config.updatedAt || null
  };
}

export class GuildConfigStore {
  constructor({ directory }) {
    if (!directory) throw new Error("Direktori konfigurasi server diperlukan.");
    this.directory = directory;
    this.guilds = new Map();
    this.corruptFiles = 0;
  }

  async init() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    let files = [];
    try {
      files = await readdir(this.directory);
    } catch {
      return this;
    }
    for (const file of files) {
      const match = /^(\d{15,25})\.json$/.exec(file);
      if (!match) continue;
      try {
        const record = JSON.parse(await readFile(join(this.directory, file), "utf8"));
        this.guilds.set(match[1], publicConfig(normalizeCreatorConfig(record)));
      } catch {
        this.corruptFiles += 1;
      }
    }
    return this;
  }

  get size() {
    return this.guilds.size;
  }

  get(guildId) {
    const id = validateGuildId(guildId);
    return publicConfig(this.guilds.get(id));
  }

  async set(guildId, config) {
    const id = validateGuildId(guildId);
    const saved = {
      ...normalizeCreatorConfig(config),
      updatedBy: String(config.updatedBy || ""),
      updatedAt: new Date().toISOString()
    };
    const destination = join(this.directory, `${id}.json`);
    const temporary = join(this.directory, `.${id}.${process.pid}.${Date.now()}.tmp`);
    await writeFile(temporary, `${JSON.stringify(saved, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    try {
      await rename(temporary, destination);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => {});
      throw error;
    }
    this.guilds.set(id, saved);
    return publicConfig(saved);
  }

  async delete(guildId) {
    const id = validateGuildId(guildId);
    this.guilds.delete(id);
    await rm(join(this.directory, `${id}.json`), { force: true });
  }
}
