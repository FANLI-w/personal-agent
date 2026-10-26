import { Alert, Button } from "antd";
import { useSearchParams } from "react-router-dom";
import { Id } from "@research-agent-platform/contracts";
import { SkillLibrary } from "./SkillLibrary";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { useResearchStore } from "./store";
import { canManageDirectoryAgent } from "./contact-directory";

export function DirectorySkillLibrary({ onBack }: { onBack: () => void }) {
  const [params] = useSearchParams();
  const generation = useResearchStore(s => s.generation);
  const memberId = useResearchStore(s => s.actor?.member.id);
  const agentId = params.get("agent") || undefined;
  const validAgent = !!agentId && Id.safeParse(agentId).success;
  const target = useResearchRead(
    signal => researchApi("chatContact", { params: { id: agentId! }, signal }),
    `directory-skill-target:${agentId}`,
    validAgent,
  );
  const contact = target.data?.data;
  const owned = !!contact && canManageDirectoryAgent(contact, memberId);
  if (agentId && !owned)
    return <section className="agent-library-gate">
      <Button onClick={onBack}>返回智能体</Button>
      {target.error || !validAgent || target.data
        ? <Alert type="warning" message={target.error || "只能为自己的站内 Agent 配置技能。"} />
        : <p role="status">正在读取助手配置…</p>}
      {target.error && <Button onClick={target.refresh}>重试读取</Button>}
    </section>;
  return <SkillLibrary
    key={`${generation}:${agentId}:${params.get("skill")}:${params.get("catalog")}`}
    catalogId={params.get("catalog") || undefined}
    initialSkillId={params.get("skill") || undefined}
    targetAgent={owned ? contact : undefined}
    onBack={onBack}
  />;
}
