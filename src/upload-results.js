function uniqueLuaNames(results) {
  const counts = new Map();
  return results.map((result) => {
    const count = (counts.get(result.name) || 0) + 1;
    counts.set(result.name, count);
    return { ...result, luaName: count === 1 ? result.name : `${result.name} [${count}]` };
  });
}

function escapeLuaString(value) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("\"", "\\\"")
    .replaceAll("\r", "\\r")
    .replaceAll("\n", "\\n");
}

export function buildUploadExports(results) {
  const successful = uniqueLuaNames(results.filter((result) => result.assetId));
  const json = JSON.stringify(
    successful.map(({ name, assetId }) => ({
      name,
      assetId: String(assetId),
      uri: `rbxassetid://${assetId}`
    })),
    null,
    2
  );
  const lua = [
    "-- Auto-generated Roblox audio IDs",
    "local sounds = {",
    ...successful.map(({ luaName, assetId }) =>
      `    [\"${escapeLuaString(luaName)}\"] = \"rbxassetid://${assetId}\",`
    ),
    "}",
    "",
    "return sounds",
    ""
  ].join("\n");

  return { json, lua };
}
