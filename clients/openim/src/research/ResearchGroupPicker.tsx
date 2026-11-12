import { Alert, Button, Input, Spin } from "antd";
import { useState } from "react";
import CheckItem, {
  type CheckListItem,
} from "@/pages/common/ChooseModal/ChooseBox/CheckItem";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { useResearchStore } from "./store";

import {
  groupIdentityLabel,
  readGroupCandidates,
  selectableGroupContacts,
} from "./group-members";

export function ResearchGroupPicker({
  groupID,
  checkClick,
  isChecked,
}: {
  groupID?: string;
  checkClick: (item: CheckListItem) => void;
  isChecked: (item: CheckListItem) => boolean;
}) {
  const [search, setSearch] = useState("");
  const actorId = useResearchStore((s) => s.actor?.member.id);
  const mapping = useResearchStore((s) =>
    s.mappings.find((m) => m.groupID === groupID),
  );
  const read = useResearchRead(async (signal) => {
    const [contacts, group] = await Promise.all([
      readGroupCandidates(
        (view, cursor) =>
          researchApi("chatContacts", {
            query: { view, scope: "local", limit: 100, cursor },
            signal,
          }),
        signal,
      ),
      groupID
        ? mapping
          ? researchApi("chatConversation", {
              params: { id: mapping.researchConversationId },
              signal,
            })
          : Promise.reject(new Error("当前群权限未同步，请重新打开群聊。"))
        : undefined,
    ]);
    if (group && !group.data.allowedActions.includes("invite"))
      throw new Error("当前账号没有邀请权限，请刷新群聊后重试。");
    return { contacts, group: group?.data };
  }, `group-picker:${groupID || "new"}:${mapping?.researchConversationId || ""}`);
  const contacts = read.data?.contacts || [];
  const candidates = selectableGroupContacts(contacts, actorId).filter(
    (c) =>
      `${c.displayName} ${c.username || ""} ${groupIdentityLabel(c, contacts, actorId)}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="research-group-picker">
      <div className="space-y-3 px-3 pb-3">
        <Input
          aria-label="搜索群成员"
          placeholder="搜索联系人"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
        />
      </div>
      {read.error && (
        <Alert
          type="error"
          message={read.error}
          action={<Button onClick={() => void read.refresh()}>重试</Button>}
        />
      )}
      {read.loading && !read.data && <Spin />}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {candidates.map((contact) => {
          const member = read.data?.group?.members.find(
            (m) => m.contactId === contact.id,
          );
          // Only an existing member is disabled; a legacy pending invite can be
          // selected again and becomes a joined member immediately.
          const disabled = member?.status === "joined";
          const item: CheckListItem = {
            contactId: contact.id,
            nickname: contact.displayName,
            identityDescription: groupIdentityLabel(contact, contacts, actorId),
            disabled,
            selectionStatus:
              member?.status === "joined" ? "已加入" : undefined,
          };
          return (
            <CheckItem
              key={contact.id}
              data={item}
              showCheck
              isChecked={isChecked(item)}
              itemClick={checkClick}
            />
          );
        })}
        {read.data && !candidates.length && (
          <p className="p-4 text-sm text-[var(--sub-text)]">
            {search
              ? "没有匹配的结果"
              : "暂无可邀请的联系人，请先在通讯录添加联系人。"}
          </p>
        )}
      </div>
      <p className="px-3 py-2 text-xs text-[var(--sub-text)]">
        选中的联系人直接入群。后台 0.46 起，每群固定一个群助理，不再邀请个人智能体。
      </p>
    </div>
  );
}
