/** JS implementation is shared across the two independent TypeScript projects. */
export function chatImageFormat(bytes: Uint8Array): {
  extension: "png" | "jpg" | "gif" | "webp" | "bmp";
  type: string;
};
export function chatImageFilename(filename: string, extension: string): string;
