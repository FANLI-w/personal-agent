export type WorkbenchTab = "tasks" | "team" | "history";
export type WorkbenchFilter = "all" | "completed";

export type WorkbenchView = {
  tab: WorkbenchTab;
  layout: "list" | "week";
  planId?: string;
  requestId?: string;
  filter: WorkbenchFilter;
};

const id = (value: string | null) =>
  value && /^[A-Za-z0-9_-]{1,96}$/.test(value) ? value : undefined;

export function workbenchView(params: URLSearchParams): WorkbenchView {
  const requested = params.get("view");
  const planId = id(params.get("plan")),
    requestId = id(params.get("planning"));
  // Saved links still resolve to their authorized plan or generation record.
  const history = requested === "history" || requested === "planning" || (
    requested !== "team" && (planId || requestId)
  );
  const tab: WorkbenchTab =
    requested === "team" ? "team" : history ? "history" : "tasks";
  return {
    tab,
    layout: params.get("layout") === "week" ? "week" : "list",
    planId,
    requestId,
    filter: params.get("category") === "completed" ? "completed" : "all",
  };
}

/**
 * A personal task is created from one sentence, so its name is the first line,
 * without a leading bullet or numbering, cut at the first sentence end.
 */
export function personalTaskTitle(goal: string) {
  const first =
    goal
      .replace(/\r/g, "")
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) || "";
  const plain = first.replace(/^[\s\-*+·]+/, "").replace(/^\d+[.、)]\s*/, "");
  const end = plain.search(/[。！？!?；;]/);
  // A one-character head ("好。") is not a name; keep the sentence instead.
  const cut = end >= 0 ? plain.slice(0, end).trim() : plain;
  const title = cut.length >= 2 ? cut : plain.replace(/[。！？!?；;]+$/, "");
  return (title || plain).slice(0, 60);
}
