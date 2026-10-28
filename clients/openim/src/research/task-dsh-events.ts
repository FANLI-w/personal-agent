import type { DshTaskEvent } from "../../../../integrations/deepseek-harness/desktop/task-workspace";

/** Only public conversation/tool records are presented, never request headers or hidden reasoning. */
export function taskEventRows(
  events: DshTaskEvent[],
): { seq: number; role: string; text: string; detail?: string }[] {
  return events.flatMap((e) => {
    const data = e.data;
    if (e.type === "user/message" || e.type === "assistant/message") {
      const content = data.message?.content ?? data.content;
      let text =
        typeof content === "string"
          ? content
          : Array.isArray(content)
          ? content
              .filter((c) => c.type === "text")
              .map((c) => c.text)
              .join("\n")
          : "";
      if (e.type === "user/message" && data.source?.kind !== "user") return [];
      if (
        e.type === "user/message" &&
        text.startsWith("任务：") &&
        text.includes("\n\n本次要求：\n")
      )
        text = text.split("\n\n本次要求：\n").slice(1).join("\n\n本次要求：\n");
      return text
        ? [{ seq: e.seq, role: e.type === "user/message" ? "user" : "assistant", text }]
        : [];
    }
    if (e.type === "tool/call")
      return [
        {
          seq: e.seq,
          role: "tool",
          text: `调用 ${data.name || "工具"}`,
          detail: String(data.arguments || "").slice(0, 12000),
        },
      ];
    if (e.type === "tool/result")
      return [
        {
          seq: e.seq,
          role: "tool",
          text: `${data.message?.toolName || "工具"}：${
            data.error || data.message?.isError ? "执行失败" : "已返回结果"
          }`,
          detail: (data.message?.content || [])
            .filter((c: any) => c.type === "text")
            .map((c: any) => c.text)
            .join("\n")
            .slice(0, 12000),
        },
      ];
    if (e.type === "assistant/attempt")
      return [
        { seq: e.seq, role: "tool", text: "模型调用未完成，请核对连接与运行记录。" },
      ];
    return [];
  });
}
