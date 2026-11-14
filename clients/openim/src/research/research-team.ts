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
  if (status === "completed") return "查看成果与实际审阅记录";
  if (status === "cancelled") return "已取消，可查看历史记录";
  const full = isFullTask(task) ? task : undefined;
  const isLead = !!viewerId && full?.leadId === viewerId;
  const isReviewer = !!viewerId && full?.reviewerId === viewerId;
  if (status === "in_review")
    return !viewerId || isReviewer ? "审阅实际交付，给出验收结论" : "等待审阅意见";
  if (status === "changes_requested")
    return !viewerId || isLead ? "修订后再提交" : "等待承接人修订";
  if (status === "awaiting_acceptance") return "等待受邀成员确认任务范围";
  if (status === "unassigned") return "邀请成员或认领任务";
  if (status === "ready")
    return !viewerId || isLead ? "可以开始任务" : "承接人尚未开始";
  return !viewerId || isLead ? "可以提交文件或阶段成果" : "查看阶段成果，等待成员交付";
}
