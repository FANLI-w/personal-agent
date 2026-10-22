import { Alert, App, Button, Input, Select, Space, Tag } from "antd";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type {
  ResponseFor,
  RequestFor,
  RouteName,
} from "@research-agent-platform/contracts";
import { researchApi, ResearchApiError } from "./api";
import { useResearchRead } from "./useResearchRead";
import { useResearchStore } from "./store";
import { usePersonalOperation } from "./usePersonalOperation";
import "./lab-workspace.scss";

export function LabWorkspace() {
  const actor = useResearchStore((s) => s.actor),
    operation = usePersonalOperation(true, "lab-membership");
  const { modal } = App.useApp();
  const [name, setName] = useState(""),
    [username, setUsername] = useState(""),
    [code, setCode] = useState("");
  const [feedback, setFeedback] = useState(""),
    [failure, setFailure] = useState(""),
    [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<ResponseFor<"createManagerInvite">["data"]>();
  const lock = useRef(false),
    keys = useRef(new Map<string, string>());
  const confirmation = useRef<ReturnType<typeof modal.confirm>>();
  const codeDraft = useRef<RequestFor<"createManagerInvite">["body"]>();
  useEffect(() => () => confirmation.current?.destroy(), []);
  const labs = useResearchRead(async (signal) => {
    try {
      return await researchApi("myLabs", { signal });
    } catch (error) {
      if (error instanceof ResearchApiError && [404, 501].includes(error.status))
        throw new Error("服务尚未开放课题组管理，请联系维护者更新服务后重试。");
      throw error;
    }
  }, "my-labs");
  const current = labs.data?.data.groups.find((g) => g.id === actor?.member.labId);
  const detail = useResearchRead(
    (signal) => researchApi("labMembership", { params: { id: current!.id }, signal }),
    "lab-members:" + current?.id,
    !!current,
  );
  const invites = useResearchRead(
    (signal) => researchApi("managerInvites", { params: { id: current!.id }, signal }),
    "lab-codes:" + current?.id,
    current?.role === "manager",
  );
  async function run<K extends RouteName>(
    command: K,
    options: { body?: RequestFor<K>["body"]; params?: RequestFor<K>["params"] },
    message: string,
    context = false,
  ): Promise<ResponseFor<K> | undefined> {
    if (lock.current) return;
    const { isCurrent } = operation.capture();
    if (!isCurrent()) return;
    lock.current = true;
    setBusy(true);
    setFailure("");
    setFeedback("");
    const signature = JSON.stringify([command, options]);
    let key = keys.current.get(signature);
    if (!key) {
      key = crypto.randomUUID();
      keys.current.set(signature, key);
    }
    let acknowledged = false;
    try {
      const result = await researchApi(command, { ...options, idempotencyKey: key });
      acknowledged = true;
      keys.current.delete(signature);
      if (!isCurrent()) return;
      setFeedback(message);
      if (context) {
        await useResearchStore.getState().refreshActor();
        return result;
      }
      await Promise.all([labs.refresh(), detail.refresh(), invites.refresh()]);
      return isCurrent() ? result : undefined;
    } catch (error) {
      if (isCurrent())
        setFailure(
          acknowledged
            ? "操作已保存，但当前空间刷新未完成。请点击下方刷新课题组。"
            : error instanceof Error
            ? error.message
            : "操作未完成，请重试。",
        );
    } finally {
      lock.current = false;
      if (isCurrent()) setBusy(false);
    }
  }
  const confirm = (
    title: string,
    content: ReactNode,
    action: () => Promise<unknown>,
  ) => {
    const { isCurrent } = operation.capture();
    confirmation.current = modal.confirm({
      title,
      content,
      okText: "确认",
      cancelText: "取消",
      onOk: async () => {
        if (isCurrent()) await action();
      },
    });
  };
  const preview = async () => {
    const result = await run(
      "previewLabCode",
      { body: { inviteCode: code.trim() } },
      "",
    );
    if (result)
      confirm(
        `加入「${result.data.name}」？`,
        "加入后可以使用该课题组明确共享的资料和任务。你的私人资料、模型 Key 和飞书授权不会自动共享。",
        () =>
          run("joinLab", { body: { inviteCode: code.trim() } }, "已加入课题组。", true),
      );
  };
  if (labs.error)
    return (
      <Alert
        type="warning"
        message={labs.error}
        action={<Button onClick={labs.refresh}>重试</Button>}
      />
    );
  if (!labs.data) return <p role="status">正在读取课题组…</p>;
  return (
    <div className="lab-workspace">
      <header className="my-section-heading">
        <h2>课题组</h2>
        <p>使用当前账号创建或加入课题组，和同事、学生协作。</p>
      </header>
      <Button
        disabled={busy}
        onClick={async () => {
          const { isCurrent } = operation.capture();
          try {
            await useResearchStore.getState().refreshActor();
          } catch (error) {
            if (isCurrent())
              setFailure(
                error instanceof Error ? error.message : "刷新未完成，请重试。",
              );
          }
        }}
      >
        刷新课题组
      </Button>
      {failure && <Alert type="error" message={failure} showIcon />}
      {feedback && <Alert type="success" message={feedback} showIcon />}
      {labs.data.data.invitations.length > 0 && (
        <section aria-label="收到的课题组邀请">
          <h3>收到的邀请</h3>
          {labs.data.data.invitations.map((i) => (
            <div className="lab-member-row" key={i.id}>
              <div>
                <strong>{i.labName}</strong>
                <p>
                  {i.inviterName} 邀请你加入 ·{" "}
                  {new Date(i.expiresAt).toLocaleDateString()}前有效
                </p>
              </div>
              <Space wrap>
                <Button
                  type="primary"
                  disabled={busy}
                  onClick={() =>
                    confirm(
                      `加入「${i.labName}」？`,
                      "只开放课题组已共享的资料和任务；不会共享你的私人资料、模型 Key 或飞书账号。",
                      () =>
                        run(
                          "decideLabInvitation",
                          {
                            params: { id: i.id },
                            body: { expectedVersion: i.version, decision: "accepted" },
                          },
                          "已接受邀请。",
                          true,
                        ),
                    )
                  }
                >
                  接受邀请
                </Button>
                <Button
                  disabled={busy}
                  onClick={() =>
                    run(
                      "decideLabInvitation",
                      {
                        params: { id: i.id },
                        body: { expectedVersion: i.version, decision: "declined" },
                      },
                      "已谢绝邀请。",
                    )
                  }
                >
                  谢绝
                </Button>
              </Space>
            </div>
          ))}
        </section>
      )}
      <section>
        <h3>当前空间</h3>
        <Select
          aria-label="切换课题组"
          value={actor?.member.labId}
          disabled={busy}
          style={{ minWidth: 240, maxWidth: "100%" }}
          options={[
            ...(labs.data.data.personalLabId
              ? [{ label: "个人空间", value: labs.data.data.personalLabId }]
              : []),
            ...labs.data.data.groups.map((g) => ({
              label: g.name + (g.role === "manager" ? "（负责人）" : ""),
              value: g.id,
            })),
          ]}
          onChange={(labId) =>
            run("selectLab", { body: { labId } }, "已切换空间。", true)
          }
        />
        <p className="workspace-muted">
          切换后，工作台使用所选课题组；聊天、个人助手和私人资料保留。
        </p>
      </section>
      {current && (
        <section aria-label="课题组成员">
          <h3>
            {current.name} <Tag>{current.role === "manager" ? "负责人" : "成员"}</Tag>
          </h3>
          {current.role === "manager" && (
            <Button
              disabled={busy}
              onClick={() => {
                let edited = current.name;
                confirm(
                  "修改课题组名称",
                  <Input
                    aria-label="新的课题组名称"
                    defaultValue={current.name}
                    maxLength={100}
                    onChange={(e) => {
                      edited = e.target.value;
                    }}
                  />,
                  () =>
                    run(
                      "renameLab",
                      { params: { id: current.id }, body: { name: edited.trim() } },
                      "课题组名称已更新。",
                    ),
                );
              }}
            >
              修改名称
            </Button>
          )}
          {current.role === "manager" ? (
            <>
              <Space.Compact style={{ width: "100%" }}>
                <Input
                  aria-label="邀请成员的 AcceptCat 号"
                  placeholder="输入对方的 AcceptCat 号"
                  value={username}
                  maxLength={100}
                  onChange={(e) => setUsername(e.target.value)}
                  onPressEnter={() =>
                    !busy &&
                    username.trim() &&
                    run(
                      "inviteLabMember",
                      {
                        params: { id: current.id },
                        body: { username: username.trim() },
                      },
                      "已发出邀请，请对方在「我的 → 课题组」接受。",
                    )
                  }
                />
                <Button
                  type="primary"
                  disabled={busy || !username.trim()}
                  onClick={() =>
                    run(
                      "inviteLabMember",
                      {
                        params: { id: current.id },
                        body: { username: username.trim() },
                      },
                      "已发出邀请，请对方在「我的 → 课题组」接受。",
                    )
                  }
                >
                  邀请已有账号
                </Button>
              </Space.Compact>
              <p className="workspace-muted">
                对方确认后才会成为成员；添加好友或拉入聊天群不会自动加入课题组。
              </p>
            </>
          ) : (
            <Button
              disabled={busy}
              danger
              onClick={() =>
                confirm(
                  "退出课题组？",
                  "你将失去该组的资料与任务访问权限；你共享给该组的资料将改回私人。已有任务保留给课题组，重新加入不会恢复旧的任务授权。",
                  () =>
                    run(
                      "leaveLab",
                      { params: { id: current.id } },
                      "已退出课题组。",
                      true,
                    ),
                )
              }
            >
              退出课题组
            </Button>
          )}
          {detail.error && (
            <Alert
              type="warning"
              message={detail.error}
              action={<Button onClick={detail.refresh}>重试</Button>}
            />
          )}
          {!detail.data && !detail.error && <p role="status">正在读取成员…</p>}
          {detail.data?.data.members.map((m) => (
            <div className="lab-member-row" key={m.id}>
              <div>
                <strong>{m.displayName}</strong>
                <p>
                  AcceptCat 号：{m.username} {m.role === "manager" ? "· 负责人" : ""}
                  {m.id === actor?.member.id ? " · 我" : ""}
                </p>
              </div>
              {current.role === "manager" && m.role !== "manager" && (
                <Button
                  danger
                  disabled={busy}
                  onClick={() =>
                    confirm(
                      `移除 ${m.displayName}？`,
                      "移除后立即停止该成员的课题组资料与任务访问。其私人资料和账号保留，共享资料改回私人；重新邀请不会恢复旧的任务授权。",
                      () =>
                        run(
                          "removeLabMember",
                          {
                            params: { id: current.id, memberId: m.id },
                            body: { expectedVersion: m.version },
                          },
                          "已移除成员。",
                        ),
                    )
                  }
                >
                  移除
                </Button>
              )}
            </div>
          ))}
          {detail.data?.data.invitations.map((i) => (
            <div className="lab-member-row" key={i.id}>
              <div>
                {i.memberName}
                <p>待接受 · {new Date(i.expiresAt).toLocaleDateString()}前有效</p>
              </div>
              <Button
                disabled={busy}
                onClick={() =>
                  run(
                    "revokeLabInvitation",
                    { params: { id: i.id }, body: { expectedVersion: i.version } },
                    "已撤销邀请。",
                  )
                }
              >
                撤销邀请
              </Button>
            </div>
          ))}
          {current.role === "manager" && (
            <>
              <h4>邀请码</h4>
              <p>没有账号的人可在注册时填写；已有账号可在本页输入同一个邀请码加入。</p>
              <Button
                disabled={busy}
                onClick={async () => {
                  codeDraft.current ??= {
                    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
                    maxUses: 20,
                  };
                  const r = await run(
                    "createManagerInvite",
                    {
                      params: { id: current.id },
                      body: codeDraft.current,
                    },
                    "邀请码已生成。",
                  );
                  if (r) {
                    setIssued(r.data);
                    codeDraft.current = undefined;
                  }
                }}
              >
                生成邀请码（7天，20人）
              </Button>
              {issued && (
                <div className="lab-issued-code">
                  <Input.TextArea
                    aria-label="课题组邀请码"
                    readOnly
                    autoSize
                    value={issued.code}
                  />
                  <Button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(issued.code);
                        setFeedback("邀请码已复制。");
                      } catch {
                        setFailure("复制未完成，请选中上方邀请码手动复制。");
                      }
                    }}
                  >
                    复制邀请码
                  </Button>
                  <p>发给希望加入的人。关闭页面后不再显示，请妥善保管。</p>
                </div>
              )}
              {invites.error && (
                <Alert
                  type="warning"
                  message={invites.error}
                  action={<Button onClick={invites.refresh}>重试</Button>}
                />
              )}
              {invites.data?.data.invites.map((i) => (
                <div className="lab-member-row" key={i.id}>
                  <span>
                    {new Date(i.createdAt).toLocaleDateString()}创建 · 已使用
                    {i.usedCount}/{i.maxUses} ·{" "}
                    {i.revokedAt
                      ? "已撤销"
                      : new Date(i.expiresAt).getTime() <= Date.now()
                      ? "已过期"
                      : `有效至${new Date(i.expiresAt).toLocaleDateString()}`}
                  </span>
                  {!i.revokedAt && new Date(i.expiresAt).getTime() > Date.now() && (
                    <Button
                      disabled={busy}
                      onClick={() =>
                        run(
                          "revokeManagerInvite",
                          { params: { id: current.id, inviteId: i.id } },
                          "邀请码已撤销。",
                        )
                      }
                    >
                      撤销
                    </Button>
                  )}
                </div>
              ))}
              {invites.data?.data.truncated && <p>仅展示最近50个邀请码。</p>}
              <p className="workspace-muted">
                负责人暂不支持直接退出；需要解散或交接时联系维护者处理。
              </p>
            </>
          )}
        </section>
      )}
      <section>
        <h3>通过邀请码加入</h3>
        <Space.Compact style={{ width: "100%" }}>
          <Input
            aria-label="课题组邀请码"
            placeholder="粘贴负责人发来的邀请码"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <Button disabled={busy || !code.trim()} onClick={preview}>
            查看并加入
          </Button>
        </Space.Compact>
      </section>
      {!labs.data.data.groups.some((g) => g.role === "manager") && (
        <section>
          <h3>创建课题组</h3>
          <p>创建后你将成为负责人，可以邀请成员和管理共享范围。</p>
          <Space.Compact style={{ width: "100%" }}>
            <Input
              aria-label="课题组名称"
              maxLength={100}
              placeholder="例如：智能计算课题组"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button
              type="primary"
              disabled={busy || !name.trim()}
              onClick={() =>
                run(
                  "createLab",
                  { body: { name: name.trim() } },
                  "课题组已创建。",
                  true,
                )
              }
            >
              创建课题组
            </Button>
          </Space.Compact>
        </section>
      )}
      <p className="workspace-muted">
        加入课题组不会开放私人论文库、模型 Key
        或飞书账号。资料仍由库主人明确选择共享；飞书原表的网页访问继续受飞书权限控制。
      </p>
    </div>
  );
}
