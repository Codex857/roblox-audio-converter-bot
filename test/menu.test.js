import test from "node:test";
import assert from "node:assert/strict";
import {
  directAudioUploadModal,
  fileUploadModal,
  mainMenuComponents,
  robloxServerSetupModal,
  youtubeFallbackComponents,
  youtubeUploadModal
} from "../src/menu.js";

test("main menu offers file, direct link, YouTube, help and account buttons", () => {
  const rows = mainMenuComponents().map((row) => row.toJSON());
  assert.deepEqual(rows[0].components.map((component) => component.custom_id), [
    "music-menu:file",
    "music-menu:audio-link",
    "music-menu:youtube",
    "music-menu:help",
    "music-menu:account"
  ]);
});

test("direct audio modal contains a link field, speed picker and rights confirmation", () => {
  const modal = directAudioUploadModal().toJSON();
  assert.equal(modal.custom_id, "music-menu:audio-link-modal");
  assert.equal(modal.components[0].component.type, 4);
  assert.equal(modal.components[0].component.custom_id, "audio_link");
  assert.equal(modal.components[1].component.type, 3);
  assert.equal(modal.components[1].component.custom_id, "audio_speed");
  assert.deepEqual(modal.components[1].component.options.map((option) => option.value), ["1", "1.5", "2"]);
  assert.equal(modal.components[2].component.type, 23);
  assert.equal(modal.components[2].component.custom_id, "rights_confirm");
});

test("blocked YouTube flow offers an immediate file upload fallback", () => {
  const rows = youtubeFallbackComponents().map((row) => row.toJSON());
  assert.equal(rows[0].components.length, 1);
  assert.equal(rows[0].components[0].custom_id, "music-menu:file");
  assert.equal(rows[0].components[0].label, "Upload MP3/WAV Sekarang");
});

test("file modal accepts up to five files and requires speed plus rights confirmation", () => {
  const modal = fileUploadModal().toJSON();
  assert.equal(modal.custom_id, "music-menu:file-modal");
  assert.equal(modal.components[0].component.type, 19);
  assert.equal(modal.components[0].component.min_values, 1);
  assert.equal(modal.components[0].component.max_values, 5);
  assert.equal(modal.components[1].component.type, 3);
  assert.equal(modal.components[1].component.custom_id, "audio_speed");
  assert.equal(modal.components[2].component.type, 23);
  assert.equal(modal.components[2].component.custom_id, "rights_confirm");
});

test("YouTube modal contains a link field, speed picker and rights confirmation", () => {
  const modal = youtubeUploadModal().toJSON();
  assert.equal(modal.custom_id, "music-menu:youtube-modal");
  assert.equal(modal.components[0].component.type, 4);
  assert.equal(modal.components[0].component.custom_id, "youtube_link");
  assert.equal(modal.components[1].component.type, 3);
  assert.equal(modal.components[1].component.custom_id, "audio_speed");
  assert.equal(modal.components[2].component.type, 23);
  assert.equal(modal.components[2].component.custom_id, "rights_confirm");
});

test("Roblox server setup modal asks for creator type and ID", () => {
  const modal = robloxServerSetupModal().toJSON();
  assert.equal(modal.custom_id, "music-menu:server-setup-modal");
  assert.deepEqual(modal.components.map((row) => row.component.custom_id), ["roblox_api_key", "creator_type", "creator_id"]);
  assert.equal(modal.components[0].component.type, 4);
  assert.equal(modal.components[1].component.type, 3);
  assert.deepEqual(modal.components[1].component.options.map((option) => option.value), ["Group", "User"]);
  assert.equal(modal.components[2].component.type, 4);
});
