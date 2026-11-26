import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import * as team from "../src/research/research-team.ts";
const source = await readFile(
  new URL("../src/research/team-progress.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const mod = { exports: {} };
vm.runInThisContext("(function(module,exports,require){" + compiled + "\n})")(
  mod,
  mod.exports,
  () => team,
);
const { collectTeamWorkspace, teamDirections } = mod.exports;
const row = (id, planId, status = "unassigned", extra = {}) => ({
  task: planId
    ? { id, planId, title: id, status, dependencies: [] }
    : { id, projection: "claim_summary", title: id, visibleStatus: status },
  planGoal: null,
  latestDeliverable: null,
  acceptedAssignment: null,
  pendingInvitation: null,
  ...extra,
});
const snapshot = { token: "revision-1" };
const page = (data, nextCursor = null) => ({
  data,
  nextCursor,
  snapshot,
  summary: { total: 201 },
});

test("team rows expand first and establish the exact controlled route before mounting task actions", async () => {
  const source = await readFile(new URL("../src/research/ResearchTeamWorkbench.tsx", import.meta.url), "utf8");
  const effects = [], states = [];
  let cursor = 0;
  const taskRow = row("selected_team_task", "plan_1", "in_progress");
  Object.assign(taskRow.task, { allowedActions: ["submit"], goal: "Synthetic task", leadId: "member_1", schedule: { hardDeadline: null, committed: null } });
  const jsx = (type, props) => ({ type, props });
  const imports = {
    react: {
      useState(initial) { const at = cursor++; if (!(at in states)) states[at] = typeof initial === "function" ? initial() : initial; return [states[at], next => { states[at] = typeof next === "function" ? next(states[at]) : next; }]; },
      useEffect(effect) { effects.push(effect); }, useLayoutEffect() {}, useMemo: compute => compute(),
    },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    antd: { Alert: "Alert", Button: "Button", Drawer: "Drawer", Input: { Search: "Search" }, Segmented: "Segmented", Select: "Select" },
    "./store": { useResearchStore: selector => selector({ generation: 1, actor: { spaceKind: "laboratory", member: { id: "member_1", labId: "lab_1" } } }) },
    "./useResearchRead": { useResearchRead: (_read, key) => ({ data: key.startsWith("team-progress-members") ? { data: [] } : { data: [taskRow], summary: { total: 1, awaitingReview: 0, accepted: 0 } }, refresh: async () => {} }) },
    "./research-team": team,
    "./team-progress": mod.exports,
    "./workspace-labels": { workspaceStatusLabel: { in_progress: "进行中" } },
    "./TaskWorkspace": { TaskWorkspace: "TaskWorkspace", TaskReadNotice: "TaskReadNotice", WorkspaceTaskDetail: "WorkspaceTaskDetail" },
    "./TaskWeekSchedule": { taskDate: () => "2026-11-26", taskDeadline: () => undefined },
  };
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module, exports: module.exports, require: name => imports[name] || {},
  });
  const requests = [];
  const props = { layout: "list", detailOpen: false, onPlan() {}, onSelectTask: (...args) => requests.push(args) };
  const render = () => { cursor = 0; return module.exports.ResearchTeamWorkbench(props); };
  const find = node => Array.isArray(node) ? node.flatMap(find) : node && typeof node === "object" ? [node, ...find(node.props?.children)] : [];
  const initial = find(render());
  assert.equal(initial.some(node => node.type === "WorkspaceTaskDetail"), false);
  while (effects.length) effects.shift()();
  assert.equal(requests.length, 0);
  initial.find(node => node.props?.className === "blue-team-columns blue-team-task-row").props.onClick();
  assert.deepEqual(requests, [["selected_team_task"]]);
  props.selectedTask = requests[0][0];
  const expanded = find(render());
  assert.equal(expanded.some(node => node.type === "WorkspaceTaskDetail"), false);
  expanded.find(node => node.type === "Button" && node.props.children === "查看任务").props.onClick();
  assert.deepEqual(requests[1], ["selected_team_task", true]);
  props.detailOpen = true;
  const detail = find(render()).find(node => node.type === "WorkspaceTaskDetail");
  assert.equal(detail.props.taskId, "selected_team_task");
  assert.equal(detail.props.kind, "research");
});

test("directions use persisted plan IDs and never merge summary projections or matching titles", () => {
  const groups = teamDirections([
    row("a", "p"),
    row("b", "p"),
    row("a2", "q"),
    row("a3", null),
  ]);
  assert.deepEqual(
    groups.map((g) => g.rows.length),
    [2, 1, 1],
  );
  assert.equal(groups[0].ownGoal, false);
  assert.match(groups[0].title, /a等 2 项任务/);
  assert.equal(groups[2].id, "task:a3");
});
test("only the returned owner goal is a plan title; pending invitations stay planned", () => {
  const [group] = teamDirections([
    row("a", "p", "awaiting_acceptance", { planGoal: "本人私人目标" }),
    row("b", "p"),
  ]);
  assert.equal(group.title, "本人私人目标");
  assert.equal(group.ownGoal, true);
  assert.equal(group.stage, "planned");
  assert.equal(group.accepted, 0);
});
test("progress requires the current reviewed result, excludes cancelled tasks and does not call a submission completion", () => {
  const [group] = teamDirections([
    row("a", "p", "completed", {
      latestDeliverable: { review: { decision: "accepted" } },
    }),
    row("b", "p", "in_review", { latestDeliverable: { review: null } }),
    row("c", "p", "cancelled"),
    row("d", "p", "completed", {
      latestDeliverable: { review: { decision: "changes_requested" } },
    }),
  ]);
  assert.equal(group.total, 3);
  assert.equal(group.accepted, 1);
  assert.equal(group.cancelled, 1);
  assert.equal(group.stage, "active");
  assert.equal(teamDirections([row("x", "x", "cancelled")])[0].stage, "closed");
});
test("collects all authorized pages under one snapshot and forwards cancellation", async () => {
  const calls = [],
    controller = new AbortController();
  const result = await collectTeamWorkspace(async (query, signal) => {
    calls.push(query);
    assert.equal(signal, controller.signal);
    return query.cursor ? page([row("b", "p")]) : page([row("a", "p")], "c1");
  }, controller.signal);
  assert.equal(result.data.length, 2);
  assert.equal(result.truncated, false);
  assert.deepEqual(calls[1], { limit: 100, cursor: "c1", snapshot: "revision-1" });
});
test("rejects changed snapshots, repeated cursors, duplicate tasks and failed later pages instead of showing partial progress", async () => {
  const signal = new AbortController().signal;
  await assert.rejects(
    collectTeamWorkspace(
      async (q) =>
        q.cursor
          ? { ...page([row("b", "p")]), snapshot: { token: "revision-2" } }
          : page([row("a", "p")], "c"),
      signal,
    ),
    /发生变化/,
  );
  await assert.rejects(
    collectTeamWorkspace(
      async (q) => page([row(q.cursor ? "b" : "a", "p")], "c"),
      signal,
    ),
    /分页重复/,
  );
  await assert.rejects(
    collectTeamWorkspace(
      async (q) => page([row("a", "p")], q.cursor ? null : "c"),
      signal,
    ),
    /分页重复/,
  );
  await assert.rejects(
    collectTeamWorkspace(async (q) => {
      if (q.cursor) throw new Error("403");
      return page([row("a", "p")], "c");
    }, signal),
    /403/,
  );
});
test("bounded reads mark partial coverage explicitly and aborts never return old facts", async () => {
  let n = 0;
  const result = await collectTeamWorkspace(
    async () => page([row(String(++n), "p")], String(n)),
    new AbortController().signal,
  );
  assert.equal(n, 10);
  assert.equal(result.truncated, true);
  const controller = new AbortController();
  n = 0;
  await assert.rejects(
    collectTeamWorkspace(async () => {
      n++;
      controller.abort();
      return page([row("a", "p")]);
    }, controller.signal),
  );
  assert.equal(n, 1);
});

test("dependency order is stable even when API rows arrive newest first", () => {
  const first = row("first", "p", "completed"),
    second = row("second", "p", "ready"),
    third = row("third", "p", "ready");
  second.task.dependencies = [{ taskId: "first" }];
  third.task.dependencies = [{ taskId: "second" }];
  assert.equal(
    teamDirections([third, second, first])[0]
      .rows.map((r) => r.task.id)
      .join(","),
    "first,second,third",
  );
  assert.equal(teamDirections([row("ready", "r", "ready")])[0].stage, "planned");
});

test("summary-only completed tasks have unknown review progress, never a misleading zero percent", () => {
  const [summary] = teamDirections([row("summary", null, "completed")]);
  assert.equal(summary.progressVisible, false);
  assert.equal(
    teamDirections([row("full", "p", "completed")])[0].progressVisible,
    true,
  );
});
