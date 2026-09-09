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
  if (!text) throw new Error(`${field} is required.`);
  if (text.length > maxLength) throw new Error(`${field} is too long (maximum ${maxLength} characters).`);
  return text;
}

function apiErrorDetail(body) {
  if (typeof body?.message === "string") return body.message;
  if (typeof body?.error === "string") return body.error;
  if (typeof body?.error?.message === "string") return body.error.message;
  if (Array.isArray(body?.errors) && body.errors[0]?.message) return body.errors[0].message;
  return "API error";
}

export function robloxApiError(status, body = {}) {
  const friendly = {
    400: "Roblox rejected the request or the audio file is invalid (400).",
    401: "Roblox rejected access; the API key/token may be invalid or expired (401).",
    403: "Roblox access is missing asset:write or creator permission (403).",
    404: "Roblox upload endpoint or operation was not found (404).",
    409: "Roblox rejected the upload because of a conflict (409).",
    413: "Audio file is too large for Roblox (413).",
    429: "Roblox upload rate limit has been reached (429)."
  }[status] || `Roblox upload failed (HTTP ${status}).`;
  const detail = apiErrorDetail(body);
  return detail === "API error" ? friendly : `${friendly} ${detail}`;
}

export function normalizeOperationPath(path) {
  const value = String(path || "").trim();
  if (!value) throw new Error("Roblox did not return an operation path.");
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

function requestFailure(message, retryable = false) {
  const error = new Error(message);
  error.retryable = retryable;
  return error;
}

export function createRobloxUploader(config = {}) {
  const apiKey = config.apiKey?.trim();
  const accessTokenProvider = typeof config.accessTokenProvider === "function" ? config.accessTokenProvider : null;
  const creatorType = config.creatorType?.trim();
  const creatorId = config.creatorId?.trim();
  const configured = Boolean((apiKey || accessTokenProvider) && ["User", "Group"].includes(creatorType) && /^\d+$/.test(creatorId || ""));

  async function request(path, options = {}) {
    let response;
    try {
      const authHeaders = apiKey
        ? { "x-api-key": apiKey }
        : { authorization: `Bearer ${await accessTokenProvider()}` };
      response = await fetch(`${ASSETS_API}/${normalizeOperationPath(path)}`, {
        ...options,
        headers: { ...authHeaders, ...(options.headers || {}) },
        signal: AbortSignal.timeout(options.timeout || 120_000)
      });
    } catch (error) {
      if (error?.name === "TimeoutError") {
        throw requestFailure("Roblox connection timed out. Try again.", true);
      }
      throw requestFailure("Could not connect to Roblox Open Cloud.", true);
    }
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text.slice(0, 300) }; }
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      throw requestFailure(robloxApiError(response.status, body), retryable);
    }
    return body;
  }

  async function upload({ filePath, fileName, displayName, description }) {
    if (!configured) throw new Error("Roblox Open Cloud is not configured by the bot owner.");
    const name = cleanText(displayName, 50, "Asset name");
    const desc = String(description || "by codex eclipse").trim().slice(0, 1000);
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
      try {
        const operation = await request(path, { method: "GET", timeout: 30_000 });
        if (operation.done) {
          if (operation.error) {
            const reason = typeof operation.error === "string"
              ? operation.error
              : operation.error.message || operation.error.code || "rejected during moderation/processing";
            throw new Error(`Roblox did not finish the asset: ${reason}`);
          }
          const assetId = assetIdFromOperation(operation);
          if (!assetId) throw new Error("Roblox completed the operation without an Asset ID.");
          return String(assetId);
        }
      } catch (error) {
        if (!error?.retryable) throw error;
      }
      if (attempt < attempts - 1) await sleep(intervalMs);
    }
    throw new Error("Roblox is still processing or the connection was interrupted. Check Creator Dashboard shortly.");
  }

  return { configured, creatorType, creatorId, upload, waitForAsset };
}

export function canUseRobloxUpload(interaction, config = {}) {
  const allowedGuildId = config.guildId?.trim();
  const allowedGuilds = new Set([
    allowedGuildId,
    ...String(config.guildIds || "").split(",").map((id) => id.trim())
  ].filter(Boolean));
  const allowedRoles = new Set([
    config.roleId?.trim(),
    ...String(config.roleIds || "").split(",").map((id) => id.trim())
  ].filter(Boolean));
  const allowedUsers = new Set(String(config.userIds || "").split(",").map((id) => id.trim()).filter(Boolean));
  if (allowedUsers.has(interaction.user.id)) return true;
  const guildAllowed = allowedGuilds.has(interaction.guildId);
  if (allowedGuilds.size > 0 && !guildAllowed) return false;
  if (allowedRoles.size === 0) return guildAllowed;
  if (allowedRoles.has("*") || [...allowedGuilds].some((guildId) => allowedRoles.has(guildId))) {
    return guildAllowed;
  }
  const roles = interaction.member?.roles;
  return [...allowedRoles].some((roleId) => roles?.cache?.has?.(roleId) || roles?.includes?.(roleId));
}
