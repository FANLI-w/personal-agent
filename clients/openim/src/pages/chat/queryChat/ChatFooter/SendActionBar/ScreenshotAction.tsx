import { DownOutlined, ScissorOutlined } from "@ant-design/icons";
import { Dropdown } from "antd";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useConversationStore } from "@/store";
import { useResearchStore } from "@/research/store";
import {
  useAgentChatOperation,
  type AgentChatOperation,
} from "@/research/useAgentChatOperation";
import { feedbackToast } from "@/utils/common";
export default function ScreenshotAction({
  stageImages,
  pasteImages,
}: {
  stageImages?: (files: File[]) => void;
  pasteImages?: () => void;
}) {
  const capture = useAgentChatOperation(),
    operation = useRef<AgentChatOperation>();
  const [busy, setBusy] = useState(false);
  const conversation = useConversationStore(
    (s) => s.currentConversation?.conversationID,
  );
  const generation = useResearchStore((s) => s.generation);
  useLayoutEffect(() => {
    setBusy(false);
    return () => {
      if (operation.current) {
        operation.current.dispose();
        operation.current = undefined;
        void window.electronAPI?.cancelChatScreenshot?.().catch(() => {});
      }
    };
  }, [conversation, generation]);
  const start = async () => {
    if (!window.electronAPI?.editChatScreenshot || !stageImages || operation.current)
      return;
    const current = capture();
    operation.current = current;
    setBusy(true);
    try {
      const data = await window.electronAPI.editChatScreenshot();
      if (!data || !current.isCurrent()) return;
      const binary = atob(data.slice(data.indexOf(",") + 1)),
        bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      stageImages([new File([bytes], `截图-${Date.now()}.png`, { type: "image/png" })]);
    } catch (error) {
      if (current.isCurrent()) feedbackToast({ error, msg: "截图未完成，请重试。" });
    } finally {
      current.dispose();
      if (operation.current === current) {
        operation.current = undefined;
        setBusy(false);
      }
    }
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.key === "F2" &&
        !event.repeat &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        !event.shiftKey &&
        document.hasFocus()
      ) {
        event.preventDefault();
        void start();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  return (
    <div className="chat-screenshot-tools">
      <button
        type="button"
        className="chat-tool-button"
        aria-label="截图"
        title="截图（F2）：框选、标注，完成后复制并放入输入框"
        disabled={busy || !window.electronAPI?.editChatScreenshot || !stageImages}
        onClick={() => void start()}
      >
        <ScissorOutlined />
      </button>
      <Dropdown
        trigger={["click"]}
        placement="topLeft"
        menu={{
          items: [
            {
              key: "paste",
              label: "粘贴截图或图片（Ctrl+V）",
              disabled: !pasteImages,
              onClick: pasteImages,
            },
          ],
        }}
      >
        <button
          type="button"
          className="chat-tool-button chat-tool-dropdown"
          aria-label="截图选项"
          title="截图选项"
        >
          <DownOutlined />
        </button>
      </Dropdown>
    </div>
  );
}
