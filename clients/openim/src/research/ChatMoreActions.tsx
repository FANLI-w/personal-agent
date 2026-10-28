import type { ReactNode } from "react";
import { MoreOutlined } from "@ant-design/icons";
import { Popover } from "antd";
import { useConversationStore } from "@/store";
import DesktopWorkCard from "./DesktopWorkCard";
import { PeerLibraryChatLink } from "./PeerLibraryPanel";
import { useResearchStore } from "./store";

export default function ChatMoreActions({
  collaboration,
  inline = false,
}: {
  collaboration: ReactNode;
  inline?: boolean;
}) {
  const conversation = useConversationStore((s) => s.currentConversation);
  const actor = useResearchStore((s) => s.actor?.member.id);
  const generation = useResearchStore((s) => s.generation);
  const mapping = useResearchStore((s) =>
    s.mappings.find((m) => m.imConversationID === conversation?.conversationID),
  );
  const contact = useResearchStore(
    (s) => s.contacts.find((c) => c.userID === conversation?.userID)?.contact,
  );
  const localAgent =
    contact?.identity.kind === "personal_agent" &&
    !contact.agentRuntime &&
    contact.allowedActions.includes("chat");
  const reports =
    localAgent &&
    actor &&
    mapping &&
    mapping.kind !== "group" &&
    typeof window.electronAPI?.listDesktopReports === "function";
  const spaceKind = useResearchStore((s) => s.actor?.spaceKind);
  const peerFiles =
    localAgent &&
    contact.profile.role === "coordinator" &&
    spaceKind === "laboratory" &&
    window.electronAPI?.peerLibrary;
  if (!reports && !peerFiles && !collaboration) return null;
  const content = (
    <div className="chat-more-actions">
      {reports && actor && mapping && (
        <DesktopWorkCard
          key={`${generation}:${mapping.researchConversationId}`}
          scope={{ actorId: actor, conversationId: mapping.researchConversationId }}
          variant="menu"
        />
      )}
      {peerFiles && <PeerLibraryChatLink />}
      {collaboration}
    </div>
  );
  if (inline) return content;
  return (
    <Popover trigger="click" placement="topRight" arrow={false} content={content}>
      <button
        type="button"
        className="flex h-8 w-8 items-center justify-center rounded text-lg text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
        aria-label="聊天更多操作"
        title="更多"
      >
        <MoreOutlined />
      </button>
    </Popover>
  );
}
