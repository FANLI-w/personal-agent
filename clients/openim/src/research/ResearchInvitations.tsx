import { Alert, Button, Modal, Space, Tag } from "antd";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { researchApi, ResearchApiError } from "./api";
import { useResearchStore } from "./store";
import { useResearchRead } from "./useResearchRead";
import { ResearchTaskPanel } from "./ResearchTaskPanel";
import { usePersonalOperation } from "./usePersonalOperation";

const invitationStatus = {
  pending: "待处理",
  accepted: "已接受",
  declined: "已拒绝",
  revoked: "已撤回",
};

export function ResearchInvitations() {
  const generation = useResearchStore((s) => s.generation);
  const operation = usePersonalOperation(true, "group-invitations");
  const confirmation = useRef<ReturnType<typeof Modal.confirm>>();
  const [relatedGroup, setRelatedGroup] = useState<string>();
  const [showTasks, setShowTasks] = useState(false);
  const actor = useResearchStore((s) => s.actor);
  const invitations = useResearchRead(
    () => researchApi("chatInvitations", { query: { limit: 100 } }),
    "group-invitations",
  );
  const tasks = useResearchRead(
    () =>
      researchApi("tasks", {
        query: { labId: actor!.member.labId, scope: "mine", limit: 100 },
      }),
    actor?.member.id || "",
    !!actor && showTasks,
  );
  const related = useResearchRead(
    async (signal) => {
      const group = await researchApi("chatConversation", {
        params: { id: relatedGroup! },
        signal,
      });
      const results = await Promise.all(
        group.data.taskIds.map(async (id) => {
          try {
            const { data } = await researchApi("task", { params: { id }, signal });
            const task = "task" in data ? data.task : data;
            return { id: task.id, title: task.title };
          } catch (error) {
            if (error instanceof ResearchApiError && [403, 404].includes(error.status))
              return null;
            throw error;
          }
        }),
      );
      return results.filter((task): task is NonNullable<typeof task> => !!task);
    },
    `invitation-related-tasks:${relatedGroup}`,
    !!relatedGroup,
    { poll: false },
  );
  const [failure, setFailure] = useState(""),
    [taskId, setTaskId] = useState("");
  useLayoutEffect(() => {
    setTaskId("");
    setRelatedGroup(undefined);
    setShowTasks(false);
    setFailure("");
    return () => confirmation.current?.destroy();
  }, [generation]);
  const contacts = useResearchStore((s) => s.contacts);
  const dialogOpen = Boolean(relatedGroup || taskId);
  const focusDialogTitle = useCallback(
    (title: HTMLSpanElement | null) => {
      if (dialogOpen) title?.focus({ preventScroll: true });
    },
    [dialogOpen, taskId],
  );
  return (
    <div className="h-full space-y-4 overflow-auto bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold">群邀请</h2>
        <Button
          onClick={() => setShowTasks((value) => !value)}
          aria-expanded={showTasks}
        >
          {showTasks ? "收起我的任务" : "查看我的任务"}
        </Button>
      </div>
      {showTasks && (
        <section className="space-y-2 rounded border p-3" aria-label="我的任务">
          {tasks.error && <Alert type="error" message={tasks.error} />}
          {!tasks.data && !tasks.error && <p role="status">正在读取我的任务…</p>}
          {tasks.data && !tasks.data.data.length && <p>暂无可查看的任务</p>}
          <Space wrap>
            {tasks.data?.data.map((value) => (
              <Button key={value.id} onClick={() => setTaskId(value.id)}>
                {value.title}
              </Button>
            ))}
          </Space>
        </section>
      )}
      <p className="text-xs text-slate-600">
        新的入群操作直接生效。承接任务仍需本人确认。
      </p>
      {(invitations.error || failure) && (
        <Alert type="error" message={invitations.error || failure} />
      )}
      {!invitations.data && !invitations.error && <p role="status">正在读取群邀请…</p>}
      {invitations.data && !invitations.data.data.length && <p>暂无群邀请</p>}
      {invitations.data?.data.map((invite) => (
        <article key={invite.id} className="space-y-2 rounded border p-3">
          <p className="font-semibold">
            {invite.title} <Tag>{invitationStatus[invite.status]}</Tag>
          </p>
          <p className="text-xs text-slate-500">
            受邀身份 ·{" "}
            {contacts.find((c) => c.contact.id === invite.invitedContactId)?.contact
              .displayName || "资料暂不可读"}
          </p>
          {invite.status === "pending" && (
            <Space>
              {(["accept", "decline"] as const).map((decision) => (
                <Button
                  key={decision}
                  onClick={() => {
                    const { isCurrent } = operation.capture();
                    confirmation.current = Modal.confirm({
                      title:
                        decision === "accept"
                          ? "同意这个身份加入群？"
                          : "拒绝入群邀请？",
                      content:
                        "群内科研材料和任务详情仍按任务权限可见，不分享主人私人历史。",
                      onOk: async () => {
                        if (!isCurrent()) return;
                        try {
                          await researchApi("decideChatInvitation", {
                            params: { id: invite.id },
                            body: { expectedVersion: invite.version, decision },
                          });
                          if (!isCurrent()) return;
                          await researchApi("imSync", { body: {} });
                          if (!isCurrent()) return;
                          await useResearchStore.getState().refresh();
                          if (isCurrent()) await invitations.refresh();
                        } catch (err) {
                          if (!isCurrent()) return;
                          setFailure(err instanceof Error ? err.message : "操作失败");
                          await invitations.refresh();
                        }
                      },
                    });
                  }}
                >
                  {decision === "accept" ? "同意入群" : "拒绝"}
                </Button>
              ))}
            </Space>
          )}
          {invite.status === "accepted" && (
            <Button size="small" onClick={() => setRelatedGroup(invite.conversationId)}>
              查看关联任务
            </Button>
          )}
        </article>
      ))}
      <Modal
        title={
          <span ref={focusDialogTitle} tabIndex={-1}>
            {taskId ? "任务详情与承接" : "群聊关联任务"}
          </span>
        }
        open={dialogOpen}
        onCancel={() => {
          setTaskId("");
          setRelatedGroup(undefined);
        }}
        width={taskId ? 680 : undefined}
        footer={null}
        destroyOnClose
      >
        {taskId ? (
          <>
            {relatedGroup && (
              <Button type="link" onClick={() => setTaskId("")}>
                返回关联任务
              </Button>
            )}
            <ResearchTaskPanel key={taskId} taskId={taskId} />
          </>
        ) : related.error ? (
          <Alert
            type="warning"
            message="关联任务暂不可查看"
            description={related.error}
            action={<Button onClick={related.refresh}>重试</Button>}
          />
        ) : !related.data ? (
          <p role="status">正在读取关联任务…</p>
        ) : !related.data.length ? (
          <p>此群暂无你可查看的关联任务。</p>
        ) : (
          <Space wrap>
            {related.data.map((task) => (
              <Button key={task.id} onClick={() => setTaskId(task.id)}>
                {task.title}
              </Button>
            ))}
          </Space>
        )}
      </Modal>
    </div>
  );
}
