import type { GroupMentionContact } from "./group-mentions";

export function MentionList({
  contacts,
  onSelect,
}: {
  contacts: GroupMentionContact[];
  onSelect: (name: string) => void;
}) {
  return (
    <div
      className="max-h-52 w-44 overflow-y-auto py-0.5"
      role="group"
      aria-label="选择要提及的成员"
    >
      {contacts.map((contact) => (
        <button
          key={contact.id}
          type="button"
          className="flex w-full items-center justify-between rounded px-2.5 py-1 text-left text-sm text-slate-700 hover:bg-slate-100"
          onClick={() => onSelect(contact.displayName)}
        >
          <span className="truncate">{contact.displayName}</span>
          {contact.agent && (
            <span className="ml-1.5 shrink-0 text-xs text-blue-400">Agent</span>
          )}
        </button>
      ))}
    </div>
  );
}
