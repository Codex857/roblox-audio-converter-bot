import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes
} from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const STORE_VERSION = 1;
const DISCORD_ID = /^\d{15,25}$/;

function encryptionKey(secret) {
  return Buffer.from(hkdfSync(
    "sha256",
    Buffer.from(secret, "utf8"),
    Buffer.from("discord-roblox-audio-bot", "utf8"),
    Buffer.from("roblox-oauth-token-store-v1", "utf8"),
    32
  ));
}

function validateDiscordId(discordUserId) {
  const value = String(discordUserId || "");
  if (!DISCORD_ID.test(value)) throw new Error("Discord user ID tidak sah.");
  return value;
}

function validateProfile(profile) {
  if (!/^\d+$/.test(String(profile?.robloxUserId || ""))) {
    throw new Error("Roblox user ID tidak sah.");
  }
  if (!String(profile?.accessToken || "") || !String(profile?.refreshToken || "")) {
    throw new Error("Token OAuth Roblox tidak lengkap.");
  }
}

function encryptProfile(key, discordUserId, profile) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(discordUserId, "utf8"));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(profile), "utf8"),
    cipher.final()
  ]);
  return {
    version: STORE_VERSION,
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    data: encrypted.toString("base64url")
  };
}

function decryptProfile(key, discordUserId, record) {
  if (record?.version !== STORE_VERSION) throw new Error("Versi profil tidak disokong.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(record.iv, "base64url"));
  decipher.setAAD(Buffer.from(discordUserId, "utf8"));
  decipher.setAuthTag(Buffer.from(record.tag, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(record.data, "base64url")),
    decipher.final()
  ]);
  const profile = JSON.parse(decrypted.toString("utf8"));
  validateProfile(profile);
  return profile;
}

export class RobloxOAuthProfileStore {
  constructor({ directory, secret }) {
    if (!directory) throw new Error("Direktori profil OAuth diperlukan.");
    if (!secret) throw new Error("Secret enkripsi profil OAuth diperlukan.");
    this.directory = directory;
    this.key = encryptionKey(secret);
    this.profiles = new Map();
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
        this.profiles.set(match[1], decryptProfile(this.key, match[1], record));
      } catch {
        this.corruptFiles += 1;
      }
    }
    return this;
  }

  get size() {
    return this.profiles.size;
  }

  get(discordUserId) {
    const id = validateDiscordId(discordUserId);
    const profile = this.profiles.get(id);
    return profile ? structuredClone(profile) : null;
  }

  findDiscordIdByRobloxUserId(robloxUserId) {
    const target = String(robloxUserId || "");
    for (const [discordUserId, profile] of this.profiles) {
      if (String(profile.robloxUserId) === target) return discordUserId;
    }
    return null;
  }

  async set(discordUserId, profile) {
    const id = validateDiscordId(discordUserId);
    validateProfile(profile);
    const saved = structuredClone(profile);
    const record = encryptProfile(this.key, id, saved);
    const destination = join(this.directory, `${id}.json`);
    const temporary = join(this.directory, `.${id}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
    await writeFile(temporary, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    try {
      await rename(temporary, destination);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => {});
      throw error;
    }
    this.profiles.set(id, saved);
  }

  async delete(discordUserId) {
    const id = validateDiscordId(discordUserId);
    this.profiles.delete(id);
    await rm(join(this.directory, `${id}.json`), { force: true });
  }
}
