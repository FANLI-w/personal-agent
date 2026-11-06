/** Where the visible transcript came from, as far as the reader can tell. */
export type HistorySource = "" | "cache" | "connecting" | "offline" | "sync-failed";

/**
 * The one line above the transcript. It may only claim what is known: an
 * offline machine, a transcript read from this machine, or a connection still
 * being established. "Not loaded yet" is not an outage, and telling people it
 * is sends them chasing a network problem that does not exist.
 */
export function historyNotice(source: HistorySource, online: boolean): string {
  // Local reads are the normal path, not a warning or evidence of an outage.
  if (source === "cache")
    return online ? "" : "当前离线，已保存的聊天记录可继续阅读。";
  if (source === "sync-failed")
    return online
      ? "最新消息暂未同步，已保存的聊天记录可继续阅读。"
      : "当前离线，已保存的聊天记录可继续阅读。";
  if (source === "offline" && !online) return "当前无法联网，这段会话本机还没有缓存。";
  if (source === "offline" || source === "connecting") return "正在连接服务器…";
  return "";
}
