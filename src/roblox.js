const ASSETS_API = "https://apis.roblox.com/assets/v1";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanText(value, maxLength, field) {
  const text = String(value || "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) throw new Error(`${field} diperlukan.`);
  if (text.length > maxLength) throw new Error(`${field} terlalu panjang (maksimum ${maxLength} aksara).`);
  return text;
}

function apiErrorDetail(body) {
  if (typeof body?.message === "string") return body.message;
  if (typeof body?.error === "string") return body.error;
  if (typeof body?.error?.message === "string") return body.error.message;
  if (Array.isArray(body?.errors) && body.errors[0]?.message) return body.errors[0].message;
  return "ralat API";
}

export function robloxApiError(status, body = {}) {
  const friendly = {
    400: "Roblox menolak permintaan atau fail audio tidak sah (400).",
    401: "Roblox menolak API key; key mungkin tidak sah atau tamat tempoh (401).",
    403: "API key tiada asset:write atau creator permission (403).",
    404: "Endpoint atau operasi upload Roblox tidak ditemui (404).",
    409: "Roblox menolak upload kerana konflik (409).",
    413: "Fail audio terlalu besar untuk Roblox (413).",
    429: "Had/rate limit upload Roblox sudah dicapai (429)."
  }[status] || `Upload Roblox gagal (HTTP ${status}).`;
  const detail = apiErrorDetail(body);
  return detail === "ralat API" ? friendly : `${friendly} ${detail}`;
}

export function normalizeOperationPath(path) {
  const value = String(path || "").trim();
  if (!value) throw new Error("Roblox tidak memulangkan operation path.");
  if (value.startsWith(`${ASSETS_API}/`)) return value.slice(`${ASSETS_API}/`.length);
  if (value.startsWith("https://apis.roblox.com/assets/v1/")) {
    return value.slice("https://apis.roblox.com/assets/v1/".length);
  }
  if (value.startsWith("assets/v1/")) return value.slice("assets/v1/".length);
  return value.replace(/^\//, "");
}

export function assetIdFromOperation(operation) {
  return operation?.response?.assetId || operation?.response?.asset?.assetId || null;
}

export function createRobloxUploader(config = {}) {
  const apiKey = config.apiKey?.trim();
  const creatorType = config.creatorType?.trim();
  const creatorId = config.creatorId?.trim();
  const configured = Boolean(apiKey && ["User", "Group"].includes(creatorType) && /^\d+$/.test(creatorId || ""));

  async function request(path, options = {}) {
    let response;
    try {
      response = await fetch(`${ASSETS_API}/${normalizeOperationPath(path)}`, {
        ...options,
        headers: { "x-api-key": apiKey, ...(options.headers || {}) },
        signal: AbortSignal.timeout(options.timeout || 120_000)
      });
    } catch (error) {
      if (error?.name === "TimeoutError") throw new Error("Sambungan Roblox tamat masa. Cuba lagi.");
      throw new Error("Tidak dapat menyambung ke Roblox Open Cloud.");
    }
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text.slice(0, 300) }; }
    if (!response.ok) throw new Error(robloxApiError(response.status, body));
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
    const operation = await request("assets", { method: "POST", body: form, timeout: 180_000 });
    return normalizeOperationPath(operation.path || operation.operationPath || operation.name);
  }

  async function waitForAsset(operationPath, { attempts = 60, intervalMs = 3000 } = {}) {
    const path = normalizeOperationPath(operationPath);
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const operation = await request(path, { method: "GET", timeout: 30_000 });
      if (operation.done) {
        if (operation.error) {
          const reason = typeof operation.error === "string"
            ? operation.error
            : operation.error.message || operation.error.code || "ditolak semasa moderation/pemprosesan";
          throw new Error(`Roblox tidak menyiapkan aset: ${reason}`);
        }
        const assetId = assetIdFromOperation(operation);
        if (!assetId) throw new Error("Roblox menyiapkan operasi tanpa Asset ID.");
        return String(assetId);
      }
      await sleep(intervalMs);
    }
    throw new Error("Roblox masih memproses aset. Semak Creator Dashboard sebentar lagi.");
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
  if (allowedGuildId && allowedRoleId === allowedGuildId && interaction.guildId === allowedGuildId) return true;
  const roles = interaction.member?.roles;
  return Boolean(roles?.cache?.has?.(allowedRoleId) || roles?.includes?.(allowedRoleId));
}
