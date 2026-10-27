import type { GroupAgentStatus } from "@research-agent-platform/contracts";

export function groupAgentStatusText(request: Pick<GroupAgentStatus, "status" | "failure">) {
  if (request.failure === "BUDGET_EXCEEDED") return "未能回复：本次请求超出预算";
  if (request.failure === "AUTHORITY_CHANGED") return "已停止：群成员或资料权限发生变化";
  const labels: Record<GroupAgentStatus["status"], string> = {
    queued: "等待回复", running: "正在回复", waiting_input: "等待补充信息",
    succeeded: "已回复", unavailable: "暂时不可用", failed: "回复失败",
    interrupted: "回复中断", cancelled: "已取消",
  };
  return labels[request.status];
}
