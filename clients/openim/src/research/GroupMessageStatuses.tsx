import { Button } from "antd";
import { useContext, useEffect } from "react";
import { supportsTranscriptSync } from "./api";
import { useResearchRead } from "./useResearchRead";
import { useResearchStore } from "./store";
import { AgentProgressHistory, registerAgentProgress } from "./agent-progress";
import { groupAgentStatusText } from "./group-agent-status";
import { ResearchTurnStatus } from "./ResearchTurnStatus";
import type { GroupAgentStatus } from "@research-agent-platform/contracts";
import { useGroupChatRoster, groupContactDescription } from "./GroupChatRoster";
import { readGroupStatuses, readChatTurn, activeChatTurn } from './chat-message-read';
import { useChatRecordChanges } from './useChatRecordChanges';

export function GroupMessageStatuses({ conversationId, messageId, imID, own, inputText }: {
  conversationId:string; messageId:string; imID:string; own:boolean; inputText:string;
}) {
  const generation = useResearchStore(s => s.generation);
  const history = useContext(AgentProgressHistory);
  const actorId = useResearchStore(s => s.actor?.member.id);
  const roster = useGroupChatRoster();
  const read = useResearchRead(
    () => readGroupStatuses(conversationId, messageId),
    `${imID}:group-status:${conversationId}:${messageId}`,
    true,
    { poll: value => !supportsTranscriptSync() && (!value || value.data.requests.some(r => ['queued','running','waiting_input'].includes(r.status))), keepDataOnError: true },
  );
  useChatRecordChanges(conversationId, 'group-status', messageId, read.refresh, read.invalidate);
  useEffect(() => {
    // Only the requester restores private progress. Other members use this
    // status receipt and canonical group replies, never the private turn API.
    if (!own) return;
    for (const request of read.data?.data.requests || []) {
      if (["queued","running"].includes(request.status) ||
        (history.latestOwnId === messageId && request.outputMessageId && !history.messageIds.has(request.outputMessageId)))
        registerAgentProgress(generation,imID,{id:request.id,conversationId,agentContactId:request.agentContactId}, {displayName:request.displayName,inputText});
    }
  }, [own,read.data,generation,imID,conversationId,messageId,history,inputText]);
  if (read.error) return <div className="mt-2 text-slate-600">
    群内回复状态暂未读到。<Button size="small" loading={read.loading} onClick={() => void read.refresh()}>重新读取</Button>
  </div>;
  return <div aria-live="polite" className="chat-group-receipts">
    {read.data?.data.requests.map(request => {
      const contact = roster.data?.data.find(c => c.id === request.agentContactId);
      return (
      <div className="chat-group-receipt" key={request.id} data-agent-status={request.agentContactId}>
        <div><strong>{request.displayName}</strong>{contact && <small>{groupContactDescription(contact, roster.data?.data || [], actorId)}</small>}<span>{groupAgentStatusText(request)}</span></div>
        {own && request.status !== "succeeded" && <OwnAgentControls request={request} conversationId={conversationId} imID={imID} refresh={read.refresh} />}
      </div>);
    })}
  </div>;
}

function OwnAgentControls({ request, conversationId, imID, refresh }: { request: GroupAgentStatus; conversationId: string; imID: string; refresh: () => Promise<void> }) {
  const generation = useResearchStore(s => s.generation);
  const detail = useResearchRead(() => readChatTurn(conversationId, request.id), `${imID}:own-group-turn:${request.id}`, true, {poll: value => !supportsTranscriptSync() && activeChatTurn(value), keepDataOnError: true});
  useChatRecordChanges(conversationId, 'turn', request.id, detail.refresh, detail.invalidate);
  if (detail.error) return <button type="button" className="chat-agent-detail-button" onClick={() => void detail.refresh()}>重新读取操作状态</button>;
  if (!detail.data || detail.data.data.conversationId !== conversationId || detail.data.data.agentContactId !== request.agentContactId) return null;
  return <ResearchTurnStatus turn={detail.data.data} compact hideLabel onRetried={next => {
    registerAgentProgress(generation, imID, next, { displayName: request.displayName });
    void refresh();
  }} />;
}
