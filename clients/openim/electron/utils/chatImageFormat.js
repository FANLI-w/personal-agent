/** Pure helper shared by the renderer and the packaged Electron byte bridge. */
export function chatImageFormat(bytes) {
  const starts = (...prefix) => prefix.every((byte, i) => bytes[i] === byte);
  if (starts(137, 80, 78, 71, 13, 10, 26, 10))
    return { extension: "png", type: "image/png" };
  if (starts(255, 216, 255)) return { extension: "jpg", type: "image/jpeg" };
  const ascii = (start, end) => String.fromCharCode(...bytes.subarray(start, end));
  if (["GIF87a", "GIF89a"].includes(ascii(0, 6)))
    return { extension: "gif", type: "image/gif" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP")
    return { extension: "webp", type: "image/webp" };
  if (starts(66, 77)) return { extension: "bmp", type: "image/bmp" };
  throw new Error("取回的内容不是支持的图片，请重新获取原图。");
}

export function chatImageFilename(filename, extension) {
  const base = filename
    .split(/[\\/]/)
    .pop()
    .replace(/[<>:"|?*\x00-\x1f]/g, "_")
    .replace(/\.[^.]*$/, "")
    .replace(/[. ]+$/, "")
    .slice(0, 150);
  return `${
    base && !/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(base) ? base : "图片"
  }.${extension}`;
}
