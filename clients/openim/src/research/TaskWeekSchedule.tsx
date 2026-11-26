import {
  CalendarOutlined,
  FileTextOutlined,
  LeftOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { Button } from "antd";
import { useEffect, useState, type ReactNode } from "react";
import type { TaskModel, TaskSummaryModel } from "@research-agent-platform/contracts";

const weekdays = ["一", "二", "三", "四", "五", "六", "日"];
const localDate = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const localTime = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function taskDate(value: Date | string) {
  return localDate.format(typeof value === "string" ? new Date(value) : value);
}

export function taskDateTime(value: string) {
  return taskDate(value) + " " + localTime.format(new Date(value));
}

type TeamSchedule = (TaskModel | TaskSummaryModel)["schedule"];
type ScheduleValue = NonNullable<TeamSchedule["checkpoint"]>;

function confirmed(entry: TeamSchedule["committed"]) {
  return entry?.confirmed && entry.source !== "suggestion" ? entry.value : undefined;
}

export function taskSchedule(schedule?: TeamSchedule) {
  if (!schedule) return undefined;
  return (
    confirmed(schedule.committed) ||
    confirmed(schedule.hardDeadline) ||
    schedule.checkpoint ||
    undefined
  );
}

export function taskDeadline(schedule: TeamSchedule) {
  const value = confirmed(schedule.hardDeadline) || confirmed(schedule.committed);
  return value ? (value.kind === "date" ? value.date : taskDate(value.at)) : undefined;
}

type WeekItem = {
  id: string;
  title: string;
  note?: string | null;
  when?: ScheduleValue;
  selected: boolean;
  onSelect: () => void;
};

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(date.getDate() + days);
  return result;
}

function monday(date: Date) {
  return addDays(date, -((date.getDay() + 6) % 7));
}

function monthDay(date: Date) {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function TaskWeekSchedule({
  items,
  notices,
  onClearSelection,
}: {
  items: WeekItem[];
  notices?: ReactNode;
  onClearSelection?: () => void;
}) {
  const today = new Date();
  const selectedItem = items.find((item) => item.selected);
  const selectedWhen = selectedItem?.when;
  const selectedDate = selectedWhen
    ? selectedWhen.kind === "date"
      ? selectedWhen.date
      : taskDate(selectedWhen.at)
    : undefined;
  const [day, setDay] = useState(() => selectedDate || taskDate(today));

  useEffect(() => {
    if (selectedDate) setDay(selectedDate);
  }, [selectedDate]);

  const showDay = (date: Date | string) => {
    const next = typeof date === "string" ? date : taskDate(date);
    if (selectedDate && selectedDate !== next) onClearSelection?.();
    setDay(next);
  };
  const current = new Date(day + "T12:00:00");
  const start = monday(current);
  const dates = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const grouped = new Map<string, WeekItem[]>();
  const unscheduled: WeekItem[] = [];
  for (const item of items) {
    if (!item.when) {
      unscheduled.push(item);
      continue;
    }
    const date = item.when.kind === "date" ? item.when.date : taskDate(item.when.at);
    const existing = grouped.get(date);
    if (existing) existing.push(item);
    else grouped.set(date, [item]);
  }
  const time = (item: WeekItem) =>
    item.when?.kind === "instant"
      ? localTime.format(new Date(item.when.at))
      : item.when
      ? "全天"
      : "";
  const order = (item: WeekItem) =>
    item.when?.kind === "instant" ? Date.parse(item.when.at) : -Infinity;
  const visible = (grouped.get(day) || []).sort((a, b) => order(a) - order(b));
  const selectedWeek = taskDate(start) === taskDate(monday(today));
  const renderItem = (item: WeekItem) => (
    <button
      type="button"
      className="task-week-item"
      key={item.id}
      aria-pressed={item.selected}
      onClick={item.onSelect}
    >
      <span className="task-week-time">{time(item)}</span>
      {item.when ? <CalendarOutlined aria-hidden /> : <FileTextOutlined aria-hidden />}
      <span className="task-week-item-copy">
        <strong>{item.title}</strong>
        {item.note && item.note.trim() !== item.title.trim() && (
          <span>{item.note}</span>
        )}
      </span>
      <RightOutlined aria-hidden />
    </button>
  );
  return (
    <section className="task-week" aria-label="周安排">
      {notices}
      <header className="task-week-heading">
        <h2>{selectedWeek ? "本周安排" : "周安排"}</h2>
        <div className="task-week-navigation">
          <Button
            aria-label="上一周"
            icon={<LeftOutlined />}
            onClick={() => showDay(addDays(current, -7))}
          />
          <strong>
            {monthDay(start)} — {monthDay(dates[6])}
          </strong>
          <Button
            aria-label="下一周"
            icon={<RightOutlined />}
            onClick={() => showDay(addDays(current, 7))}
          />
          {!selectedWeek && (
            <Button type="link" onClick={() => showDay(today)}>
              回到本周
            </Button>
          )}
        </div>
      </header>
      <div className="task-week-days" aria-label="选择日期">
        {dates.map((date, index) => {
          const key = taskDate(date);
          const count = grouped.get(key)?.length || 0;
          return (
            <button
              type="button"
              key={key}
              aria-label={`${monthDay(date)} 星期${weekdays[index]} · ${count} 项`}
              aria-pressed={key === day}
              onClick={() => showDay(key)}
            >
              <span>{weekdays[index]}</span>
              <strong>{date.getDate()}</strong>
              {count > 0 && <small>{count} 项</small>}
            </button>
          );
        })}
      </div>
      <header className="task-week-day-heading">
        <h2>
          {monthDay(current)} 星期{weekdays[(current.getDay() + 6) % 7]}
        </h2>
        <time dateTime={day}>{day}</time>
      </header>
      {visible.length ? (
        visible.map(renderItem)
      ) : (
        <p className="workspace-task-list-note">这一天没有已排期的事项。</p>
      )}
      <details
        className="task-week-unscheduled"
        open={(!!selectedItem && !selectedWhen) || undefined}
      >
        <summary>
          未排期 <span>{unscheduled.length}</span>
        </summary>
        {unscheduled.length ? (
          unscheduled.map(renderItem)
        ) : (
          <p className="workspace-task-list-note">没有未排期的事项。</p>
        )}
      </details>
    </section>
  );
}
