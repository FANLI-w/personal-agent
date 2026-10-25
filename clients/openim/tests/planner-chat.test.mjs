import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  newPlannerThread,
  plannerCacheKey,
  readPlannerHistory,
  planningPrompt,
  planReplyText,
  plannerReplyMessage,
  plannerDeadline,
  needsDeadlineClarification,
  plannerPlanInput,
  plannerTaskShape,
  plannerTaskInput,
  isPlannerCreateCommand,
  createPlannerTasks,
  stopPlannerRequest,
  plannerFailureText,
  canRetryPlannerReply,
  plannerRetryInput,
  isPlannerFailureReceipt,
} from "../src/research/planner-chat.ts";
const schedule = () => ({
  suggested: null,
  hardDeadline: null,
  committed: null,
  checkpoint: null,
  estimatedHumanHours: null,
});
const makePlan = () => ({
  id: "plan_qa",
  labId: "lab_qa",
  ownerId: "actor_qa",
  version: 1,
  status: "draft",
  createdAt: "2026-10-19T00:00:00Z",
  goal: "合成课题",
  unresolvedQuestions: [],
  proposedItems: [1, 2].map((n) => ({
    id: "step_" + n,
    title: "任务" + n,
    goal: "目标" + n,
    deliverable: "材料" + n,
    acceptanceCriteria: "可复核",
    allocation: { kind: "self" },
    dependencies: [],
    schedule: schedule(),
    inputArtifactIds: [],
    budget: null,
  })),
});

test("a conversational reply with no plan is visible and keeps scientific text intact", () => {
  const text =
    "We can compare “what if?” with https://example.org/paper?view=abstract .\nThen inspect the evidence.";
  const result = { status: "ready", reply: { message: text, plan: null } };
  assert.deepEqual(plannerReplyMessage(result), { text });
  assert.equal(
    plannerReplyMessage({ status: "failed", reply: { message: text, plan: null } }),
    undefined,
  );
  assert.equal(plannerReplyMessage({ status: "ready", reply: null }), undefined);
});

test("draft messages use the actual answer, retain the plan version, and remain compatible with old replies", () => {
  const plan = makePlan();
  assert.deepEqual(
    plannerReplyMessage({
      status: "draft",
      reply: { message: "Synthetic research judgment.", plan },
    }),
    {
      text: "Synthetic research judgment.",
      plan: { id: plan.id, version: plan.version },
    },
  );
  assert.deepEqual(plannerReplyMessage({ status: "draft", reply: { plan } }), {
    text: planReplyText(plan),
    plan: { id: plan.id, version: plan.version },
  });
});
test("a failed model reply explains the system failure and offers only a deliberate safe retry", () => {
  const result = { status: "failed", failure: "INVALID_MODEL_OUTPUT" };
  assert.match(plannerFailureText(result), /系统处理/);
  assert.doesNotMatch(plannerFailureText(result), /继续说明|补充信息|缩小需求/);
  assert.equal(canRetryPlannerReply(result), true);
  assert.equal(
    canRetryPlannerReply({ ...result, failure: "PLANNING_SAVE_FAILED" }),
    true,
  );
  for (const value of [
    { status: "running", failure: null },
    { status: "cancelled", failure: "INVALID_MODEL_OUTPUT" },
    { status: "failed", failure: "BUDGET_EXCEEDED" },
    { status: "failed", failure: "MODEL_UNAVAILABLE" },
  ])
    assert.equal(canRetryPlannerReply(value), false);
});
test("retry keeps the earlier conversation and the original follow-up exactly once, including old cached failures", () => {
  const messages = [
    { id: "one", role: "user", text: "Synthetic existing work" },
    { id: "two", role: "assistant", text: "Synthetic first response" },
    { id: "three", role: "user", text: "SYNTHETIC_FOLLOWUP" },
    {
      id: "four",
      role: "service",
      text: "这次规划未能完成。您可以继续说明后重新规划，已有任务没有因此改变。",
    },
  ];
  const restored = readPlannerHistory(
    JSON.stringify({
      active: "thread",
      threads: [
        {
          ...newPlannerThread(),
          id: "thread",
          messages,
          draft: "Unsent independent draft",
        },
      ],
    }),
  ).threads[0];
  const retry = plannerRetryInput(restored.messages);
  assert.equal(retry.text, "SYNTHETIC_FOLLOWUP");
  assert.deepEqual(retry.messages, messages.slice(0, 2));
  const prompt = planningPrompt(retry.messages, retry.text, []).prompt;
  assert.equal(prompt.split("SYNTHETIC_FOLLOWUP").length - 1, 1);
  assert.match(prompt, /Synthetic first response/);
  assert.equal(restored.draft, "Unsent independent draft");
  assert.deepEqual(restored.messages, messages);
});
test("retry cannot resubmit a creation command or a message still waiting for an assistant response", () => {
  assert.equal(
    plannerRetryInput([
      { id: "one", role: "user", text: "确认创建任务" },
      { id: "two", role: "service", text: "failed" },
    ]),
    undefined,
  );
  assert.equal(
    plannerRetryInput([{ id: "one", role: "user", text: "Synthetic follow-up" }]),
    undefined,
  );
});
test("an old failed request never relabels a later task creation receipt or another request", () => {
  const result = { id: "failed_job", status: "failed" };
  assert.equal(
    isPlannerFailureReceipt(
      { id: "one", role: "service", text: "这份计划已建立 2 项任务。" },
      result,
    ),
    false,
  );
  assert.equal(
    isPlannerFailureReceipt(
      { id: "one", role: "service", text: "这次规划未能完成。" },
      result,
    ),
    true,
  );
  assert.equal(
    isPlannerFailureReceipt(
      { id: "one", role: "service", text: "System issue", requestId: "other_job" },
      result,
    ),
    false,
  );
  assert.equal(
    isPlannerFailureReceipt(
      { id: "one", role: "service", text: "System issue", requestId: result.id },
      result,
    ),
    true,
  );
});
function fake(initial = makePlan(), failure) {
  let value = structuredClone(initial),
    calls = [];
  return {
    get value() {
      return value;
    },
    calls,
    async call(name, args) {
      calls.push({ name, args });
      if (name === "getPlan") return { data: structuredClone(value) };
      if (name === "editPlan") {
        assert.equal(args.body.expectedVersion, value.version);
        const { expectedVersion, ...body } = args.body;
        value = { ...value, ...body, version: value.version + 1 };
        if (failure === "edit") {
          failure = null;
          throw new Error("reply lost");
        }
        return { data: structuredClone(value) };
      }
      if (name === "confirmPlan") {
        assert.equal(args.body.expectedVersion, value.version);
        value = { ...value, status: "confirmed", version: value.version + 1 };
        if (failure === "confirm") {
          failure = null;
          throw new Error("reply lost");
        }
        return {
          data: {
            plan: structuredClone(value),
            taskIds: value.proposedItems.map((_, i) => `task_${i + 1}`),
          },
        };
      }
      if (name === "planTasks")
        return {
          data: {
            steps: value.proposedItems.map((_, i) => ({ taskId: `task_${i + 1}` })),
          },
        };
      throw new Error(name);
    },
  };
}
test("one goal defaults to one task; object counts, complaints and quotes do not request more tasks", () => {
  for (const text of [
    "完善论文和实验",
    "比较3个模型并写报告",
    "为什么给我创建了7个任务",
    "上次让我创建7个任务太多了",
    "他说创建7个任务",
    "请创建7个任务？",
    "请创建“7个任务”",
  ])
    assert.equal(plannerTaskShape(text), "single");
  for (const text of ["拆成两个任务", "请帮我创建3项任务", "分别创建多个任务"])
    assert.equal(plannerTaskShape(text), "multiple");
  assert.equal(plannerTaskShape("不要拆分任务", "multiple"), "single");
  assert.equal(plannerTaskShape("不要创建多个任务", "multiple"), "single");
  assert.equal(plannerTaskShape("合并成一个任务", "multiple"), "single");
  assert.equal(plannerTaskShape("我只要一个任务", "multiple"), "single");
  assert.equal(plannerTaskShape("改成3项任务"), "multiple");
  assert.equal(plannerTaskShape("改为小王负责", "multiple"), "multiple");
  assert.equal(plannerTaskShape("继续修改说明", "multiple"), "multiple");
});
test("task input treats a stated goal as a draft and keeps task count outside editable personality", () => {
  const single = planningPrompt([], "完善现有论文", []).prompt;
  assert(single.includes("目标足够就给待确认草案"));
  assert(single.includes("proposedItems必须只有一项"));
  assert(single.includes("人设和方法建议不能改变"));
  assert(
    planningPrompt([], "分别安排", [], undefined, "", "multiple").prompt.includes(
      "用户已明确选择分开创建",
    ),
  );
});
test("seven generated steps become one reviewed task with every title, purpose, deliverable and criterion retained", () => {
  const plan = makePlan();
  plan.proposedItems = Array.from({ length: 7 }, (_, i) => ({
    ...structuredClone(plan.proposedItems[0]),
    id: `step_${i + 1}`,
    title: `步骤${i + 1}`,
    goal: `目的${i + 1}`,
    deliverable: `交付${i + 1}`,
    acceptanceCriteria: `标准${i + 1}`,
    dependencies: i ? [`step_${i}`] : [],
  }));
  const original = structuredClone(plan),
    merged = plannerPlanInput(plan, undefined, "single");
  assert.equal(merged.proposedItems.length, 1);
  assert.deepEqual(plan, original);
  assert.equal(merged.proposedItems[0].title, plan.goal);
  for (let i = 1; i <= 7; i++) {
    assert(merged.proposedItems[0].goal.includes(`步骤${i}`));
    assert(merged.proposedItems[0].goal.includes(`目的${i}`));
    assert(merged.proposedItems[0].deliverable.includes(`交付${i}`));
    assert(merged.proposedItems[0].acceptanceCriteria.includes(`标准${i}`));
  }
  assert(merged.proposedItems[0].goal.includes("前置步骤：6"));
  assert.deepEqual(merged.proposedItems[0].dependencies, []);
  assert.equal(plannerPlanInput(plan, undefined, "multiple").proposedItems.length, 7);
});
test("combining cannot hide invalid graphs, different authority, incompatible dates or oversized content", () => {
  const cycle = makePlan();
  cycle.proposedItems[0].dependencies = ["step_2"];
  cycle.proposedItems[1].dependencies = ["step_1"];
  assert.throws(() => plannerPlanInput(cycle, undefined, "single"), /循环/);
  const missing = makePlan();
  missing.proposedItems[0].dependencies = ["unknown"];
  assert.throws(() => plannerPlanInput(missing, undefined, "single"), /无效/);
  const mixed = makePlan();
  mixed.proposedItems[1].allocation = { kind: "invitation", memberId: "other" };
  assert.throws(() => plannerPlanInput(mixed, undefined, "single"), /分工/);
  const publicRun = makePlan();
  publicRun.proposedItems.forEach((item) => {
    item.allocation = {
      kind: "public_agent",
      capability: null,
      humanLeadId: "actor_qa",
      missingReason: "not available",
    };
  });
  assert.throws(() => plannerPlanInput(publicRun, undefined, "single"), /执行授权/);
  const dated = plannerPlanInput(makePlan(), { date: "2026-11-01", target: 0 });
  assert.throws(() => plannerTaskInput(dated, "single"), /日程/);
  const long = makePlan();
  long.proposedItems.forEach((item) => (item.goal = "文".repeat(7000)));
  assert.throws(() => plannerPlanInput(long, undefined, "single"), /容量/);
  assert.equal(long.proposedItems[0].goal.length, 7000);
});
test("a common or final explicit deadline survives a one-task preview without inferred dates", () => {
  for (const target of ["all", "final"]) {
    const merged = plannerPlanInput(
      makePlan(),
      { date: "2026-11-01", target },
      "single",
    );
    assert.equal(
      merged.proposedItems[0].schedule.hardDeadline.value.date,
      "2026-11-01",
    );
    assert.equal(merged.proposedItems[0].schedule.committed, null);
  }
});
test("the single-task preview is the exact draft edit confirmed, including lost edit and confirmation receipts", async () => {
  for (const failure of [undefined, "edit", "confirm"]) {
    const plan = makePlan(),
      f = fake(plan, failure),
      intent = { key: "single_task_confirmation", plan, taskShape: "single" };
    if (failure)
      await assert.rejects(
        createPlannerTasks(f.call, intent, () => true),
        /reply lost/,
      );
    const result = await createPlannerTasks(f.call, intent, () => true);
    assert.equal(result.taskIds.length, 1);
    assert.equal(result.plan.proposedItems.length, 1);
    assert.deepEqual(
      result.plan.proposedItems,
      plannerPlanInput(plan, undefined, "single").proposedItems,
    );
    assert.equal(f.calls.filter((call) => call.name === "editPlan").length, 1);
    assert.equal(f.calls.filter((call) => call.name === "confirmPlan").length, 1);
    assert.equal(result.plan.version, 3);
  }
});
test("legacy pending multi-task writes cannot be resumed, while already-created task links reconcile unchanged", async () => {
  const plan = makePlan(),
    f = fake(plan),
    legacy = { key: "legacy_confirmation", plan };
  await assert.rejects(
    createPlannerTasks(f.call, legacy, () => true),
    /重新核对为一项任务/,
  );
  assert.equal(f.calls.length, 1);
  const completed = fake(plan, "confirm");
  await assert.rejects(
    createPlannerTasks(
      completed.call,
      { ...legacy, taskShape: "multiple" },
      () => true,
    ),
    /reply lost/,
  );
  const result = await createPlannerTasks(completed.call, legacy, () => true);
  assert.equal(result.taskIds.length, 2);
  assert.equal(completed.calls.filter((call) => call.name === "confirmPlan").length, 1);
});
test("task grouping stays with its account-scoped transcript and pending reviewed snapshot", () => {
  const thread = newPlannerThread();
  thread.taskShape = "multiple";
  thread.creating = {
    key: "synthetic_confirmation",
    plan: makePlan(),
    taskShape: "single",
  };
  const restored = readPlannerHistory(
    JSON.stringify({ active: thread.id, threads: [thread] }),
  );
  assert.equal(restored.threads[0].taskShape, "multiple");
  assert.equal(restored.threads[0].creating.taskShape, "single");
  assert.equal(
    readPlannerHistory(
      JSON.stringify({
        active: thread.id,
        threads: [{ ...thread, taskShape: "invalid" }],
      }),
    ),
    undefined,
  );
});
test("transcript keys isolate service, actor and laboratory, restored pending writes remain explicit", () => {
  assert.notEqual(
    plannerCacheKey("https://one", "a", "lab"),
    plannerCacheKey("https://two", "a", "lab"),
  );
  assert.notEqual(
    plannerCacheKey("https://one", "a", "lab"),
    plannerCacheKey("https://one", "b", "lab"),
  );
  assert.notEqual(
    plannerCacheKey("https://one", "a", "lab"),
    plannerCacheKey("https://one", "a", "other"),
  );
  const t = newPlannerThread();
  t.creating = { key: "idempotency_key_1234", plan: makePlan() };
  assert.equal(
    readPlannerHistory(JSON.stringify({ active: t.id, threads: [t] })).threads[0]
      .creating.plan.id,
    "plan_qa",
  );
  assert.equal(
    readPlannerHistory(
      JSON.stringify({ active: t.id, threads: [{ ...t, taskIds: "bad" }] }),
    ),
    undefined,
  );
  assert.equal(readPlannerHistory("{invalid"), undefined);
});
test("conversation context stays bounded, keeps the latest request intact, and reports omitted history", () => {
  const messages = Array.from({ length: 30 }, (_, i) => ({
    id: String(i),
    role: "user",
    text: "旧条件" + i + "长".repeat(1000),
  }));
  const text = "当前明确需求" + "文".repeat(3500);
  const result = planningPrompt(messages, text, [
    { id: "member_b", displayName: "同学乙" },
  ]);
  assert(result.prompt.length <= 8000);
  assert(result.prompt.endsWith(text));
  assert(result.prompt.includes("同学乙（member_b）"));
  assert(result.omitted > 0);
  assert(!result.prompt.includes("旧条件0长"));
});

test("the shipped decomposition method uses existing plan fields and leaves the latest request intact", () => {
  const skill = readFileSync(
    new URL("../../../agents/skills/task-decomposition/SKILL.md", import.meta.url),
    "utf8",
  );
  const text = "请比较三种合成模型并整理组会报告";
  const result = planningPrompt([], text, [], undefined, skill);
  assert(result.prompt.includes("按产出倒推"));
  assert(result.prompt.includes("依赖无环"));
  assert(result.prompt.includes("dependencies 字段"));
  assert(!result.prompt.includes("name: task-decomposition"));
  assert(result.prompt.endsWith(text));
  assert(result.prompt.length <= 8000);
});

test("a conversational clarification is shown as the reply without an internal goal heading or questionnaire", () => {
  const plan = makePlan();
  plan.goal = "继续已有研究（内部草案目标）";
  plan.proposedItems = [];
  plan.unresolvedQuestions = [
    "可以，我们从已有工作继续。先说说这项研究主要想解决什么问题？",
  ];
  assert.equal(planReplyText(plan), plan.unresolvedQuestions[0]);
  assert(!planReplyText(plan).includes(plan.goal));
  assert(!planReplyText(plan).includes("还需要您补充"));
});

test("legacy multi-question plans present one exchange while preserving every saved uncertainty", () => {
  const plan = makePlan();
  plan.unresolvedQuestions = ["研究重点是什么？", "何时交付？", "谁来参与？"];
  const original = structuredClone(plan);
  assert.equal(planReplyText(plan), "研究重点是什么？");
  assert.deepEqual(plan, original);
  plan.unresolvedQuestions = ["还需要您补充：\n1. 研究重点是什么？\n2. 何时交付？"];
  assert.equal(planReplyText(plan), "研究重点是什么？");
  plan.unresolvedQuestions = ["还需要您补充：", "研究重点是什么？"];
  assert.equal(planReplyText(plan), "研究重点是什么？");
});

test("scientific quotations, question marks and URLs in one exchange are not sliced into broken text", () => {
  const plan = makePlan();
  plan.unresolvedQuestions = [
    "我们先看“what if?”的对照思路，参考 https://example.org/paper?view=abstract 。你最想验证哪个解释？",
  ];
  assert.equal(planReplyText(plan), plan.unresolvedQuestions[0]);
});

test("a reply with no uncertainty does not invent questions, dates, participants or completed work", () => {
  const plan = makePlan();
  const text = planReplyText(plan);
  assert(text.includes("2 个步骤"));
  assert(!/[？?]/.test(text));
  assert(!/已创建|已完成|已接受|截止/.test(text));
  plan.proposedItems = [];
  assert.equal(planReplyText(plan), plan.goal);
});

test("the full shipped method and the latest 4000-character request fit with a large team and prior conversation", () => {
  const skill = readFileSync(
    new URL("../../../agents/skills/task-decomposition/SKILL.md", import.meta.url),
    "utf8",
  );
  const text = "本轮明确补充" + "文".repeat(3994);
  const people = Array.from({ length: 20 }, (_, i) => ({
    id: `member_${i}`,
    displayName: "成员" + "长".repeat(75),
  }));
  const history = [
    {
      id: "earlier",
      role: "user",
      text: "已有一份研究稿，希望沿现有工作继续；暂时没有明确日期。",
    },
  ];
  const result = planningPrompt(history, text, people, undefined, skill);
  assert(result.prompt.endsWith(text));
  assert(result.prompt.length <= 8000);
  assert(
    result.prompt.includes(skill.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim()),
  );
});
test("only explicit create commands authorize confirmation; questions, quotes and negations cannot", () => {
  for (const v of ["确认创建任务", "确认创建", "就按这个方案创建任务！"])
    assert(isPlannerCreateCommand(v));
  for (const v of [
    "不要确认创建任务",
    "确认创建任务吗？",
    "他说“确认创建任务”",
    "确认创建任务，然后再讨论",
    "好",
    '"确认创建任务"',
  ])
    assert.equal(isPlannerCreateCommand(v), false);
});
test("Chinese weekdays and calendar dates are resolved against Beijing date, ambiguity stays unresolved", () => {
  const now = new Date("2026-10-19T00:00:00Z");
  assert.deepEqual(plannerDeadline("周五交付报告", now), {
    date: "2026-10-23",
    target: "final",
  });
  assert.deepEqual(plannerDeadline("所有任务截止下周五", now), {
    date: "2026-10-30",
    target: "all",
  });
  assert.deepEqual(plannerDeadline("第2步改到2026年10月25日", now), {
    date: "2026-10-25",
    target: 1,
  });
  assert.equal(plannerDeadline("不要周五截止", now), undefined);
  assert.equal(plannerDeadline("周三完成A，周五完成B", now), undefined);
  assert.equal(plannerDeadline("截止2026-02-30", now), undefined);
  assert.deepEqual(plannerDeadline("取消整体截止日期", now), {
    date: null,
    target: "all",
  });
});
test("deadline proposals change only the explicitly selected steps and do not mutate the current plan", () => {
  const p = makePlan(),
    result = plannerPlanInput(p, { date: "2026-10-23", target: "final" });
  assert.equal(p.proposedItems[1].schedule.hardDeadline, null);
  assert.equal(result.proposedItems[0].schedule.hardDeadline, null);
  assert.equal(result.proposedItems[1].schedule.hardDeadline.value.date, "2026-10-23");
  assert.throws(() => plannerPlanInput(p, { date: "2026-10-23", target: 4 }), /不存在/);
});
test("creation rechecks the exact reviewed version and uses one stable confirmation key", async () => {
  const p = makePlan(),
    f = fake(p);
  const out = await createPlannerTasks(
    f.call,
    { key: "stable_confirmation_123", plan: p, taskShape: "multiple" },
    () => true,
  );
  assert.deepEqual(out.taskIds, ["task_1", "task_2"]);
  assert.equal(f.calls.filter((c) => c.name === "confirmPlan").length, 1);
  assert.equal(
    f.calls.find((c) => c.name === "confirmPlan").args.idempotencyKey,
    "stable_confirmation_123",
  );
});
test("a stale reviewed version cannot confirm unseen changes", async () => {
  const p = makePlan(),
    changed = { ...p, version: 2, goal: "其他窗口的修改" },
    f = fake(changed);
  await assert.rejects(
    createPlannerTasks(
      f.call,
      { key: "stable_confirmation_123", plan: p, taskShape: "multiple" },
      () => true,
    ),
    /其他窗口/,
  );
  assert.equal(f.calls.filter((c) => c.name === "confirmPlan").length, 0);
});
test("uncertain confirmation is reconciled to real task links without a second confirmation", async () => {
  const p = makePlan(),
    f = fake(p, "confirm"),
    intent = { key: "stable_confirmation_123", plan: p, taskShape: "multiple" };
  await assert.rejects(
    createPlannerTasks(f.call, intent, () => true),
    /reply lost/,
  );
  const out = await createPlannerTasks(f.call, intent, () => true);
  assert.deepEqual(out.taskIds, ["task_1", "task_2"]);
  assert.equal(f.calls.filter((c) => c.name === "confirmPlan").length, 1);
});
test("an acknowledged date edit with a lost reply is resumed once and confirmed under its exact new version", async () => {
  const p = makePlan(),
    f = fake(p, "edit"),
    intent = {
      key: "stable_confirmation_123",
      plan: p,
      taskShape: "multiple",
      deadline: { date: "2026-10-23", target: "final" },
    };
  await assert.rejects(
    createPlannerTasks(f.call, intent, () => true),
    /reply lost/,
  );
  const out = await createPlannerTasks(f.call, intent, () => true);
  assert.equal(f.calls.filter((c) => c.name === "editPlan").length, 1);
  assert.equal(out.plan.version, 3);
  assert.equal(
    out.plan.proposedItems[1].schedule.hardDeadline.value.date,
    "2026-10-23",
  );
});
test("account or thread cancellation after a read prevents all mutations", async () => {
  const p = makePlan(),
    f = fake(p);
  let active = true;
  const api = async (name, args) => {
    const v = await f.call(name, args);
    active = false;
    return v;
  };
  await assert.rejects(
    createPlannerTasks(
      api,
      { key: "stable_confirmation_123", plan: p, taskShape: "multiple" },
      () => active,
    ),
    /已切换/,
  );
  assert.equal(f.calls.length, 1);
});

test("stop uses the latest version of the same job and rereads a single queue race", async () => {
  const calls = [];
  let reads = 0;
  await stopPlannerRequest(
    async (name, args) => {
      calls.push([name, args]);
      if (name === "getPlanRequest")
        return { data: { id: "job_one", status: "running", version: ++reads + 1 } };
      if (reads === 1)
        throw Object.assign(new Error("queue advanced"), { status: 409 });
      return { data: { status: "cancelled" } };
    },
    "job_one",
    () => true,
  );
  assert.deepEqual(
    calls.map(([n]) => n),
    ["getPlanRequest", "cancelPlanning", "getPlanRequest", "cancelPlanning"],
  );
  assert.ok(calls.every(([, a]) => a.params.id === "job_one"));
  assert.equal(calls[3][1].body.expectedVersion, 3);
});

test("stop never cancels a completed request or a changed account", async () => {
  let writes = 0,
    active = true;
  await stopPlannerRequest(
    async (name) => {
      if (name === "cancelPlanning") writes++;
      return { data: { status: "draft", version: 3 } };
    },
    "job_one",
    () => active,
  );
  await stopPlannerRequest(
    async (name) => {
      if (name === "cancelPlanning") writes++;
      active = false;
      return { data: { status: "running", version: 2 } };
    },
    "job_one",
    () => active,
  );
  assert.equal(writes, 0);
});

test("unsupported or ambiguous deadlines require clarification instead of silently replacing dates", () => {
  assert.equal(plannerDeadline("第二项周五截止").target, 1);
  for (const text of [
    "不是周五截止，改成周一",
    "前两项周五交付",
    "周五下午三点交付",
    "2026-02-30 交付",
  ]) {
    assert.equal(plannerDeadline(text), undefined);
    assert.equal(needsDeadlineClarification(text), true);
  }
  assert.equal(needsDeadlineClarification("改由我负责"), false);
  assert.equal(
    needsDeadlineClarification("2026-10-23 交付", plannerDeadline("2026-10-23 交付")),
    false,
  );
});
