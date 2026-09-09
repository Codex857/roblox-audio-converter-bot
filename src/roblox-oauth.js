import { createHash, randomBytes } from "node:crypto";
import { join } from "node:path";
import { RobloxOAuthProfileStore } from "./roblox-oauth-store.js";

const AUTHORIZE_URL = "https://apis.roblox.com/oauth/v1/authorize";
const TOKEN_URL = "https://apis.roblox.com/oauth/v1/token";
const USERINFO_URL = "https://apis.roblox.com/oauth/v1/userinfo";
const REVOKE_URL = "https://apis.roblox.com/oauth/v1/token/revoke";
const SCOPES = "openid profile asset:read asset:write";
const STATE_TTL_MS = 10 * 60_000;

function randomBase64Url(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

function pkceChallenge(verifier) {
  return createHash("sha256").update(verifier).digest("base64url");
}

function configured(config) {
  return Boolean(config.clientId && config.clientSecret && config.redirectUri);
}

function safeProfile(profile) {
  if (!profile) return null;
  return {
    robloxUserId: profile.robloxUserId,
    username: profile.username || "Roblox user",
    scope: profile.scope || "",
    linkedAt: profile.linkedAt || null,
    updatedAt: profile.updatedAt || null
  };
}

function friendlyOAuthError(error) {
  const message = error instanceof Error ? error.message : "Ralat OAuth Roblox.";
  return message.replace(/[A-Za-z0-9_-]{24,}/g, "[hidden]");
}

async function tokenRequest(body) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(30_000)
  });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || `Roblox OAuth gagal (HTTP ${response.status}).`);
  }
  return payload;
}

export async function createRobloxOAuth(config = {}) {
  const clientId = config.clientId?.trim();
  const clientSecret = config.clientSecret?.trim();
  const redirectUri = config.redirectUri?.trim();
  const isConfigured = configured({ clientId, clientSecret, redirectUri });
  const pending = new Map();
  const refreshLocks = new Map();
  let store = null;

  if (isConfigured) {
    store = await new RobloxOAuthProfileStore({
      directory: join(config.dataDirectory || "data", "roblox-oauth-users"),
      secret: clientSecret
    }).init();
  }

  function cleanupStates() {
    const now = Date.now();
    for (const [state, item] of pending) {
      if (item.expiresAt <= now) pending.delete(state);
    }
  }

  function requireConfigured() {
    if (!isConfigured) throw new Error("Roblox OAuth belum dikonfigurasi oleh pemilik bot.");
  }

  function createAuthorizationUrl(discordUserId) {
    requireConfigured();
    cleanupStates();
    const state = randomBase64Url(32);
    const verifier = randomBase64Url(48);
    pending.set(state, {
      discordUserId: String(discordUserId),
      verifier,
      expiresAt: Date.now() + STATE_TTL_MS
    });
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPES);
    url.searchParams.set("state", state);
    url.searchParams.set("nonce", randomBase64Url(16));
    url.searchParams.set("code_challenge", pkceChallenge(verifier));
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  }

  async function fetchUserInfo(accessToken) {
    const response = await fetch(USERINFO_URL, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(30_000)
    });
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
    if (!response.ok) throw new Error("Roblox tidak dapat mengesahkan akaun OAuth.");
    const robloxUserId = String(body.sub || "");
    if (!/^\d+$/.test(robloxUserId)) throw new Error("Roblox tidak memulangkan user ID yang sah.");
    return {
      robloxUserId,
      username: body.preferred_username || body.name || "Roblox user"
    };
  }

  async function handleCallback(callbackUrl) {
    requireConfigured();
    const url = callbackUrl instanceof URL ? callbackUrl : new URL(String(callbackUrl));
    const state = url.searchParams.get("state") || "";
    const code = url.searchParams.get("code") || "";
    const error = url.searchParams.get("error") || "";
    if (error) throw new Error("Sambungan Roblox dibatalkan atau ditolak.");
    const item = pending.get(state);
    pending.delete(state);
    if (!item || item.expiresAt <= Date.now()) throw new Error("Sesi connect Roblox tamat masa. Cuba sekali lagi.");
    if (!code) throw new Error("Kod OAuth Roblox tidak diterima.");

    const token = await tokenRequest({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code_verifier: item.verifier
    });
    const accessToken = String(token.access_token || "");
    const refreshToken = String(token.refresh_token || "");
    if (!accessToken || !refreshToken) throw new Error("Token OAuth Roblox tidak lengkap.");
    const userInfo = await fetchUserInfo(accessToken);
    const existingDiscordId = store.findDiscordIdByRobloxUserId(userInfo.robloxUserId);
    if (existingDiscordId && existingDiscordId !== item.discordUserId) {
      throw new Error("Akaun Roblox ini sudah disambung kepada Discord user lain.");
    }
    await store.set(item.discordUserId, {
      ...userInfo,
      accessToken,
      refreshToken,
      tokenType: token.token_type || "Bearer",
      scope: token.scope || SCOPES,
      expiresAt: Date.now() + Math.max(1, Number(token.expires_in || 900)) * 1000,
      linkedAt: store.get(item.discordUserId)?.linkedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    return safeProfile(store.get(item.discordUserId));
  }

  async function refreshProfile(discordUserId, profile) {
    const token = await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: profile.refreshToken,
      client_id: clientId,
      client_secret: clientSecret
    });
    const next = {
      ...profile,
      accessToken: String(token.access_token || ""),
      refreshToken: String(token.refresh_token || profile.refreshToken),
      tokenType: token.token_type || "Bearer",
      scope: token.scope || profile.scope || SCOPES,
      expiresAt: Date.now() + Math.max(1, Number(token.expires_in || 900)) * 1000,
      updatedAt: new Date().toISOString()
    };
    if (!next.accessToken || !next.refreshToken) throw new Error("Refresh token Roblox tidak lengkap.");
    await store.set(discordUserId, next);
    return next.accessToken;
  }

  async function getAccessToken(discordUserId) {
    requireConfigured();
    const id = String(discordUserId);
    const profile = store.get(id);
    if (!profile) throw new Error("Sila connect akaun Roblox anda dahulu dengan /roblox-account.");
    if (profile.expiresAt && profile.expiresAt > Date.now() + 60_000) return profile.accessToken;
    if (!refreshLocks.has(id)) {
      refreshLocks.set(id, refreshProfile(id, profile).finally(() => refreshLocks.delete(id)));
    }
    return refreshLocks.get(id);
  }

  async function disconnect(discordUserId) {
    requireConfigured();
    const profile = store.get(String(discordUserId));
    if (profile?.refreshToken) {
      await fetch(REVOKE_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: profile.refreshToken,
          client_id: clientId,
          client_secret: clientSecret
        }),
        signal: AbortSignal.timeout(20_000)
      }).catch(() => {});
    }
    await store.delete(String(discordUserId));
  }

  return {
    configured: isConfigured,
    redirectUri,
    linkedCount: () => store?.size || 0,
    corruptProfileCount: () => store?.corruptFiles || 0,
    createAuthorizationUrl,
    handleCallback,
    getAccessToken,
    disconnect,
    getPublicProfile: (discordUserId) => safeProfile(store?.get(String(discordUserId))),
    safeError: friendlyOAuthError
  };
}
