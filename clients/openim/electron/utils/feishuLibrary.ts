/** Saved Bitable sources may open only their original HTTPS Feishu table. */
export function validateFeishuLibraryUrl(value: unknown) {
  const invalid = () => new Error("资料库链接无效，请重新绑定飞书原表。");
  if (typeof value !== "string" || value.length > 2048) throw invalid();
  try {
    const url = new URL(value);
    const table = url.searchParams.get("table");
    const keys = Array.from(url.searchParams.keys());
    if (
      url.protocol !== "https:" ||
      !/(^|\.)feishu\.cn$/.test(url.hostname) ||
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      !/^\/base\/[A-Za-z0-9]{8,100}\/?$/.test(url.pathname) ||
      keys.length !== 1 ||
      keys[0] !== "table" ||
      !/^tbl[A-Za-z0-9]{4,100}$/.test(table || "")
    )
      throw invalid();
    return url.href;
  } catch {
    throw invalid();
  }
}
