const { chromium } = require("@playwright/test");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const output =
  process.env.ACCEPTCAT_CHAT_UI_OUTPUT ||
  path.join(require("node:os").tmpdir(), "acceptcat-chat-experience-ui");
(async () => {
  const browser = await chromium.launch({
    channel: process.env.ACCEPTCAT_CHAT_UI_BROWSER || "msedge",
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  const errors = [],
    checks = [];
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
  const shot = (name) =>
    page.screenshot({ path: path.join(output, name + ".png"), fullPage: true });
  try {
    await page.goto("http://127.0.0.1:4389/?timeline");
    await page.locator("#chat-list").waitFor();
    await page.getByText("建议补充独立重复实验。", { exact: true }).waitFor();
    await page
      .locator(".chat-source-link")
      .filter({ hasText: "请比较两种实验方法" })
      .waitFor();
    assert.equal(await page.locator("#chat-list table").count(), 1);
    checks.push(
      "canonical source relation and rich answer render in real virtualized timeline",
    );
    await shot("timeline-01");
    await page
      .locator("#chat_canonical_answer")
      .getByLabel("消息操作：右键或按 Shift+F10", { exact: true })
      .click({ button: "right" });
    await page.getByRole("menuitem", { name: "引用", exact: false }).click();
    await page.locator(".ck-editor__editable").fill("引用草稿验证");
    await page.reload();
    await page.getByRole("button", { name: "取消引用", exact: true }).waitFor();
    assert.match(
      await page.locator(".ck-editor__editable").innerText(),
      /引用草稿验证/,
    );
    await page.getByRole("button", { name: "取消引用", exact: true }).click();
    await page.locator(".ck-editor__editable").fill("");
    checks.push("quoted Agent identity and unsent text survive reload together");
    await page.getByRole("button", { name: "搜索聊天", exact: true }).click();
    await page.getByPlaceholder("输入文字查找").fill("检索锚点");
    await page.getByPlaceholder("输入文字查找").press("Enter");
    await page
      .locator(".desktop-history-results button")
      .filter({ hasText: "检索锚点" })
      .click();
    await page.getByRole("button", { name: "定位到聊天", exact: true }).click();
    await page.locator("#chat_native_2.chat-message-highlight").waitFor();
    await shot("timeline-02-search-jump");
    checks.push("search loads older pages and highlights original message");
    const before = await page.locator("#chat-list").evaluate((e) => e.scrollTop);
    await page.evaluate(() =>
      window.fixture.emitter.emit("PUSH_NEW_MSG", {
        ...window.fixture.nativeMessages[0],
        clientMsgID: "late_other",
        groupID: "other_group",
        textElem: { content: "wrong conversation" },
      }),
    );
    assert.equal(
      await page.getByText("wrong conversation", { exact: true }).count(),
      0,
    );
    await page.evaluate(() =>
      window.fixture.emitter.emit("PUSH_NEW_MSG", {
        ...window.fixture.nativeMessages[0],
        clientMsgID: "late_current",
        sendTime: Date.now() + 20,
        textElem: { content: "new message without stealing history" },
      }),
    );
    await page.waitForTimeout(350);
    assert.ok(
      Math.abs(
        (await page.locator("#chat-list").evaluate((e) => e.scrollTop)) - before,
      ) < 80,
    );
    checks.push("late messages remain scoped and do not steal history position");
    await page.getByRole("button", { name: "切换会话", exact: true }).click();
    await page.waitForTimeout(250);
    await page.getByRole("button", { name: "切换会话", exact: true }).click();
    await page.locator(".chat-message-highlight").waitFor();
    checks.push("conversation switch restores reading position");
    await page.getByRole("button", { name: "回到最新消息", exact: true }).click();
    await page.locator("#chat_canonical_answer").waitFor();
    await page.evaluate(() => {
      window.fixture.sdkBehavior.loseAck = true;
    });
    await page
      .locator("#chat_canonical_answer")
      .getByLabel("消息操作：右键或按 Shift+F10", { exact: true })
      .click({ button: "right" });
    await page.getByRole("menuitem", { name: "转发…", exact: false }).click();
    await page.getByLabel("测试同事", { exact: true }).check();
    await page.getByRole("button", { name: /确\s*认/ }).click();
    await page.waitForFunction(() =>
      window.fixture.sdkCalls.some((c) => c.name === "send"),
    );
    await page.getByRole("button", { name: "继续处理未确认消息", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    const sent = await page.evaluate(() =>
      window.fixture.sdkCalls.filter((c) => c.name === "send"),
    );
    assert.equal(sent[0].recvID, "im_peer");
    assert.equal(sent[0].message.contentType, 101);
    assert.match(sent[0].message.textElem.content, /方法比较/);
    assert.equal(sent[0].message.customElem, undefined);
    assert.equal(sent.length, 1);
    checks.push(
      "lost forward acknowledgement reconciles the original SDK message without duplicate send",
    );
    checks.push(
      "Agent forwarding rechecks authority and sends attributed text without action pointers",
    );
    await page
      .locator(".chat-source-link")
      .filter({ hasText: "请比较两种实验方法" })
      .click();
    await page
      .locator("#chat_canonical_input")
      .getByLabel("消息操作：右键或按 Shift+F10", { exact: true })
      .click({ button: "right" });
    await page.getByRole("menuitem", { name: "撤回", exact: false }).click();
    await page.getByRole("button", { name: /确\s*认/ }).click();
    await page.getByText("这条消息已撤回", { exact: true }).waitFor();
    checks.push("canonical withdrawal refreshes projected message");
    await page.getByRole("button", { name: "回到最新消息", exact: true }).click();
    await page
      .locator("#chat_canonical_answer")
      .getByLabel("消息操作：右键或按 Shift+F10", { exact: true })
      .click({ button: "right" });
    await page.getByRole("menuitem", { name: "多选", exact: false }).click();
    await page
      .getByRole("toolbar", { name: "批量消息操作" })
      .getByRole("button", { name: "本机删除", exact: true })
      .click();
    await page.getByRole("button", { name: /确\s*认/ }).click();
    await page.locator("#chat_canonical_answer").waitFor({ state: "detached" });
    checks.push("multi-selection and local deletion hide selected message");
    await page.reload();
    await page.locator("#chat-list").waitFor();
    await page.waitForTimeout(400);
    assert.equal(await page.locator("#chat_canonical_answer").count(), 0);
    checks.push("local deletion IDs survive reload");
    await shot("timeline-03-deleted");
    await page.getByRole("button", { name: "聊天详情", exact: true }).click();
    await page.getByRole("switch", { name: "消息免打扰", exact: true }).click();
    await page.waitForFunction(() =>
      window.fixture.sdkCalls.some((c) => c.name === "preference" && "recvMsgOpt" in c),
    );
    await page.getByRole("switch", { name: "置顶聊天", exact: true }).click();
    await page.waitForFunction(() =>
      window.fixture.sdkCalls.some(
        (c) => c.name === "preference" && c.isPinned === true,
      ),
    );
    checks.push("unified details apply real mute and pin SDK operations");
    await page.getByRole("button", { name: "任务、资料与群协作", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByText("测试同事的助手", { exact: true })
      .first()
      .waitFor();
    assert.equal(
      await page.getByRole("button", { name: "移除成员", exact: true }).count(),
      0,
    );
    checks.push(
      "group details show Agent ownership and respect absent management permission",
    );
    await shot("timeline-04-details");
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(output, "timeline-report.json"),
      JSON.stringify({ checks, errors }, null, 2),
    );
    console.log(JSON.stringify({ passed: checks.length, checks }));
  } catch (e) {
    await shot("timeline-failure");
    fs.writeFileSync(
      path.join(output, "timeline-failure.json"),
      JSON.stringify(
        {
          checks,
          errors,
          error: String(e),
          state: await page.evaluate(() => ({
            storage: { ...sessionStorage },
            timeline: window.fixture.useChatTimeline.getState(),
            sdk: window.fixture.sdkCalls,
          })),
        },
        null,
        2,
      ),
    );
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
