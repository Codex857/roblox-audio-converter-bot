import { mkdir, mkdtemp, readdir, rename, rm, copyFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { normalizeYouTubeUrl } from "./youtube.js";

export class LinkLibrary {
  constructor(root) { this.root = root; this.busy = new Set(); }
  location(guild, url) {
    if (!/^\d{1,22}$/.test(String(guild))) throw new Error("Link Library requires a server.");
    const id = new URL(normalizeYouTubeUrl(url)).searchParams.get("v");
    return { directory: join(this.root, String(guild)), id };
  }
  async locked(guild, task) {
    guild = String(guild);
    if (this.busy.has(guild)) throw new Error("The library is busy. Try again shortly.");
    if (this.busy.size >= 3) throw new Error("The library is busy. Try again shortly.");
    this.busy.add(guild);
    try { return await task(); } finally { this.busy.delete(guild); }
  }
  async list(guild) {
    const { directory } = this.location(guild, "https://youtu.be/dQw4w9WgXcQ");
    try { return (await readdir(directory)).filter(x => /^[\w-]{11}$/.test(x)); }
    catch (error) { if (error.code === "ENOENT") return []; throw error; }
  }
  async add(guild, url, populate) {
    const { directory, id } = this.location(guild, url);
    return this.locked(guild, async () => {
      const entries = await this.list(guild);
      if (entries.includes(id)) throw new Error("This link is already saved. Delete it before replacing it.");
      if (entries.length >= 20) throw new Error("Library full: maximum 20 tracks per server.");
      await mkdir(directory, { recursive: true });
      const stage = await mkdtemp(join(directory, ".pending-"));
      try {
        const path = join(stage, "audio");
        await populate(path);
        const info = await stat(path);
        if (!info.isFile() || info.size <= 0 || info.size > 25 * 1024 * 1024) throw new Error("Audio must be nonempty and at most 25 MB.");
        await rename(stage, join(directory, id));
      } finally { await rm(stage, { recursive: true, force: true }); }
    });
  }
  async copy(guild, url, destination) {
    const { directory, id } = this.location(guild, url);
    return this.locked(guild, async () => {
      try { await copyFile(join(directory, id, "audio"), destination); return true; }
      catch (error) { if (error.code === "ENOENT") return false; throw error; }
    });
  }
  async remove(guild, url) {
    const { directory, id } = this.location(guild, url);
    return this.locked(guild, () => rm(join(directory, id), { recursive: true, force: true }));
  }
}
