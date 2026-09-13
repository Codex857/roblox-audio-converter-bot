import { mkdir, mkdtemp, readdir, rename, rm, copyFile, stat, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeYouTubeUrl } from "./youtube.js";

export function libraryTitle(value, fallback) {
  if (typeof value !== "string") return fallback;
  return value.split(/[\\/]/).pop().replace(/\.(mp3|wav|ogg|flac|m4a|aac)$/i, "")
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "").trim().slice(0, 100) || fallback;
}

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
  async add(guild, url, populate, { title } = {}) {
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
        await writeFile(join(stage, "metadata.json"), JSON.stringify({ title: libraryTitle(title, `Library ${id}`) }), { flag: "wx" });
        await rename(stage, join(directory, id));
      } finally { await rm(stage, { recursive: true, force: true }); }
    });
  }
  async copy(guild, url, destination, { withTitle = false } = {}) {
    const { directory, id } = this.location(guild, url);
    return this.locked(guild, async () => {
      try { await copyFile(join(directory, id, "audio"), destination); }
      catch (error) { if (error.code === "ENOENT") return false; throw error; }
      if (!withTitle) return true;
      let title = `Library ${id}`;
      try {
        const metadataPath = join(directory, id, "metadata.json");
        if ((await stat(metadataPath)).size <= 4096) {
          title = libraryTitle(JSON.parse(await readFile(metadataPath, "utf8")).title, title);
        }
      } catch (error) {
        if (error.code !== "ENOENT" && !(error instanceof SyntaxError) && !(error instanceof TypeError)) throw error;
      }
      return { path: destination, title };
    });
  }
  async remove(guild, url) {
    const { directory, id } = this.location(guild, url);
    return this.locked(guild, () => rm(join(directory, id), { recursive: true, force: true }));
  }
}
