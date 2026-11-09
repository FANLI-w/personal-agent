/** Windows file pickers sometimes omit MIME; preserve image semantics by suffix. */
export function isComposerImage(file: Pick<File, "name" | "type">) {
  return (
    file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name)
  );
}
export function normalizeComposerImage(file: File): File {
  if (file.type.startsWith("image/")) return file;
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  const type =
    extension === "jpg" || extension === "jpeg" ? "image/jpeg" : `image/${extension}`;
  return new File([file], file.name, { type, lastModified: file.lastModified });
}
