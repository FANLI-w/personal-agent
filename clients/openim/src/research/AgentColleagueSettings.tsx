import { Alert, Button } from "antd";
import { SettingOutlined } from "@ant-design/icons";
import { useRef, useState } from "react";
import type { Contact } from "@research-agent-platform/contracts";
import type { OverlayVisibleHandle } from "@/hooks/useOverlayVisible";
import { ResearchUserCard } from "./ResearchUserCard";
import { useAgentChatOperation } from "./useAgentChatOperation";

// All local colleagues open the same authoritative profile/private-memory editor.
export function AgentColleagueSettings({ contactId, prepare, onChanged, disabled = false }: {
  contactId?: string;
  prepare?: (isCurrent: () => boolean) => Promise<Contact | undefined>;
  onChanged?: () => void;
  disabled?: boolean;
}) {
  const card = useRef<OverlayVisibleHandle>(null);
  const capture = useAgentChatOperation();
  const [selected, setSelected] = useState(contactId);
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState("");
  return <>
    <Button type="text" icon={<SettingOutlined />} loading={busy} disabled={disabled || busy} aria-label="查看助手资料" title="介绍、能力、性格与设置" onClick={() => {
      const operation = capture();
      setBusy(true); setFailure("");
      void (async () => {
        try {
          const id = contactId || (await prepare?.(operation.isCurrent))?.id;
          if (!operation.isCurrent()) return;
          if (!id) throw new Error("暂时未能读取这位助手，请稍后重试。");
          setSelected(id); card.current?.openOverlay();
        } catch (error) {
          if (operation.isCurrent()) setFailure(error instanceof Error ? error.message : "助手设置暂未打开。");
        } finally {
          if (operation.isCurrent()) setBusy(false);
          operation.dispose();
        }
      })();
    }}>助手资料</Button>
    {failure && <Alert type="warning" message={failure} closable onClose={() => setFailure("")} />}
    <ResearchUserCard contactId={selected} ref={card} onClose={onChanged} />
  </>;
}
