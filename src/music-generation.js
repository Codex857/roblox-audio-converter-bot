const DEFAULT_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export function normalizeMusicRequest(input = {}) {
  const prompt = String(input.prompt || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (prompt.length < 10) throw new Error("Music prompt must contain at least 10 characters.");
  if (prompt.length > 1800) throw new Error("Music prompt is too long (maximum 1800 characters).");

  const duration = Number(input.duration || 30);
  if (![30, 60, 120].includes(duration)) throw new Error("Music duration must be 30, 60, or 120 seconds.");
  const bpm = input.bpm == null ? null : Number(input.bpm);
  if (bpm != null && (!Number.isInteger(bpm) || bpm < 50 || bpm > 220)) {
    throw new Error("BPM must be a whole number from 50 to 220.");
  }
  const mode = String(input.mode || "instrumental").toLowerCase();
  if (!new Set(["instrumental", "vocal"]).has(mode)) throw new Error("Invalid music mode.");
  const seamlessLoop = input.seamlessLoop === true;
  const genre = String(input.genre || "game soundtrack").trim().slice(0, 80);

  const instructions = [
    `Create an original ${duration}-second ${genre} track.`,
    prompt,
    bpm ? `Tempo: ${bpm} BPM.` : "",
    mode === "instrumental" ? "Instrumental only, no vocals or spoken words." : "Include original vocals and lyrics.",
    seamlessLoop ? "Create a seamless loop: the ending must transition naturally back into the beginning, with no fade-out." : "",
    "Make it suitable for a Roblox game soundtrack. Do not imitate a named artist or copyrighted song."
  ].filter(Boolean);
  return { prompt, genre, mode, duration, bpm, seamlessLoop, modelPrompt: instructions.join(" ") };
}

function parseGeneratedAudio(body) {
  if (body?.output_audio?.data) return { data: body.output_audio.data, mimeType: body.output_audio.mime_type || "audio/mpeg", text: body.output_text || "" };
  const texts = [];
  let audio = null;
  for (const step of body?.steps || []) {
    if (step?.type !== "model_output") continue;
    for (const block of step.content || []) {
      if (block?.type === "audio" && block.data && !audio) audio = block;
      if (block?.type === "text" && block.text) texts.push(block.text);
    }
  }
  return audio ? { data: audio.data, mimeType: audio.mime_type || "audio/mpeg", text: texts.join("\n") } : null;
}

export function createMusicGenerator({ apiKey, model = "lyria-3.5", endpoint = DEFAULT_ENDPOINT, fetchImpl = fetch } = {}) {
  const key = String(apiKey || "").trim();
  const configured = Boolean(key);
  return {
    configured,
    model,
    async generate(input) {
      if (!configured) throw new Error("AI music generation is not configured. The bot owner must set GEMINI_API_KEY in Railway.");
      const request = normalizeMusicRequest(input);
      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({ model, input: request.modelPrompt, response_format: { type: "audio" } }),
          signal: AbortSignal.timeout(180_000)
        });
      } catch (error) {
        if (error?.name === "TimeoutError") throw new Error("AI music generation timed out. Try again shortly.");
        throw new Error("Could not connect to the AI music service.");
      }
      const text = await response.text();
      let body;
      try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
      if (!response.ok) {
        const message = body?.error?.message;
        if (response.status === 429) throw new Error("AI music generation is busy or rate-limited. Try again shortly.");
        if (response.status === 401 || response.status === 403) throw new Error("AI music API access is not authorized. The bot owner must check GEMINI_API_KEY and model access.");
        throw new Error(message ? `AI music generation failed: ${String(message).slice(0, 240)}` : "AI music generation failed.");
      }
      const output = parseGeneratedAudio(body);
      if (!output) throw new Error("AI music generation completed without an audio file.");
      const audio = Buffer.from(output.data, "base64");
      if (!audio.length || audio.length > MAX_AUDIO_BYTES) throw new Error("Generated audio is empty or too large for Discord.");
      return { ...request, audio, mimeType: output.mimeType, lyrics: String(output.text || "").slice(0, 1800) };
    }
  };
}
