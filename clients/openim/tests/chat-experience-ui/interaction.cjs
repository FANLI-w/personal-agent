const { createRequire } = require("node:module"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const requireClient = createRequire(path.resolve(__dirname, "../../package.json"));
const output =
  process.env.ACCEPTCAT_CHAT_UI_OUTPUT ||
  path.join(require("node:os").tmpdir(), "acceptcat-chat-experience-ui");
fs.mkdirSync(output, { recursive: true });
const { chromium } = requireClient("@playwright/test");
(async () => {
  const browser = await chromium.launch({
    channel: process.env.ACCEPTCAT_CHAT_UI_BROWSER || "msedge",
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [],
    warnings = [],
    checks = [];
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      if (msg.text().startsWith("Warning: findDOMNode is deprecated"))
        warnings.push(
          "Existing Ant Design WaveEffect uses deprecated findDOMNode in React development mode.",
        );
      else errors.push(msg.text());
    }
    if (msg.type() === "warning") warnings.push(msg.text());
  });
  const screenshot = (name) =>
    page.screenshot({ path: path.join(output, name + ".png"), fullPage: true });
  try {
    await page.goto("http://127.0.0.1:4389");
    await page.locator(".ck-editor__editable").waitFor();
    assert.match(await page.title(), /AcceptCat/);
    assert.match(await page.locator("body").innerText(), /合成测试环境/);
    checks.push("identity and nonblank");
    const editor = page.locator(".ck-editor__editable");
    await editor.click();
    await page.keyboard.insertText("请😀 ");
    await page.keyboard.insertText("@");
    const mine = page
      .locator(".ck-mentions .chat-mention-option")
      .filter({ hasText: "文献助手" })
      .filter({ hasText: "我的助手" });
    await mine.waitFor();
    await screenshot("01-mention-desktop");
    await mine.click();
    await page.keyboard.insertText("比较方法，再请 ");
    await page.keyboard.insertText("@");
    const peer = page
      .locator(".ck-mentions .chat-mention-option")
      .filter({ hasText: "文献助手" })
      .filter({ hasText: "测试同事的助手" });
    await peer.waitFor();
    await peer.click();
    await page.keyboard.insertText("检查局限。");
    assert.deepEqual(
      await editor
        .locator("[data-contact-id]")
        .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-contact-id"))),
      ["agent_mine", "agent_peer"],
    );
    assert.equal(
      await page.evaluate(
        () => window.fixture.calls.filter((c) => c.name === "sendChatMessage").length,
      ),
      0,
    );
    checks.push("same-name identities selected in natural prose without sending");
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await page.waitForFunction(() => window.fixture.messages.length === 1);
    const sent = await page.evaluate(
      () => window.fixture.calls.find((c) => c.name === "sendChatMessage").options.body,
    );
    assert.deepEqual(sent.agentContactIds, ["agent_mine", "agent_peer"]);
    for (const m of sent.mentions)
      assert.equal(sent.text.slice(m.start, m.end), "@文献助手");
    await page.waitForFunction(
      () => document.querySelectorAll("[data-progress-turn]").length === 2,
    );
    assert.match(
      await page.locator("[data-progress-turn]").first().innerText(),
      /我的助手/,
    );
    assert.match(
      await page.locator("[data-progress-turn]").nth(1).innerText(),
      /测试同事的助手/,
    );
    await screenshot("02-dual-replies-desktop");
    checks.push("one persisted input; two distinct requests and attributed streams");
    await page
      .locator('[data-agent-status="agent_mine"]')
      .getByRole("button", { name: "停止回复" })
      .click();
    await page.waitForFunction(() => window.fixture.turns[0].status === "cancelled");
    assert.equal(await page.evaluate(() => window.fixture.turns[1].status), "running");
    checks.push("cancel one Agent without cancelling sibling");
    await page.getByRole("button", { name: "引用同事助手的回答" }).click();
    await editor.click();
    await page.keyboard.insertText("为什么需要补充对照？");
    assert.match(await page.locator("[data-chat-quote]").innerText(), /未另选成员时/);
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await page.waitForFunction(() => window.fixture.messages.length === 2);
    const follow = await page.evaluate(
      () =>
        window.fixture.calls.filter((c) => c.name === "sendChatMessage").at(-1).options
          .body,
    );
    assert.equal(follow.agentContactId, "agent_peer");
    assert.match(follow.text, /> 引用 文献助手/);
    checks.push("quoted answer follows up with its owning Agent identity");
    await page.getByRole("button", { name: "引用同事助手的回答" }).click();
    await page.getByRole("button", { name: "仅引用内容" }).click();
    assert.equal(await page.locator(".chat-reply-recipient").count(), 0);
    await page.getByRole("button", { name: "取消引用" }).click();
    checks.push("quote-only opt-out visible");
    await page.getByRole("button", { name: "提及成员", exact: true }).click();
    await page.getByRole("textbox", { name: "搜索群成员或助手" }).fill("同事");
    assert.equal(
      await page.locator(".chat-mention-options .chat-mention-option").count(),
      3,
    );
    checks.push("searchable toolbar picker matches member and Agent owners");
    await page.keyboard.press("Escape");
    await page.locator("header").click();
    await page.setViewportSize({ width: 390, height: 844 });
    await editor.click();
    await page.keyboard.insertText("@同事");
    await page.locator(".ck-mentions").waitFor();
    await page.waitForFunction(() => {
      const el = document.querySelector(".ck-mentions");
      const rect = el?.getBoundingClientRect();
      return (
        rect &&
        rect.left >= 0 &&
        rect.right <= window.innerWidth + 1 &&
        getComputedStyle(el).visibility === "visible"
      );
    });
    await screenshot("03-mention-narrow");
    await page.waitForFunction(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      {},
      { timeout: 3000 },
    );
    checks.push("390px inline picker and no horizontal overflow");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Backspace");
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.getByRole("button", { name: "提及成员", exact: true }).click();
    const option = page
      .locator(".chat-mention-options .chat-mention-option")
      .filter({ hasText: "方法助手" });
    await option.click();
    await page.keyboard.insertText("请保留这个草稿");
    await page.reload();
    await page.waitForFunction(() =>
      document.querySelector('[data-contact-id="agent_method"]'),
    );
    assert.match(await editor.innerText(), /请保留这个草稿/);
    checks.push("draft reload restores identity-bearing mention");
    await editor.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Backspace");
    await page.keyboard.insertText("@");
    await page.locator(".ck-mentions").waitFor();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() =>
      document.querySelector(".ck-editor__editable [data-contact-id]"),
    );
    assert.equal(await page.evaluate(() => window.fixture.messages.length), 0);
    checks.push("Enter selects a mention rather than sending the message");
    const parsed = await page.evaluate(() =>
      window.fixture.readMentionComposer(
        '<p>&nbsp;请😀 <span class="mention" data-contact-id="a">@甲&amp;乙</span></p><p>第二行<br>结束</p>',
      ),
    );
    assert.equal(parsed.text, "请😀 @甲&乙\n第二行\n结束");
    assert.equal(
      parsed.text.slice(parsed.mentions[0].start, parsed.mentions[0].end),
      "@甲&乙",
    );
    checks.push("UTF-16, entities, whitespace, paragraphs preserve exact offsets");
    // An advanced fallback selection must never override explicitly selected identities.
    await editor.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Backspace");
    await page.keyboard.insertText("@");
    await mine.click();
    await page.keyboard.insertText("请解释选择依据");
    await page.getByRole("button").filter({ hasText: "协作设置" }).first().click();
    await page.getByTitle("普通聊天", { exact: true }).click();
    await page.getByTitle("提出协作需求", { exact: true }).click();
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await page.waitForFunction(() => window.fixture.messages.length === 1);
    const advanced = await page.evaluate(
      () =>
        window.fixture.calls.filter((c) => c.name === "sendChatMessage").at(-1).options
          .body,
    );
    assert.equal(advanced.agentContactId, "agent_mine");
    assert.deepEqual(advanced.budget, { maxTokens: 4000, maxSeconds: 90 });
    checks.push("advanced settings preserve explicit recipients and budget");
    await page.evaluate(() => {
      const t = window.fixture.turns[0];
      t.status = "failed";
      t.failure = "UPSTREAM_ERROR";
      t.allowedActions = ["retry"];
      t.version++;
    });
    await page
      .locator('[data-agent-status="agent_mine"]')
      .getByRole("button", { name: "核对并重试" })
      .click();
    assert.equal(
      await page.evaluate(
        () => window.fixture.calls.filter((c) => c.name === "retryChatTurn").length,
      ),
      0,
    );
    await page.getByRole("button", { name: "确认重试", exact: true }).click();
    await page.waitForFunction(() =>
      window.fixture.calls.some((c) => c.name === "retryChatTurn"),
    );
    const retry = await page.evaluate(() =>
      window.fixture.calls.find((c) => c.name === "retryChatTurn"),
    );
    assert.equal(
      retry.options.params.id,
      await page.evaluate(() => window.fixture.turns[0].id),
    );
    assert.ok(retry.options.idempotencyKey);
    checks.push(
      "failed Agent retries only its own versioned request after confirmation",
    );
    await page.evaluate(() =>
      window.fixture.useResearchStore.setState({
        generation: 2,
        actor: { member: { id: "peer" }, isLabManager: false },
        sessionActorId: "peer",
      }),
    );
    await page.waitForFunction(() =>
      window.fixture.calls.some(
        (c) => c.actor === "peer" && c.name === "chatMessageAgentStatuses",
      ),
    );
    assert.equal(await page.locator("[data-progress-turn]").count(), 0);
    assert.equal(await page.getByRole("button", { name: "停止回复" }).count(), 0);
    assert.equal(
      await page.evaluate(
        () =>
          window.fixture.calls.filter(
            (c) =>
              c.actor === "peer" &&
              [
                "chatTurn",
                "chatTurnProgress",
                "retryChatTurn",
                "cancelChatTurn",
              ].includes(c.name),
          ).length,
      ),
      0,
    );
    checks.push(
      "account switch clears private streams; other group members only read public receipts",
    );
    await page.evaluate(() => document.querySelector('.desktop-chat-footer').classList.add('is-native-desktop'));
    await page.getByRole('button', { name: '提及成员', exact: true }).locator('.anticon').waitFor({state:'visible'});
    assert.equal(await page.getByRole('button', { name: '提及成员', exact: true }).locator('.anticon').isVisible(), true);
    checks.push('native desktop stylesheet keeps the mention icon visible');
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(output, "ui-results.json"),
      JSON.stringify(
        {
          url: page.url(),
          viewports: ["1200x900", "390x844"],
          checks,
          errors,
          warnings,
          browser:
            "isolated headless Edge via Playwright; Browser plugin not available",
          boundary:
            "Synthetic API and account state; production editor/composer/receipts/progress components. No real OpenIM or model acceptance.",
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ checks, errors, warnings }, null, 2));
  } catch (error) {
    await screenshot("ui-failure");
    console.error(error);
    console.error(
      "OVERFLOW",
      await page.evaluate(() =>
        [...document.querySelectorAll("body *")]
          .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
          .map((el) => ({
            tag: el.tagName,
            cls: el.className,
            right: el.getBoundingClientRect().right,
          }))
          .slice(-12),
      ),
    );
    console.error("BODY", await page.locator("body").innerText());
    console.error("ERRORS", errors);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
