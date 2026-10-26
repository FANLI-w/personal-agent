import { Button } from "antd";
import { useContext, useEffect } from "react";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { useResearchStore } from "./store";
import { AgentProgressHistory, registerAgentProgress } from "./agent-progress";
import { groupAgentStatusText } from "./group-agent-status";

export function GroupMessageStatuses({ conversationId, messageId, imID, own, detailedTurnId }: {
  conversationId:string; messageId:string; imID:string; own:boolean; detailedTurnId?:string;
}) {
  const generation = useResearchStore(s => s.generation);
  const history = useContext(AgentProgressHistory);
  const read = useResearchRead(
    signal => researchApi("chatMessageAgentStatuses", { params:{id:conversationId,messageId},signal }),
    `${imID}:group-status:${conversationId}:${messageId}`,
  );
  useEffect(() => {
    // Only the requester restores private progress. Other members use this
    // status receipt and canonical group replies, never the private turn API.
    if (!own) return;
    for (const request of read.data?.data.requests || []) {
      if (["queued","running"].includes(request.status) ||
        (history.latestOwnId === messageId && request.outputMessageId && !history.messageIds.has(request.outputMessageId)))
        registerAgentProgress(generation,imID,{id:request.id,conversationId});
    }
  }, [own,read.data,generation,imID,conversationId,messageId,history]);
  if (read.error) return <div className="mt-2 text-slate-600">
    群内回复状态暂未读到。<Button size="small" loading={read.loading} onClick={() => void read.refresh()}>重新读取</Button>
  </div>;
  return <div aria-live="polite" className="mt-2 text-slate-600">
    {read.data?.data.requests.filter(request => request.id !== detailedTurnId).map(request =>
      <p key={request.id}>{request.displayName} · {groupAgentStatusText(request)}</p>,
    )}
  </div>;
}
