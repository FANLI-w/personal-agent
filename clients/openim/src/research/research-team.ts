import type { TaskModel, TaskSummaryModel } from "@research-agent-platform/contracts";

export type TeamTask = TaskModel | TaskSummaryModel;
export const isFullTask = (task: TeamTask): task is TaskModel => "planId" in task;
export const teamTaskStatus = (task: TeamTask) =>
  isFullTask(task) ? task.status : task.visibleStatus || "awaiting_acceptance";

/** Calendar deadlines use their declared timezone; suggestions never become overdue facts. */
export function teamDeadline(task: TeamTask, now = new Date()) {
  const dates = [
    { kind: "截止", dated: task.schedule.hardDeadline },
    { kind: "承诺", dated: task.schedule.committed },
  ].flatMap(({ kind, dated }) => {
    if (!dated) return [];
    const value = dated.value;
    let days: number, label: string;
    if (value.kind === "date") {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: value.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(now);
      const part = (type: string) => parts.find((p) => p.type === type)?.value;
      const today = `${part("year")}-${part("month")}-${part("day")}`;
      days = (Date.parse(value.date) - Date.parse(today)) / 86400000;
      label = `${value.date} · ${value.timezone}`;
    } else {
      days = (Date.parse(value.at) - now.getTime()) / 86400000;
      label = new Date(value.at).toLocaleString("zh-CN");
    }
    return [
      {
        kind,
        label,
        days,
        confirmed: dated.confirmed && dated.source !== "suggestion",
      },
    ];
  });
  if (!dates.length) return { label: "未设置截止", overdue: false, soon: false };
  const confirmed = dates
    .filter((date) => date.confirmed)
    .sort((a, b) => a.days - b.days);
  const next = confirmed[0] || dates[0];
  const active = !["completed", "cancelled"].includes(teamTaskStatus(task));
  return {
    label: `${next.kind} ${next.label}${next.confirmed ? "" : "（待确认）"}`,
    overdue: active && confirmed.some((date) => date.days < 0),
    soon: active && confirmed.some((date) => date.days >= 0 && date.days <= 7),
  };
}

export function teamNextStep(task: TeamTask, viewerId?: string): string {
  const status = teamTaskStatus(task);
  if (status === "completed") return "查看当前成果与实际审阅记录";
  if (status === "cancelled") return "已取消，可查看历史记录";
  const full = isFullTask(task) ? task : undefined;
  const isLead = !!viewerId && full?.leadId === viewerId;
  const isReviewer = !!viewerId && full?.reviewerId === viewerId;
  if (status === "blocked" && full) {
    const support = full.blocker?.requestedAction;
    if (!viewerId) return support || "说明阻碍，协调所需支持";
    if (full.blocker?.requestedMemberId === viewerId)
      return support ? `这一步需要你协助：${support}` : "看看阻碍说明，帮助确认下一步";
    return support ? `当前需要的支持：${support}` : "当前有阻碍，可以在详情里说明需要的帮助";
  }
  if (status === "in_review")
    return !viewerId || isReviewer ? "审阅实际交付，指出已解决的问题和具体修改建议" : "成果已提交，等待审阅意见；可以先查看这一版内容";
  if (status === "changes_requested")
    return !viewerId || isLead ? "先看审阅意见，修订后再提交一版成果" : "已有修改意见，等待承接人修订；可查看具体反馈";
  if (status === "awaiting_acceptance") return "等待受邀成员确认任务范围与时间";
  if (status === "unassigned") return "还没有承接人，可以邀请成员或认领这一步";
  if (status === "ready")
    return !viewerId || isLead ? "材料和前置成果准备好后，就可以开始这一步" : "承接人尚未开始，可以先查看任务安排";
  return !viewerId || isLead ? "继续推进这一步；有阶段结果可以提交，卡住时也可以请求帮助" : "正在推进，可以查看阶段成果和需要的支持";
}
