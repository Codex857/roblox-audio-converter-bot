import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { createWriteStream } from "node:fs";
import { basename, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import { DOWNLOAD_MAX_BYTES } from "./audio.js";

const AUDIO_EXTENSIONS = new Set(["mp3", "ogg", "wav", "flac", "m4a", "aac"]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 4;
const GOOGLE_DRIVE_ID = /^[A-Za-z0-9_-]{10,200}$/;

const MIME_EXTENSIONS = new Map([
  ["audio/mpeg", "mp3"],
  ["audio/mp3", "mp3"],
  ["audio/ogg", "ogg"],
  ["application/ogg", "ogg"],
  ["audio/wav", "wav"],
  ["audio/x-wav", "wav"],
  ["audio/flac", "flac"],
  ["audio/x-flac", "flac"],
  ["audio/mp4", "m4a"],
  ["audio/aac", "aac"]
]);

function matchesDomain(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

function isDropboxHost(host) {
  return matchesDomain(host, "dropbox.com") || matchesDomain(host, "dropboxusercontent.com");
}

function isGoogleDriveHost(host) {
  return host === "drive.google.com"
    || host === "drive.usercontent.google.com"
    || matchesDomain(host, "googleusercontent.com");
}

function isDiscordCdnHost(host) {
  return ["cdn.discordapp.com", "media.discordapp.net", "cdn.discordapp.net"].includes(host);
}

function isR2Host(host) {
  return matchesDomain(host, "r2.dev") || matchesDomain(host, "r2.cloudflarestorage.com");
}

function isS3Host(host) {
  return host === "s3.amazonaws.com"
    || /^s3[.-][a-z0-9-]+\.amazonaws\.com$/.test(host)
    || /^[a-z0-9][a-z0-9.-]*\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/.test(host);
}

function isAllowedHost(host) {
  return isDropboxHost(host)
    || isGoogleDriveHost(host)
    || isDiscordCdnHost(host)
    || isR2Host(host)
    || isS3Host(host);
}

function visibleExtension(url) {
  let fileName;
  try {
    fileName = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) || "");
  } catch {
    fileName = url.pathname.split("/").filter(Boolean).at(-1) || "";
  }
  const match = /\.([A-Za-z0-9]+)$/.exec(fileName);
  return match?.[1]?.toLowerCase() || null;
}

function assertSafeUrl(url) {
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new Error("Use a normal HTTPS file link without login details or custom ports.");
  }
  if (!host || host === "localhost" || host.endsWith(".local") || isIP(host)) {
    throw new Error("Internal hosts and raw IP addresses are not allowed.");
  }
  if (!isAllowedHost(host)) {
    throw new Error("Unsupported link host. Use Dropbox, Google Drive, Discord CDN, Cloudflare R2, or Amazon S3.");
  }

  const extension = visibleExtension(url);
  if (extension && !AUDIO_EXTENSIONS.has(extension)) {
    throw new Error("The link must point to an MP3, OGG, WAV, FLAC, M4A, or AAC file.");
  }
}

function googleDriveFileId(url) {
  if (url.hostname.toLowerCase() !== "drive.google.com") return null;
  const pathMatch = /^\/file\/d\/([^/]+)/.exec(url.pathname);
  const id = pathMatch?.[1] || url.searchParams.get("id");
  return GOOGLE_DRIVE_ID.test(id || "") ? id : null;
}

export function normalizeDirectAudioUrl(value) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    throw new Error("Invalid audio file link.");
  }

  url.hash = "";
  assertSafeUrl(url);

  const host = url.hostname.toLowerCase();
  if (matchesDomain(host, "dropbox.com")) {
    if (!/^\/(?:s|scl\/fi)\//.test(url.pathname)) {
      throw new Error("Use a Dropbox share link that points directly to one audio file.");
    }
    url.searchParams.delete("dl");
    url.searchParams.set("raw", "1");
  } else if (host === "drive.google.com") {
    const id = googleDriveFileId(url);
    if (!id) throw new Error("Google Drive links must point to one public file.");
    url = new URL("https://drive.usercontent.google.com/download");
    url.searchParams.set("id", id);
    url.searchParams.set("export", "download");
    url.searchParams.set("confirm", "t");
  }

  assertSafeUrl(url);
  return url.toString();
}

function isPrivateIpv4(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b, c] = parts;
  return a === 0
    || a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0 && c === 0)
    || (a === 192 && b === 0 && c === 2)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a >= 224;
}

function isPrivateAddress(address) {
  const normalized = String(address || "").toLowerCase().split("%")[0];
  if (isIP(normalized) === 4) return isPrivateIpv4(normalized);
  if (isIP(normalized) !== 6) return true;
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("::ffff:")) return isPrivateIpv4(normalized.slice(7));
  return normalized.startsWith("fc")
    || normalized.startsWith("fd")
    || /^fe[89ab]/.test(normalized)
    || normalized.startsWith("2001:db8:");
}

async function assertPublicDns(hostname, lookupImpl) {
  let records;
  try {
    records = await lookupImpl(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("The audio file host could not be reached.");
  }
  const entries = Array.isArray(records) ? records : [records];
  if (!entries.length || entries.some((entry) => isPrivateAddress(entry?.address))) {
    throw new Error("Links that resolve to an internal network address are not allowed.");
  }
}

function headerFileName(value) {
  if (!value) return null;
  const utf8Match = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(value);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1].trim().replace(/^"|"$/g, ""));
    } catch {
      return null;
    }
  }
  const plainMatch = /filename\s*=\s*(?:"([^"]+)"|([^;]+))/i.exec(value);
  return (plainMatch?.[1] || plainMatch?.[2] || "").trim() || null;
}

function cleanFileName(value) {
  const fileName = basename(String(value || "").replaceAll("\\", "/"))
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  if (!fileName || fileName === "." || fileName === "..") return null;
  return fileName.slice(0, 150);
}

function responseFileName(response, url) {
  const fromHeader = cleanFileName(headerFileName(response.headers.get("content-disposition")));
  let fromPath = null;
  try {
    fromPath = cleanFileName(decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) || ""));
  } catch {
    fromPath = cleanFileName(url.pathname.split("/").filter(Boolean).at(-1) || "");
  }
  let candidate = fromHeader || fromPath;
  let extension = candidate ? visibleExtension(new URL(`https://audio.invalid/${encodeURIComponent(candidate)}`)) : null;

  if (!extension) {
    const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    const inferred = MIME_EXTENSIONS.get(contentType);
    if (inferred) {
      candidate = `${candidate || "audio"}.${inferred}`;
      extension = inferred;
    }
  }
  if (!candidate || !extension || !AUDIO_EXTENSIONS.has(extension)) {
    throw new Error("The link did not return a supported audio file.");
  }
  return candidate;
}

function validateResponseType(response) {
  const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType && (
    contentType.startsWith("text/")
    || contentType.includes("html")
    || contentType.includes("json")
    || contentType.includes("xml")
  )) {
    throw new Error("The link returned a web page, not a direct audio file.");
  }
}

export async function downloadDirectAudio({
  url: inputUrl,
  directory,
  fetchImpl = fetch,
  lookupImpl = lookup
}) {
  let url = new URL(normalizeDirectAudioUrl(inputUrl));
  let response;

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    assertSafeUrl(url);
    await assertPublicDns(url.hostname, lookupImpl);
    response = await fetchImpl(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
      headers: { "user-agent": "DiscordRobloxAudioBot/2.7" }
    });

    if (!REDIRECT_STATUSES.has(response.status)) break;
    if (redirects === MAX_REDIRECTS) throw new Error("The link has too many redirects.");
    const location = response.headers.get("location");
    if (!location) throw new Error("Invalid audio file redirect.");
    url = new URL(location, url);
    assertSafeUrl(url);
  }

  if (!response?.ok || !response.body) {
    throw new Error(`Failed to download audio file (HTTP ${response?.status || "unknown"}).`);
  }
  validateResponseType(response);

  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > DOWNLOAD_MAX_BYTES) throw new Error("Input file exceeds the 25 MB limit.");

  const name = responseFileName(response, url);
  const extension = visibleExtension(new URL(`https://audio.invalid/${encodeURIComponent(name)}`));
  const path = join(directory, `${randomUUID()}.${extension}`);
  let received = 0;
  const sizeGuard = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      if (received > DOWNLOAD_MAX_BYTES) callback(new Error("Input file exceeds the 25 MB limit."));
      else callback(null, chunk);
    }
  });

  await pipeline(Readable.fromWeb(response.body), sizeGuard, createWriteStream(path));
  if (received <= 0) throw new Error("The downloaded audio file is empty.");
  return { path, name, size: received, host: url.hostname.toLowerCase() };
}
