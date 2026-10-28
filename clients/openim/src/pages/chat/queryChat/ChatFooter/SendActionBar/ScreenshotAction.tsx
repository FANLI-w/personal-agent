import { DownOutlined, ScissorOutlined } from "@ant-design/icons";
import { Alert, Button, Dropdown, Modal, Select, Spin } from "antd";
import { useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { useConversationStore } from "@/store";
import { useResearchStore } from "@/research/store";
import {
  useAgentChatOperation,
  type AgentChatOperation,
} from "@/research/useAgentChatOperation";
import type { ChatScreenCapture } from "@/types/chatScreenshot";
import { imagePasteLimits } from "@/types/imageClipboard";

type Point = { x: number; y: number };
type Rect = Point & { width: number; height: number };
export default function ScreenshotAction({
  stageImages,
  pasteImages,
}: {
  stageImages?: (files: File[]) => void;
  pasteImages?: () => void;
}) {
  const captureOperation = useAgentChatOperation();
  const operation = useRef<AgentChatOperation>();
  const image = useRef<HTMLImageElement>(null);
  const anchor = useRef<Point>();
  const conversation = useConversationStore(
    (s) => s.currentConversation?.conversationID,
  );
  const generation = useResearchStore((s) => s.generation);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [screens, setScreens] = useState<ChatScreenCapture[]>([]);
  const [screenId, setScreenId] = useState("");
  const [selection, setSelection] = useState<Rect>();
  const [error, setError] = useState("");
  const selected = screens.find((s) => s.id === screenId);
  const close = () => {
    operation.current?.dispose();
    operation.current = undefined;
    anchor.current = undefined;
    setOpen(false);
    setBusy(false);
    setScreens([]);
    setSelection(undefined);
    setError("");
  };
  useLayoutEffect(() => {
    close();
    return () => operation.current?.dispose();
  }, [conversation, generation]);
  const start = async () => {
    if (!window.electronAPI?.captureChatScreens || !stageImages || operation.current)
      return;
    const current = captureOperation();
    operation.current = current;
    setBusy(true);
    setError("");
    try {
      const result = await window.electronAPI.captureChatScreens();
      if (!current.isCurrent()) return;
      if (!result.length) throw new Error("没有可用的屏幕截图。");
      setScreens(result);
      setScreenId(result[0].id);
      setSelection(undefined);
      setOpen(true);
    } catch (cause) {
      if (current.isCurrent()) {
        setOpen(true);
        setError(cause instanceof Error ? cause.message : "截图失败，请重试。");
      }
    } finally {
      if (operation.current === current) {
        setBusy(false);
        if (!current.isCurrent()) close();
      }
    }
  };
  const point = (event: PointerEvent<HTMLDivElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  };
  const update = (event: PointerEvent<HTMLDivElement>) => {
    if (!anchor.current) return;
    const end = point(event),
      start = anchor.current;
    setSelection({
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(start.x - end.x),
      height: Math.abs(start.y - end.y),
    });
  };
  const stage = async () => {
    const current = operation.current,
      source = image.current;
    if (!current?.isCurrent() || !source?.naturalWidth || !stageImages) return;
    setBusy(true);
    setError("");
    try {
      const region = selection || { x: 0, y: 0, width: 1, height: 1 };
      const width = Math.round(region.width * source.naturalWidth),
        height = Math.round(region.height * source.naturalHeight);
      if (width < 4 || height < 4)
        throw new Error("选区太小，请重新框选，或选择整张截图。");
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("无法处理截图。");
      context.drawImage(
        source,
        Math.round(region.x * source.naturalWidth),
        Math.round(region.y * source.naturalHeight),
        width,
        height,
        0,
        0,
        width,
        height,
      );
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob || blob.size > imagePasteLimits.bytes)
        throw new Error("截图超过 10 MB，请选择更小的范围。");
      if (!current.isCurrent()) return;
      stageImages([new File([blob], `截图-${Date.now()}.png`, { type: "image/png" })]);
      close();
    } catch (cause) {
      if (current.isCurrent())
        setError(cause instanceof Error ? cause.message : "处理截图失败。");
    } finally {
      if (operation.current === current) setBusy(false);
    }
  };
  return (
    <>
      <div className="chat-screenshot-tools">
        <button
          type="button"
          className="chat-tool-button"
          aria-label="截图"
          title={
            window.electronAPI?.captureChatScreens
              ? "截图：选择范围后添加到输入框"
              : "截图需要更新后的桌面客户端"
          }
          disabled={busy || !window.electronAPI?.captureChatScreens || !stageImages}
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
      <Modal
        title="截图"
        open={open}
        onCancel={close}
        width={900}
        destroyOnClose
        footer={
          <>
            <Button onClick={close}>取消</Button>
            <Button
              type="primary"
              disabled={!selected || busy}
              onClick={() => void stage()}
            >
              添加到输入框
            </Button>
          </>
        }
      >
        {error && <Alert type="error" showIcon message={error} className="mb-3" />}
        {selected && (
          <>
            <div className="chat-screenshot-options">
              <Select
                aria-label="选择截图屏幕"
                value={screenId}
                options={screens.map((s) => ({ value: s.id, label: s.name }))}
                onChange={(id) => {
                  setScreenId(id);
                  setSelection(undefined);
                  anchor.current = undefined;
                }}
              />
              <Button onClick={() => setSelection(undefined)}>选择整张截图</Button>
              <span>拖动框选范围；确认后仍需点击发送。</span>
            </div>
            <Spin spinning={busy}>
              <div
                className="chat-screenshot-preview"
                onPointerDown={(event) => {
                  if (event.button !== 0 || busy) return;
                  anchor.current = point(event);
                  setSelection(undefined);
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={update}
                onPointerUp={(event) => {
                  update(event);
                  anchor.current = undefined;
                }}
                onPointerCancel={() => {
                  anchor.current = undefined;
                  setSelection(undefined);
                }}
              >
                <img
                  key={screenId}
                  ref={image}
                  src={selected.dataUrl}
                  alt="屏幕截图预览，可拖动选择范围"
                  draggable={false}
                />
                {selection && (
                  <div
                    className="chat-screenshot-selection"
                    style={{
                      left: `${selection.x * 100}%`,
                      top: `${selection.y * 100}%`,
                      width: `${selection.width * 100}%`,
                      height: `${selection.height * 100}%`,
                    }}
                  />
                )}
              </div>
            </Spin>
          </>
        )}
      </Modal>
    </>
  );
}
