import { findFeishuBaseLink } from "./feishu-library-chat";

export async function openFeishuLibrary(value: string) {
  const url = findFeishuBaseLink(value);
  if (!url) throw new Error("资料库链接无效，请重新绑定飞书原表。");
  if (window.electronAPI) {
    if (!window.electronAPI.openFeishuLibrary)
      throw new Error(
        "当前客户端无法直接打开资料库，请复制链接到浏览器，或更新客户端。",
      );
    try {
      await window.electronAPI.openFeishuLibrary(url);
    } catch {
      throw new Error(
        "未能打开系统浏览器，请复制下面的资料库链接到 Edge 或其他浏览器。",
      );
    }
    return;
  }
  const page = window.open("about:blank", "_blank");
  if (!page) throw new Error("浏览器阻止了新窗口，请复制下面的资料库链接打开。");
  try {
    page.opener = null;
    page.location.replace(url);
  } catch {
    page.close();
    throw new Error("未能打开飞书资料库，请复制下面的链接到浏览器。");
  }
}
