import { app, BrowserWindow, dialog, ipcMain, net } from "electron";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { authority } from "./localFolderManage";
import type { dshAccount } from "./localDshAccount";
import type {
  TaskContext,
  TaskTarget,
  TaskSource,
} from "../../../../integrations/deepseek-harness/desktop/task-workspace";
const { DshTaskWorkspace, taskKey } =
  require("./localDshRuntime") as typeof import("../../../../integrations/deepseek-harness/desktop/local-runtime");
type Connection = {
  account: Awaited<ReturnType<typeof dshAccount>>;
  session: Electron.Session;
  origin: string;
};

/** Fixed business operations only: neither arbitrary URLs nor credentials cross IPC. */
export function registerTaskDshBridge(
  connect: (event: Electron.IpcMainInvokeEvent) => Promise<Connection>,
) {
  const stores = new Map<string, InstanceType<typeof DshTaskWorkspace>>();
  async function business(
    c: Connection,
    url: string,
    body?: unknown,
    key?: string,
    binary = false,
  ): Promise<any> {
    await c.account.valid();
    return new Promise((resolve, reject) => {
      const req = c.account.request(url, body === undefined ? "GET" : "POST");
      if (body !== undefined) {
        req.setHeader("Content-Type", "application/json");
        req.setHeader("X-CSRF-Token", c.account.csrf);
        req.setHeader("Idempotency-Key", key || randomUUID());
      }
      const timer = setTimeout(() => {
        req.abort();
        reject(Error("任务服务请求超时，请重试原操作。"));
      }, 30000);
      const fail = (e: Error) => {
        clearTimeout(timer);
        reject(e);
      };
      req.on("error", fail);
      req.on("response", (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > 15 * 1024 * 1024) {
            req.abort();
            fail(Error("资料超过大小限制。"));
          } else chunks.push(Buffer.from(chunk));
        });
        res.on("error", fail);
        res.on("end", async () => {
          clearTimeout(timer);
          try {
            await c.account.valid();
            if (res.statusCode < 200 || res.statusCode >= 300) {
              let code = "";
              try {
                code = JSON.parse(Buffer.concat(chunks).toString("utf8")).error?.code;
              } catch {
                /* non-JSON gateway error */
              }
              throw Object.assign(
                Error(
                  res.statusCode === 409
                    ? "任务版本已变化，请刷新后核对成果；未覆盖其他人的修改。"
                    : res.statusCode === 403 || res.statusCode === 404
                    ? "任务或资料当前不可访问，请核对参与权限。"
                    : "任务服务操作失败，请重试原操作。",
                ),
                { code },
              );
            }
            const bytes = Buffer.concat(chunks);
            resolve(binary ? bytes : JSON.parse(bytes.toString("utf8")).data);
          } catch (e) {
            reject(e);
          }
        });
      });
      req.end(body === undefined ? undefined : JSON.stringify(body));
    });
  }
  async function authorized(
    event: Electron.IpcMainInvokeEvent,
    target: TaskTarget,
    write = false,
  ) {
    const auth = authority(event);
    taskKey(target);
    const hash = new URL(auth.contents.getURL()).hash;
    if (
      !hash.startsWith("#/workbench?") ||
      new URLSearchParams(hash.split("?")[1]).get("task") !== target.taskId
    )
      throw Error("请在对应任务工作页操作。");
    const c = await connect(event);
    const data = await business(
      c,
      target.kind === "research"
        ? `/api/v1/tasks/${target.taskId}`
        : `/api/v1/work/tasks/${target.taskId}`,
    );
    const task = target.kind === "research" ? data.task : data;
    if (!task || task.summaryOnly) throw Error("接受任务后才能使用工作区。");
    const allowed: string[] = task.allowedActions || [];
    if (
      write &&
      !(target.kind === "research"
        ? allowed.includes("submit")
        : allowed.some((a) => ["run", "submit"].includes(a)))
    )
      throw Error("当前任务不能执行，请先承接并开始任务，或确认任务状态。");
    const context: TaskContext = {
      ...target,
      title: task.title,
      goal: [
        task.goal || task.summary,
        task.deliverable && `交付要求：${task.deliverable}`,
        (task.acceptanceCriteria || task.acceptance) &&
          `验收标准：${task.acceptanceCriteria || task.acceptance}`,
      ]
        .filter(Boolean)
        .join("\n"),
      version: task.version,
      agentId: task.agentContactId || undefined,
    };
    const key = c.account.identity + ":" + c.account.lease + ":" + c.origin;
    let store = stores.get(key);
    if (!store) {
      store = new DshTaskWorkspace(
        path.join(app.getPath("userData"), "task-workspaces", c.account.identity),
        async (method, request) => {
          await c.account.valid();
          return new Promise((resolve, reject) => {
            const req = net.request({
              url: c.origin + "/api/" + method,
              method: "POST",
              session: c.session,
              useSessionCookies: true,
              redirect: "error",
            });
            req.setHeader("Content-Type", "application/json");
            req.setHeader("Origin", c.origin);
            const timer = setTimeout(() => {
              req.abort();
              reject(Error("本地 DSH 请求超时，请核对后重试。"));
            }, 20000);
            req.on("error", (e) => {
              clearTimeout(timer);
              reject(e);
            });
            req.on("response", (res) => {
              const chunks: Buffer[] = [];
              let size = 0;
              res.on("data", (chunk) => {
                size += chunk.length;
                if (size > 16 * 1024 * 1024) {
                  req.abort();
                  reject(Error("DSH 历史过大。"));
                } else chunks.push(Buffer.from(chunk));
              });
              res.on("error", reject);
              res.on("end", async () => {
                clearTimeout(timer);
                try {
                  await c.account.valid();
                  const reply = JSON.parse(Buffer.concat(chunks).toString("utf8"));
                  if (!reply.result?.ok)
                    throw Error(reply.result?.error?.message || "DSH 接口调用失败。");
                  resolve(reply.result.value);
                } catch (e) {
                  reject(e);
                }
              });
            });
            req.end(
              JSON.stringify({
                type: "client-request",
                rpcId: randomUUID(),
                method,
                payload: {
                  args: {
                    [method === "session/list" ? "_request" : "request"]: request,
                  },
                },
              }),
            );
          });
        },
        c.account.valid,
      );
      // Old account leases can never be reused; retain only the current connection.
      stores.clear();
      stores.set(key, store);
    }
    return { c, store, context, task, data };
  }
  async function source(
    c: Connection,
    selected: { kind: "artifact" | "library"; id: string; version: number },
    target: TaskTarget,
  ) {
    if (
      !selected ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(selected.id) ||
      !Number.isInteger(selected.version)
    )
      throw Error("资料标识无效。");
    if (selected.kind === "artifact") {
      const a = await business(c, `/api/v1/artifacts/${selected.id}`);
      if (
        target.kind !== "research" ||
        a.taskId !== target.taskId ||
        a.version !== selected.version ||
        a.accessStatus === "revoked"
      )
        throw Error("资料不属于当前任务或已变化。");
      return { metadata: a, url: `/api/v1/artifacts/${selected.id}/content` };
    }
    if (selected.kind !== "library") throw Error("资料类型无效。");
    const detail = await business(c, `/api/v1/research-library/files/${selected.id}`);
    const version = detail.versions.find((v: any) => v.version === selected.version);
    if (!version || detail.file.status !== "available")
      throw Error("资料版本已不可用。");
    return {
      metadata: version,
      url: `/api/v1/research-library/files/${selected.id}/content?version=${selected.version}`,
    };
  }
  ipcMain.handle("task-dsh-open", async (event, target: TaskTarget, pick = false) => {
    const a = await authorized(event, target, true);
    let directory: string | undefined;
    if (pick && !(await a.store.load(target))) {
      const result = await dialog.showOpenDialog(
        BrowserWindow.fromWebContents(event.sender)!,
        {
          title: "选择此任务的本机工作目录",
          properties: ["openDirectory", "createDirectory"],
        },
      );
      if (result.canceled) return;
      directory = result.filePaths[0];
    }
    await authorized(event, target, true);
    await a.store.open(a.context, directory);
    return a.store.status(target);
  });
  ipcMain.handle("task-dsh-status", async (event, target: TaskTarget) => {
    const a = await authorized(event, target);
    return a.store.status(target);
  });
  ipcMain.handle(
    "task-dsh-prompt",
    async (event, target: TaskTarget, text: string, requestId: string) => {
      const a = await authorized(event, target, true),
        b = await a.store.load(target);
      for (const s of b?.sources || []) await source(a.c, s, target);
      await a.store.prompt(a.context, text, requestId);
    },
  );
  ipcMain.handle("task-dsh-note", async (event, target: TaskTarget, note: string) => {
    const a = await authorized(event, target, true);
    await a.store.note(target, note);
  });
  ipcMain.handle("task-dsh-cancel", async (event, target: TaskTarget) => {
    const a = await authorized(event, target);
    await a.store.cancel(target);
  });
  ipcMain.handle("task-dsh-rebase", async (event, target: TaskTarget) => {
    const a = await authorized(event, target, true);
    if (!a.task.allowedActions.includes("submit"))
      throw Error("当前任务不能提交成果。");
    await a.store.rebaseDelivery(a.context);
  });
  ipcMain.handle(
    "task-dsh-import",
    async (
      event,
      target: TaskTarget,
      selected: Pick<TaskSource, "kind" | "id" | "version">,
    ) => {
      const a = await authorized(event, target, true),
        s = await source(a.c, selected, target);
      const bytes = await business(a.c, s.url, undefined, undefined, true);
      await source(a.c, selected, target);
      await authorized(event, target, true);
      return a.store.importSource(
        target,
        { ...selected, sha256: s.metadata.sha256, filename: s.metadata.filename },
        bytes,
      );
    },
  );
  ipcMain.handle("task-dsh-output", async (event, target: TaskTarget, name: string) => {
    const a = await authorized(event, target),
      bytes = await a.store.readOutput(target, name);
    const ext = path.extname(name).toLowerCase();
    return {
      filename: path.basename(name),
      contentBase64: bytes.toString("base64"),
      mediaType:
        ext === ".pdf"
          ? "application/pdf"
          : ext === ".png"
          ? "image/png"
          : "text/plain",
      preview: [".txt", ".md", ".csv", ".json", ".tsv"].includes(ext)
        ? bytes.toString("utf8").slice(0, 12000)
        : "",
    };
  });
  ipcMain.handle(
    "task-dsh-submit",
    async (event, target: TaskTarget, summary: string, names: string[]) => {
      const a = await authorized(event, target);
      const b = await a.store.load(target);
      for (const s of b?.sources || []) await source(a.c, s, target);
      return a.store.deliver(
        a.context,
        summary,
        names,
        (url, body, key) => business(a.c, url, body, key),
        a.task.allowedActions.includes("submit"),
      );
    },
  );
}
