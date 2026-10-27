import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve("vite/package.json"))("esbuild");
const directory = await mkdtemp(path.join(tmpdir(), "chat-image-submission-"));
const output = path.join(directory, "submission.cjs");
await esbuild.build({
  entryPoints: [
    fileURLToPath(new URL("../src/research/chat-image-submission.ts", import.meta.url)),
  ],
  outfile: output,
  bundle: true,
  platform: "node",
  format: "cjs",
});
const { sendSubmissionImages, assertImageQueueCapacity } = require(output);
const image = (id) => {
  const file = new File([`synthetic-${id}`], `${id}.png`, { type: "image/png" });
  return { id, file, name: file.name, size: file.size, mediaType: file.type };
};
function fixture(agent = false) {
  const item = {
    id: "same-click-key",
    text: "请结合这两张图解释结论",
    images: [image("first"), image("second")],
    ...(agent
      ? {
          imageAgentConversationId: "agent_conversation",
          request: {
            route: "agentChatMessage",
            conversationId: "agent_conversation",
            body: { text: "请结合这两张图解释结论" },
          },
        }
      : {}),
  };
  const events = [];
  let active = true;
  const io = {
    isCurrent: () => active,
    save: (patch) => Object.assign(item, patch),
    makeImage: async (file) => {
      events.push(`make:${file.name}`);
      return { clientMsgID: file.name, contentType: 102 };
    },
    sendImage: async (message) => {
      events.push(`send:${message.clientMsgID}`);
    },
    recognize: async (file) => {
      events.push(`ocr:${file.name}`);
      return `合成文字 ${file.name}`;
    },
  };
  return {
    item,
    io,
    events,
    leave: () => {
      active = false;
    },
  };
}

test("one click sends original images in order before the companion text, without asking a model for a human chat", async () => {
  const { item, io, events } = fixture();
  const result = await sendSubmissionImages(item, io);
  assert.equal(result, undefined);
  assert.deepEqual(events, [
    "make:first.png",
    "send:first.png",
    "make:second.png",
    "send:second.png",
  ]);
  assert.equal(item.text, "请结合这两张图解释结论");
  assert.ok(item.images.every((image) => image.sent));
});

test("two local-Agent images and the original question become one file request, retaining full Unicode OCR and source boundaries", async () => {
  const { item, io, events } = fixture(true);
  const request = await sendSubmissionImages(item, io);
  assert.equal(request.route, "agentFileMessage");
  assert.equal(request.body.text, item.text);
  assert.equal(request.conversationId, "agent_conversation");
  const content = Buffer.from(request.body.contentBase64, "base64").toString("utf8");
  assert.match(
    content,
    /图片 1：first.png[\s\S]*合成文字 first.png[\s\S]*图片 2：second.png[\s\S]*合成文字 second.png/,
  );
  assert.match(content, /并非原图/);
  assert.ok(events.indexOf("send:second.png") < events.indexOf("ocr:first.png"));
  assert.equal(item.request, request);
});

test("an uncertain second upload retries the same SDK message while skipping the acknowledged first image", async () => {
  const { item, io, events } = fixture();
  const send = io.sendImage;
  let fail = true;
  io.sendImage = async (message) => {
    await send(message);
    if (message.clientMsgID === "second.png" && fail)
      throw Error("synthetic network loss");
  };
  await assert.rejects(sendSubmissionImages(item, io), /network loss/);
  const second = item.images[1].message;
  assert.ok(item.images[0].sent);
  fail = false;
  await sendSubmissionImages(item, io);
  assert.equal(item.images[1].message, second);
  assert.equal(events.filter((event) => event === "make:second.png").length, 1);
  assert.equal(events.filter((event) => event === "send:first.png").length, 1);
  assert.equal(events.filter((event) => event === "send:second.png").length, 2);
});

test("leaving a conversation preserves its acknowledged receipt and stops the remaining files and model preparation", async () => {
  const f = fixture(true);
  f.io.sendImage = async (message) => {
    f.events.push(`send:${message.clientMsgID}`);
    f.leave();
  };
  await assert.rejects(sendSubmissionImages(f.item, f.io), /会话已切换/);
  assert.ok(f.item.images[0].sent);
  assert.equal(f.item.images[1].message, undefined);
  assert.equal(
    f.events.some((event) => event.startsWith("ocr:")),
    false,
  );
  assert.equal(f.item.request.route, "agentChatMessage");
});

test("OCR retry keeps original uploads and the earlier recognized text, then prepares only one stable request", async () => {
  const f = fixture(true);
  const recognize = f.io.recognize;
  let fail = true;
  f.io.recognize = async (file) => {
    const text = await recognize(file);
    if (file.name === "second.png" && fail) throw Error("synthetic OCR failure");
    return text;
  };
  await assert.rejects(sendSubmissionImages(f.item, f.io), /OCR failure/);
  fail = false;
  const prepared = await sendSubmissionImages(f.item, f.io);
  const replay = await sendSubmissionImages(f.item, f.io);
  assert.equal(replay, prepared);
  assert.equal(f.events.filter((event) => event.startsWith("send:")).length, 2);
  assert.equal(f.events.filter((event) => event === "ocr:first.png").length, 1);
  assert.equal(f.events.filter((event) => event === "ocr:second.png").length, 2);
});

test("refresh without original files cannot silently send the question alone", async () => {
  const f = fixture(true);
  f.item.images = f.item.images.map(({ file, ...image }) => image);
  await assert.rejects(sendSubmissionImages(f.item, f.io), /重新选择图片/);
  assert.deepEqual(f.events, []);
});

test("a fully prepared acknowledged image request can be retried after refresh without reupload or another OCR pass", async () => {
  const f = fixture(true);
  const prepared = await sendSubmissionImages(f.item, f.io);
  f.item.images = f.item.images.map(({ file, ocrText, ...image }) => image);
  f.events.length = 0;
  assert.deepEqual(await sendSubmissionImages(f.item, f.io), prepared);
  assert.deepEqual(f.events, []);
});

test("image-only messages work and blank OCR never fabricates a model request", async () => {
  const f = fixture();
  f.item.text = "";
  await sendSubmissionImages(f.item, f.io);
  const agent = fixture(true);
  agent.item.text = "";
  agent.io.recognize = async () => "  ";
  await assert.rejects(sendSubmissionImages(agent.item, agent.io), /未识别到文字/);
  assert.equal(agent.item.request.route, "agentChatMessage");
});

test("the whole queued image set is bounded, and ordinary text submissions keep their original request", async () => {
  const f = fixture();
  assert.throws(
    () =>
      assertImageQueueCapacity(
        f.item.images,
        Array.from({ length: 10 }, () => f.item),
      ),
    /待发图片/,
  );
  assert.throws(
    () => assertImageQueueCapacity([{ ...image("large"), size: 51 * 1024 * 1024 }], []),
    /待发图片/,
  );
  const request = {
    route: "agentChatMessage",
    body: { text: "纯文字" },
    conversationId: "original",
  };
  assert.equal(
    await sendSubmissionImages({ id: "text", text: "纯文字", request }, f.io),
    request,
  );
  assert.deepEqual(f.events, []);
});
