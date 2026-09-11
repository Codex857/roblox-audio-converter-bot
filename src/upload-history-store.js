import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DISCORD_ID = /^\d{15,25}$/;

function safeId(value, field) {
  const id = String(value || "");
  if (!DISCORD_ID.test(id)) throw new Error(`Invalid ${field}.`);
  return id;
}

function clean(value, max = 200) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

export class UploadHistoryStore {
  constructor({ directory, maxPerGuild = 500 }) {
    this.directory = directory;
    this.maxPerGuild = maxPerGuild;
    this.records = new Map();
    this.corruptFiles = 0;
  }

  async init() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    return this;
  }

  async loadGuild(guildId) {
    const id = safeId(guildId, "Discord server ID");
    if (this.records.has(id)) return this.records.get(id);
    try {
      const parsed = JSON.parse(await readFile(join(this.directory, `${id}.json`), "utf8"));
      const records = Array.isArray(parsed) ? parsed.slice(-this.maxPerGuild) : [];
      this.records.set(id, records);
      return records;
    } catch (error) {
      if (error?.code !== "ENOENT") this.corruptFiles += 1;
      this.records.set(id, []);
      return this.records.get(id);
    }
  }

  async add(guildId, record) {
    const id = safeId(guildId, "Discord server ID");
    const records = await this.loadGuild(id);
    records.push({
      id: clean(record.id, 40),
      userId: safeId(record.userId, "Discord user ID"),
      name: clean(record.name, 100) || "Audio",
      assetId: record.assetId ? clean(record.assetId, 30) : null,
      outcome: record.assetId ? "uploaded" : "failed",
      moderationState: clean(record.moderationState || "UNKNOWN", 60),
      error: record.assetId ? null : clean(record.error || "Upload failed", 300),
      source: clean(record.source || "file", 30),
      createdAt: new Date().toISOString()
    });
    if (records.length > this.maxPerGuild) records.splice(0, records.length - this.maxPerGuild);
    const destination = join(this.directory, `${id}.json`);
    const temporary = join(this.directory, `.${id}.${process.pid}.${Date.now()}.tmp`);
    await writeFile(temporary, `${JSON.stringify(records, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    try {
      await rename(temporary, destination);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => {});
      throw error;
    }
    return records.at(-1);
  }

  async list(guildId, { limit = 10 } = {}) {
    const records = await this.loadGuild(guildId);
    return structuredClone(records.slice(-Math.min(25, Math.max(1, limit))).reverse());
  }
}
