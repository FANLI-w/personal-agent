import { Alert, Button, Modal, Spin } from "antd";
import { useEffect, useState } from "react";
import { useGroupChatRoster } from "./GroupChatRoster";
import { canonicalGroupMembers, groupIdentityLabel } from "./group-members";
import { useResearchStore } from "./store";
import { useConversationStore } from "@/store";
import { useAgentChatOperation } from "./useAgentChatOperation";
import { researchApi } from "./api";
import ResearchAvatar from "./ResearchAvatar";
import { emit } from "@/utils/events";

/** Business membership is authoritative, even with older IM service accounts. */
export function ResearchGroupMembers({
  manage = false,
  onInvite,
}: {
  manage?: boolean;
  onInvite?: () => void;
}) {
  const roster = useGroupChatRoster();
  const actor = useResearchStore((s) => s.actor?.member.id);
  const generation = useResearchStore((s) => s.generation);
  const identities = useResearchStore((s) => s.contacts);
  const groupID = useConversationStore((s) => s.currentConversation?.groupID);
  const capture = useAgentChatOperation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const group = roster.conversation;
  useEffect(() => {
    setBusy(false);
    setError("");
  }, [groupID, actor, generation]);
  if (!group)
    return (
      <div role="status">
        {roster.loading ? <Spin size="small" /> : null}
        <p>{roster.error || "正在读取群成员…"}</p>
        {roster.error && <Button onClick={() => void roster.refresh?.()}>重试</Button>}
      </div>
    );
  const contacts = roster.memberContacts || [];
  const members = canonicalGroupMembers(group, contacts);
  const joined = members.filter((m) => m.status === "joined");
  const invited = members.filter((m) => m.status === "invited");
  const owner = joined.find((m) => m.isOwner);
  const openProfile = (contactId: string) => {
    const mapping = identities.find((i) => i.contact.id === contactId);
    if (mapping) emit("OPEN_USER_CARD", { userID: mapping.userID, groupID });
  };
  const renderMember = (member: (typeof members)[number]) => (
    <div
      key={member.contactId}
      className="flex items-center gap-2 py-2"
      data-member-status={member.status}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        disabled={!identities.some((i) => i.contact.id === member.contactId)}
        onClick={() => openProfile(member.contactId)}
      >
        <ResearchAvatar
          contact={member.contact}
          text={member.contact?.displayName || "成员"}
          size={36}
        />
        <span className="min-w-0">
          <span className="block truncate">
            {member.contact?.displayName || "成员资料暂不可见"}
            {member.isOwner ? " · 群主" : ""}
          </span>
          <span className="block text-xs text-[var(--sub-text)]">
            {member.contact
              ? groupIdentityLabel(member.contact, contacts, actor)
              : "身份待核对"}
          </span>
        </span>
      </button>
      {member.status === "invited" && (
        <span className="shrink-0 text-xs text-[var(--sub-text)]">待接受</span>
      )}
      {manage && group.allowedActions.includes("manage") && member.role !== "owner" && (
        <Button
          size="small"
          danger
          disabled={busy}
          onClick={() => {
            const operation = capture();
            Modal.confirm({
              title: member.status === "invited" ? "取消这份邀请？" : "移除这位成员？",
              content: "群聊访问权限会取消；既有任务承接独立处理。",
              onCancel: () => operation.dispose(),
              onOk: async () => {
                if (!operation.isCurrent()) {
                  operation.dispose();
                  throw new Error("会话或账号已切换，请重新打开群管理。");
                }
                setBusy(true);
                setError("");
                try {
                  await researchApi("revokeChatMember", {
                    params: { id: group.id, contactId: member.contactId },
                    body: {
                      expectedVersion: member.version,
                      expectedConversationVersion: group.version,
                      reason: "群主在成员管理中明确取消群访问权",
                    },
                    signal: operation.signal,
                  });
                  if (!operation.isCurrent()) return;
                  const synced = await researchApi("imSyncConversation", {
                    params: { id: group.id },
                    body: {},
                    signal: operation.signal,
                  });
                  if (!operation.isCurrent()) return;
                  if (synced.data.transportStatus !== "ready")
                    setError("成员权限已取消，聊天名单同步暂未完成，请稍后刷新。");
                  await roster.refresh?.();
                } catch (cause) {
                  if (operation.isCurrent())
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "操作失败，请刷新后重试。",
                    );
                } finally {
                  if (operation.isCurrent()) setBusy(false);
                  operation.dispose();
                }
              },
            });
          }}
        >
          {member.status === "invited" ? "取消邀请" : "移除"}
        </Button>
      )}
    </div>
  );
  return (
    <section data-testid="canonical-group-members">
      <p className="mb-2 text-sm">
        群主：{owner?.contact?.displayName || "成员资料暂不可见"}
      </p>
      {(["human", "agent"] as const).map((kind) => {
        const list = joined.filter((m) =>
          kind === "human"
            ? m.contact?.identity.kind === "human"
            : !!m.contact && m.contact.identity.kind !== "human",
        );
        return list.length ? (
          <div key={kind}>
            <h3 className="mt-3 text-xs text-[var(--sub-text)]">
              {kind === "human" ? "联系人" : "智能体"} · {list.length}
            </h3>
            {list.map(renderMember)}
          </div>
        ) : null;
      })}
      {joined.filter((m) => !m.contact).map(renderMember)}
      <p className="my-2 text-xs text-[var(--sub-text)]">
        {joined.length} 位已加入成员
        {invited.length ? ` · ${invited.length} 位待接受` : ""}
      </p>
      {!!invited.length && (
        <div className="mt-3 border-t border-[var(--gap-text)] pt-3">
          <h3 className="text-sm">待接受的邀请</h3>
          {invited.map(renderMember)}
          <p className="text-xs text-[var(--sub-text)]">
            对方可在“通讯录 → 群邀请”接受；智能体的邀请由所属成员确认。接受前尚未入群。
          </p>
        </div>
      )}
      {error && <Alert type="error" message={error} />}
      {group.allowedActions.includes("invite") && (
        <Button
          className="mt-3"
          block
          disabled={busy}
          onClick={() => {
            onInvite?.();
            emit("OPEN_CHOOSE_MODAL", { type: "INVITE_TO_GROUP", extraData: groupID });
          }}
        >
          邀请成员
        </Button>
      )}
    </section>
  );
}
