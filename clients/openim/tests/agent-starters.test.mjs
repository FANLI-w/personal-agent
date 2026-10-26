import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { routes } from "@research-agent-platform/contracts";
import { agentStarters, libraryAgentStarter, findOwnedStarter, planningAgentStarter, prepareColleagueAgent } from "../src/research/agentStarterProfiles.ts";
const previous = JSON.parse(readFileSync(new URL("fixtures/agent-starters-0.10.38.json", import.meta.url), "utf8"));
const previousConversation = JSON.parse(readFileSync(new URL("fixtures/agent-starters-0.10.40.json", import.meta.url), "utf8"));
const contact = (profile, owner = "owner") => ({
  id: "agent_existing", displayName: profile.displayName,
  identity: { kind: "personal_agent", ownerMemberId: owner },
  profile: { ...profile, role: "specialist" }, relationship: { status: "own" },
});
test("workbench planning reuses the edited research colleague and its own direct conversation", async () => {
  const edited = contact({ ...planningAgentStarter.profile, displayName: "我的研究同事", personality: "先给判断，再帮一步" });
  const calls = [];
  const result = await prepareColleagueAgent({ api: async (name, options) => {
    calls.push(name);
    if (name === "chatContacts") return { data: [edited] };
    if (name === "createDirectConversation") {
      assert.equal(options.body.contactId, edited.id);
      return { data: { id: "direct_one", kind: "direct", ownerMemberId: "owner", members: [{ contactId: edited.id, status: "joined" }] } };
    }
    assert.fail(`Unexpected mutation ${name}`);
  }, actorId: "owner", starter: planningAgentStarter, rememberedId: edited.id, creationKey: "synthetic_creation", isCurrent: () => true });
  assert.equal(result.agent.profile.personality, edited.profile.personality);
  assert.deepEqual(calls, ["chatContacts", "createDirectConversation"]);
});
test("legacy planning requests retain their original idempotency shape without an inserted colleague field", () => {
  const legacy = { labId: "lab_synthetic", prompt: "Discuss the next evidence gap", inputArtifactIds: [], budget: { maxTokens: 100000, maxSeconds: 30 } };
  const parsed = routes.planRequest.request.shape.body.parse(legacy);
  assert.equal(Object.hasOwn(parsed, "colleague"), false);
  assert.equal(Object.hasOwn(parsed, "replyMode"), false);
  assert.deepEqual(routes.planRequest.request.shape.body.parse({ ...legacy, colleague: { contactId: "agent_one", conversationId: "direct_one" } }).colleague, { contactId: "agent_one", conversationId: "direct_one" });
});
test("colleague preparation never replaces a foreign, missing or external remembered identity", async () => {
  const owned = contact(planningAgentStarter.profile);
  for (const entries of [[], [contact(planningAgentStarter.profile, "other")], [{ ...owned, agentRuntime: { serviceOrigin: "https://example.invalid" } }]]) {
    let writes = 0;
    await assert.rejects(prepareColleagueAgent({ api: async name => {
      if (name === "chatContacts") return { data: entries };
      writes++; throw Error("Unexpected write");
    }, actorId: "owner", starter: planningAgentStarter, rememberedId: owned.id, creationKey: "synthetic_creation", isCurrent: () => true }));
    assert.equal(writes, 0);
  }
});
test("changing account while reading colleagues prevents creation and opening a private conversation", async () => {
  let active = true, writes = 0;
  const result = await prepareColleagueAgent({ api: async name => {
    if (name === "chatContacts") { active = false; return { data: [] }; }
    writes++; throw Error("Unexpected write");
  }, actorId: "owner", starter: planningAgentStarter, creationKey: "synthetic_creation", isCurrent: () => active });
  assert.equal(result, undefined); assert.equal(writes, 0);
});
test("all conversational templates fit the existing creation API without adding permissions or fields", () => {
  for (const starter of agentStarters)
    assert.equal(routes.createPersonalAgent.request.shape.body.safeParse(starter.profile).success, true, starter.id);
});
test("all seven previous templates reuse the same owned Agent without rewriting its profile", () => {
  assert.equal(previous.starters.length, 7);
  for (const prior of previous.starters) {
    const starter = agentStarters.find((item) => item.id === prior.id);
    const existing = contact(prior.profile), before = structuredClone(existing);
    assert.equal(findOwnedStarter([existing], starter, "owner"), existing);
    assert.deepEqual(existing, before);
  }
  assert.equal(agentStarters.find((item) => item.id === "research-library"), libraryAgentStarter);
});
test("colleague profiles preserve every 0.10.40 Agent and its edits without generating a duplicate", () => {
  for (const prior of previousConversation.starters) {
    const starter = agentStarters.find((item) => item.id === prior.id);
    const existing = contact(prior.profile), before = structuredClone(existing);
    assert.equal(findOwnedStarter([existing], starter, "owner"), existing);
    assert.deepEqual(existing, before);
    assert.equal(findOwnedStarter([existing], starter, "different-owner"), undefined);
  }
});
test("new templates reuse; edited profiles require an owned remembered link and never match another account", () => {
  for (const starter of agentStarters) {
    const fresh = contact(starter.profile);
    assert.equal(findOwnedStarter([fresh], starter, "owner"), fresh);
    const edited = contact({ ...starter.profile, personality: "用户自己的交流偏好" });
    assert.equal(findOwnedStarter([edited], starter, "owner"), undefined);
    assert.equal(findOwnedStarter([edited], starter, "owner", edited.id), edited);
    assert.equal(findOwnedStarter([edited], starter, "other", edited.id), undefined);
    assert.equal(findOwnedStarter([contact(starter.profile, "other")], starter, "owner"), undefined);
  }
});
