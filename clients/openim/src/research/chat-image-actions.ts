import { chatImageFilename, chatImageFormat } from "../../electron/utils/chatImageFormat";
import { imagePasteLimits } from "@/types/imageClipboard";
import { firstPartyFile } from "./firstPartyFile";

export type ChatImageSource =
  | { file: File }
  | { url: string; expectedBytes: number; filename: string };

/** Fetch the original only, on an explicit action; never substitute a thumbnail. */
export async function readChatImage(source: ChatImageSource, isCurrent: () => boolean) {
  if (!("file" in source) && !source.url.trim())
    throw new Error("这条消息没有可取回的原图，请对方重新发送图片。");
  const file =
    "file" in source
      ? source.file
      : await firstPartyFile({
          sourceUrl: source.url,
          filename: source.filename,
          expectedBytes: source.expectedBytes,
          mediaType: "application/octet-stream",
          isCurrent,
        });
  if (!isCurrent()) throw new Error("当前会话已变化，请重新操作。");
  if (!file.size || file.size > imagePasteLimits.bytes)
    throw new Error("每张图片不能超过 10 MB，且不能是空文件。");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isCurrent()) throw new Error("当前会话已变化，请重新操作。");
  const format = chatImageFormat(bytes);
  return new File([bytes], chatImageFilename(file.name, format.extension), {
    type: format.type,
  });
}

/** Windows clipboard and OCR receive decoded PNG pixels, including GIF/WebP/BMP. */
export async function chatImagePng(file: File) {
  const image = await createImageBitmap(file);
  try {
    if (
      !image.width ||
      !image.height ||
      image.width * image.height > 30000000 ||
      image.width > 40000 ||
      image.height > 40000
    )
      throw new Error("图片尺寸过大，请裁剪或分批处理。");
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前环境无法复制图片，请先另存为。");
    context.drawImage(image, 0, 0);
    const png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("图片转换失败，请先另存为。")),
        "image/png",
      ),
    );
    if (png.size > imagePasteLimits.bytes)
      throw new Error("转换后的图片超过 10 MB，请先另存为或裁剪。");
    return png;
  } finally {
    image.close();
  }
}
