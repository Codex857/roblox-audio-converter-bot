import test from "node:test";
import assert from "node:assert/strict";
import {
  fileUploadModal,
  mainMenuComponents,
  youtubeFallbackComponents,
  youtubeUploadModal
} from "../src/menu.js";

test("main menu offers file, YouTube and help buttons", () => {
  const rows = mainMenuComponents().map((row) => row.toJSON());
  assert.deepEqual(rows[0].components.map((component) => component.custom_id), [
    "music-menu:file",
    "music-menu:youtube",
    "music-menu:help"
  ]);
});

test("blocked YouTube flow offers an immediate file upload fallback", () => {
  const rows = youtubeFallbackComponents().map((row) => row.toJSON());
  assert.equal(rows[0].components.length, 1);
  assert.equal(rows[0].components[0].custom_id, "music-menu:file");
  assert.equal(rows[0].components[0].label, "Upload MP3/WAV Sekarang");
});

test("file modal accepts up to five files and requires rights confirmation", () => {
  const modal = fileUploadModal().toJSON();
  assert.equal(modal.custom_id, "music-menu:file-modal");
  assert.equal(modal.components[0].component.type, 19);
  assert.equal(modal.components[0].component.min_values, 1);
  assert.equal(modal.components[0].component.max_values, 5);
  assert.equal(modal.components[1].component.type, 23);
  assert.equal(modal.components[1].component.custom_id, "rights_confirm");
});

test("YouTube modal contains a link field and rights confirmation", () => {
  const modal = youtubeUploadModal().toJSON();
  assert.equal(modal.custom_id, "music-menu:youtube-modal");
  assert.equal(modal.components[0].component.type, 4);
  assert.equal(modal.components[0].component.custom_id, "youtube_link");
  assert.equal(modal.components[1].component.type, 23);
  assert.equal(modal.components[1].component.custom_id, "rights_confirm");
});
