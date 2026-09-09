import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const GUILD_ID = /^\d{15,25}$/;
const CREATOR_TYPES = new Set(["User", "Group"]);
const STORE_VERSION = 2;

function encryptionKey(secret) {
  if (!secret) return null;
  return Buffer.from(hkdfSync(
    "sha256",
    Buffer.from(secret, "utf8"),
    Buffer.from("discord-roblox-audio-bot", "utf8"),
    Buffer.from("guild-api-key-store-v1", "utf8"),
    32
  ));
}

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
    apiKeyConfigured: Boolean(config.apiKey),
    updatedBy: config.updatedBy || null,
    updatedAt: config.updatedAt || null
  };
}

function encryptSecret(key, guildId, value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(guildId, "utf8"));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    data: encrypted.toString("base64url")
  };
}

function decryptSecret(key, guildId, record) {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(record.iv, "base64url"));
  decipher.setAAD(Buffer.from(guildId, "utf8"));
  decipher.setAuthTag(Buffer.from(record.tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(record.data, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

export class GuildConfigStore {
  constructor({ directory, secret }) {
    if (!directory) throw new Error("Direktori konfigurasi server diperlukan.");
    this.directory = directory;
    this.key = encryptionKey(secret);
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
        const config = normalizeCreatorConfig(record);
        const apiKey = record.apiKeyEncrypted && this.key
          ? decryptSecret(this.key, match[1], record.apiKeyEncrypted)
          : "";
        this.guilds.set(match[1], { ...config, apiKey, updatedBy: record.updatedBy, updatedAt: record.updatedAt });
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

  getUploadConfig(guildId) {
    const id = validateGuildId(guildId);
    const config = this.guilds.get(id);
    return config ? structuredClone(config) : null;
  }

  async set(guildId, config) {
    const id = validateGuildId(guildId);
    const existing = this.guilds.get(id);
    const apiKey = String(config.apiKey || existing?.apiKey || "").trim();
    const saved = {
      ...normalizeCreatorConfig(config),
      apiKey,
      updatedBy: String(config.updatedBy || ""),
      updatedAt: new Date().toISOString()
    };
    if (apiKey && !this.key) throw new Error("Secret enkripsi server belum tersedia.");
    const diskRecord = {
      version: STORE_VERSION,
      creatorType: saved.creatorType,
      creatorId: saved.creatorId,
      apiKeyEncrypted: apiKey ? encryptSecret(this.key, id, apiKey) : null,
      updatedBy: saved.updatedBy,
      updatedAt: saved.updatedAt
    };
    const destination = join(this.directory, `${id}.json`);
    const temporary = join(this.directory, `.${id}.${process.pid}.${Date.now()}.tmp`);
    await writeFile(temporary, `${JSON.stringify(diskRecord, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
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
