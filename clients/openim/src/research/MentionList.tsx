import type { GroupMentionContact } from "./group-mentions";
import { useState } from "react";

export function MentionList({
  contacts,
  onSelect,
}: {
  contacts: GroupMentionContact[];
  onSelect: (contact: GroupMentionContact) => void;
}) {
  const [query, setQuery] = useState("");
  const visible = contacts.filter(contact => `${contact.displayName} ${contact.ownerLabel || ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return (
    <div
      className="chat-mention-picker"
      role="group"
      aria-label="选择要提及的成员"
    >
      <input autoFocus aria-label="搜索群成员或助手" placeholder="搜索成员或助手" value={query} onChange={event => setQuery(event.target.value)} />
      <div className="chat-mention-options">
      {visible.map((contact) => (
        <button
          key={contact.id}
          type="button"
          className="chat-mention-option"
          disabled={contact.external || contact.unavailable}
          onClick={() => onSelect(contact)}
        >
          <span className="chat-mention-avatar" aria-hidden="true">{contact.agent ? "AI" : contact.displayName.slice(0, 1)}</span>
          <span><strong>{contact.displayName}</strong><small>{contact.external ? "请在私聊中使用" : contact.unavailable ? "暂不可用" : contact.ownerLabel || "群成员"}</small></span>
        </button>
      ))}
      {!visible.length && <p className="chat-mention-empty">没有匹配的群成员</p>}
      </div>
    </div>
  );
}
