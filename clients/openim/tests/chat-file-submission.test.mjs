import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve("vite/package.json"))("esbuild");
const output = path.join(
  await mkdtemp(path.join(tmpdir(), "chat-file-submit-")),
  "submission.cjs",
);
await esbuild.build({
  entryPoints: [
    fileURLToPath(new URL("../src/research/chat-file-submission.ts", import.meta.url)),
  ],
  outfile: output,
  bundle: true,
  platform: "node",
  format: "cjs",
});
const { sendSubmissionFile, assertAgentDocumentSelection } = require(output);
function fixture() {
  const content = "# Synthetic study\nControl group: 12\nTreatment group: 12\n".padEnd(
    101,
    " ",
  );
  const file = new File([content], "groups.md", { type: "" });
  const item = {
    id: "stable-original-request",
    text: "How many groups are in this file?",
    fileAgentConversationId: "personal-assistant",
    files: [
      { id: "doc", file, name: file.name, size: file.size, mediaType: file.type },
    ],
    request: {
      route: "agentChatMessage",
      conversationId: "personal-assistant",
      body: { text: "How many groups are in this file?" },
    },
  };
  const events = [];
  let active = true;
  const io = {
    isCurrent: () => active,
    makeFile: async () => {
      events.push("make");
      return { clientMsgID: "same-sdk-id", contentType: 105 };
    },
    sendFile: async () => {
      events.push("upload");
    },
    save: (patch) => Object.assign(item, patch),
  };
  return {
    item,
    io,
    events,
    content,
    leave: () => {
      active = false;
    },
  };
}

test("101-byte Markdown and the companion question become one canonical file request with exact bytes", async () => {
  const f = fixture();
  assert.equal(f.item.files[0].file.size, 101);
  const request = await sendSubmissionFile(f.item, f.io);
  assert.equal(request.route, "agentFileMessage");
  assert.equal(request.body.text, f.item.text);
  assert.equal(request.body.mediaType, "text/markdown");
  assert.equal(
    Buffer.from(request.body.contentBase64, "base64").toString("utf8"),
    f.content,
  );
  assert.equal(request.conversationId, "personal-assistant");
  assert.equal(f.item.request, request);
  assert.deepEqual(f.events, ["make", "upload"]);
});

test("a lost API acknowledgement retries the same body and key without another SDK upload or plain question", async () => {
  const f = fixture(),
    requests = [];
  async function pump(fail) {
    const request = await sendSubmissionFile(f.item, f.io);
    requests.push({ key: f.item.id, request: structuredClone(request) });
    if (fail) throw Error("synthetic response lost");
  }
  await assert.rejects(pump(true), /response lost/);
  await pump(false);
  assert.deepEqual(requests[0], requests[1]);
  assert.ok(requests.every(({ request }) => request.route === "agentFileMessage"));
  assert.deepEqual(f.events, ["make", "upload"]);
});

test("uncertain SDK upload retries its saved message and never prepares text-only work", async () => {
  const f = fixture();
  let attempts = 0,
    first;
  f.io.sendFile = async (message) => {
    if (!first) first = message;
    else assert.equal(message, first);
    if (++attempts === 1) throw Error("synthetic upload timeout");
  };
  await assert.rejects(sendSubmissionFile(f.item, f.io), /upload timeout/);
  assert.equal(f.item.request.route, "agentChatMessage");
  assert.equal(f.item.files[0].sent, undefined);
  assert.equal((await sendSubmissionFile(f.item, f.io)).route, "agentFileMessage");
  assert.equal(f.events.filter((event) => event === "make").length, 1);
});

test("a prepared file request survives refresh, while a missing unprepared original blocks the question", async () => {
  const f = fixture();
  const prepared = await sendSubmissionFile(f.item, f.io);
  f.item.files = f.item.files.map(({ file, ...entry }) => entry);
  assert.equal(await sendSubmissionFile(f.item, f.io), prepared);
  assert.deepEqual(f.events, ["make", "upload"]);
  const missing = fixture();
  delete missing.item.files[0].file;
  await assert.rejects(sendSubmissionFile(missing.item, missing.io), /重新选择文件/);
  assert.deepEqual(missing.events, []);
});

test("switching away after upload preserves the SDK receipt and prevents file/model preparation", async () => {
  const f = fixture();
  f.io.sendFile = async () => f.leave();
  await assert.rejects(sendSubmissionFile(f.item, f.io), /会话已切换/);
  assert.equal(f.item.files[0].sent, true);
  assert.equal(f.item.request.route, "agentChatMessage");
});

test("unsupported, oversized and missing document targets never generate a companion model request", async () => {
  for (const file of [
    new File(["test"], "test.docx"),
    new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.txt"),
  ]) {
    const f = fixture();
    f.item.files[0].file = file;
    await assert.rejects(sendSubmissionFile(f.item, f.io), /尚未请求回复/);
    assert.equal(f.item.request.route, "agentChatMessage");
  }
  const f = fixture();
  delete f.item.fileAgentConversationId;
  await assert.rejects(sendSubmissionFile(f.item, f.io), /每条消息/);
});

test("multiple documents or mixed images/documents are rejected before enqueue and leave the selection intact", () => {
  const files = [fixture().item.files[0].file, fixture().item.files[0].file];
  assert.throws(() => assertAgentDocumentSelection(files, 0), /输入和附件已保留/);
  assert.equal(files.length, 2);
  assert.throws(
    () => assertAgentDocumentSelection(files.slice(0, 1), 1),
    /图片请单独发送/,
  );
  assert.doesNotThrow(() => assertAgentDocumentSelection(files.slice(0, 1), 0));
});
