const ASSETS_API = "https://apis.roblox.com/assets/v1";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanText(value, maxLength, field) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${field} diperlukan.`);
  if (text.length > maxLength) throw new Error(`${field} terlalu panjang (maksimum ${maxLength} aksara).`);
  return text;
}

export function createRobloxUploader(config = {}) {
  const apiKey = config.apiKey?.trim();
  const creatorType = config.creatorType?.trim();
  const creatorId = config.creatorId?.trim();
  const configured = Boolean(apiKey && ["User", "Group"].includes(creatorType) && /^\d+$/.test(creatorId || ""));

  async function request(path, options = {}) {
    const response = await fetch(`${ASSETS_API}/${path.replace(/^\//, "")}`, {
      ...options,
      headers: { "x-api-key": apiKey, ...(options.headers || {}) },
      signal: AbortSignal.timeout(options.timeout || 120_000)
    });
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text.slice(0, 300) }; }
    if (!response.ok) {
      if (response.status === 401) throw new Error("Roblox menolak API key (401). Cipta key baharu.");
      if (response.status === 403) throw new Error("API key tiada asset:write atau creator permission (403).");
      if (response.status === 429) throw new Error("Had/rate limit upload Roblox sudah dicapai (429).");
      throw new Error(`Upload Roblox gagal (HTTP ${response.status}): ${body.message || body.error || "ralat API"}`);
    }
    return body;
  }

  async function upload({ filePath, fileName, displayName, description }) {
    if (!configured) throw new Error("Roblox Open Cloud belum dikonfigurasi oleh pemilik bot.");
    const name = cleanText(displayName, 50, "Nama aset");
    const desc = String(description || "Uploaded from Discord using licensed audio").trim().slice(0, 1000);
    const creatorKey = creatorType === "Group" ? "groupId" : "userId";
    const metadata = {
      assetType: "Audio",
      displayName: name,
      description: desc,
      creationContext: { creator: { [creatorKey]: creatorId } }
    };
    const { readFile } = await import("node:fs/promises");
    const form = new FormData();
    form.append("request", JSON.stringify(metadata));
    form.append("fileContent", new Blob([await readFile(filePath)], { type: "audio/ogg" }), fileName);
    const operation = await request("assets", { method: "POST", body: form });
    if (!operation.path) throw new Error("Roblox tidak memulangkan operation path.");
    return operation.path;
  }

  async function waitForAsset(operationPath, { attempts = 30, intervalMs = 3000 } = {}) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const operation = await request(operationPath, { method: "GET", timeout: 30_000 });
      if (operation.done) {
        if (operation.error) {
          const reason = operation.error.message || operation.error.code || "ditolak semasa moderation/pemprosesan";
          throw new Error(`Roblox tidak menyiapkan aset: ${reason}`);
        }
        const assetId = operation.response?.assetId;
        if (!assetId) throw new Error("Roblox menyiapkan operasi tanpa Asset ID.");
        return String(assetId);
      }
      await sleep(intervalMs);
    }
    throw new Error(`Roblox masih memproses aset. Operation: ${operationPath}`);
  }

  return { configured, creatorType, creatorId, upload, waitForAsset };
}

export function canUseRobloxUpload(interaction, config = {}) {
  const allowedGuildId = config.guildId?.trim();
  const allowedRoleId = config.roleId?.trim();
  const allowedUsers = new Set(String(config.userIds || "").split(",").map((id) => id.trim()).filter(Boolean));
  if (allowedUsers.has(interaction.user.id)) return true;
  if (allowedGuildId && interaction.guildId !== allowedGuildId) return false;
  if (!allowedRoleId) return Boolean(allowedGuildId && interaction.guildId === allowedGuildId);
  const roles = interaction.member?.roles;
  return Boolean(roles?.cache?.has?.(allowedRoleId) || roles?.includes?.(allowedRoleId));
}
