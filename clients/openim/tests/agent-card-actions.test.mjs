import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

async function load(file, imports = {}) {
  const source = await fs.readFile(new URL(`../src/research/${file}`, import.meta.url), "utf8");
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, require: name => imports[name] });
  return module.exports;
}
const { isAddedAgent } = await load("agent-card-actions.ts");
const profiles = await load("agentStarterProfiles.ts");
const links = await load("agent-starter-links.ts", { "./agentStarterProfiles": profiles });
const starter = profiles.agentStarters[0];
const contact = { id: "synthetic_agent", displayName: starter.profile.displayName,
  identity: { kind: "personal_agent", ownerMemberId: "actor_A" },
  relationship: { status: "own" }, profile: { ...starter.profile, role: "specialist" }, allowedActions: ["chat", "edit_profile"] };

test("only actual own/accepted Agents get added-card actions; humans and pending/revoked relations do not", () => {
  assert.equal(isAddedAgent(), false);
  assert.equal(isAddedAgent(contact), true);
  for (const kind of ["personal_agent", "public_agent"]) {
    for (const status of ["own", "accepted", "none", "pending_outbound", "pending_inbound", "declined", "revoked"]) {
      assert.equal(isAddedAgent({ ...contact, identity: { kind }, relationship: { status } }), ["own", "accepted"].includes(status));
    }
  }
  assert.equal(isAddedAgent({ ...contact, identity: { kind: "human" } }), false);
});

test("added state does not manufacture chat permission or successful external connection", () => {
  const denied = { ...contact, allowedActions: [], agentRuntime: { callerAllowed: false, verification: "failed" } };
  assert.equal(isAddedAgent(denied), true);
  assert.equal(denied.allowedActions.includes("chat"), false);
});

test("known template keeps exact owned ID after renaming and editing; no profile overwrite", () => {
  const edited = { ...contact, displayName: "自定义文献助理", profile: { ...contact.profile, introduction: "合成修改介绍" } };
  assert.equal(profiles.findOwnedStarter([edited], starter, "actor_A"), undefined);
  assert.equal(profiles.findOwnedStarter([edited], starter, "actor_A", contact.id), edited);
  assert.equal(edited.profile.introduction, "合成修改介绍");
});

test("local ID hint cannot revive deleted, different-owner, non-own, human or coordinator contacts", () => {
  assert.equal(profiles.findOwnedStarter([], starter, "actor_A", contact.id), undefined);
  for (const changed of [
    { ...contact, identity: { kind: "personal_agent", ownerMemberId: "actor_B" } },
    { ...contact, identity: { kind: "human", memberId: "actor_A" } },
    { ...contact, relationship: { status: "revoked" } },
    { ...contact, profile: { ...contact.profile, role: "coordinator" } },
  ]) assert.equal(profiles.findOwnedStarter([changed], starter, "actor_A", contact.id), undefined);
});

test("fresh exact profile is reused without a hint; same name with changed body is not guessed", () => {
  assert.equal(profiles.findOwnedStarter([contact], starter, "actor_A"), contact);
  const changed = { ...contact, profile: { ...contact.profile, introduction: "另一个 Agent" } };
  assert.equal(profiles.findOwnedStarter([changed], starter, "actor_A"), undefined);
});

test("template hints persist per account and reject unknown keys, invalid types and broken storage", () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  links.writeStarterLinks("actor_A", { [starter.id]: contact.id, unknown: "secret", "paper-revision": 42 }, storage);
  assert.equal(links.readStarterLinks("actor_A", storage)[starter.id], contact.id);
  assert.deepEqual(Object.keys(links.readStarterLinks("actor_A", storage)), [starter.id]);
  assert.equal(Object.keys(links.readStarterLinks("actor_B", storage)).length, 0);
  assert.equal(Object.keys(links.readStarterLinks("", storage)).length, 0);
  for (const value of ["invalid", "null", "[]", "12"]) assert.equal(Object.keys(links.readStarterLinks("actor_A", { ...storage, getItem: () => value })).length, 0);
  assert.equal(Object.keys(links.readStarterLinks("actor_A", { getItem() { throw Error("blocked"); } })).length, 0);
  assert.doesNotThrow(() => links.writeStarterLinks("actor_A", {}, { setItem() { throw Error("blocked"); } }));
});
