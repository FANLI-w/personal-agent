import {
  CopyOutlined,
  DownloadOutlined,
  ScanOutlined,
  CommentOutlined,
} from "@ant-design/icons";
import { Button, Dropdown, Image, Input, Modal, Space } from "antd";
import type { MenuProps } from "antd";
import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactElement,
} from "react";
import { useConversationStore } from "@/store";
import { feedbackToast } from "@/utils/common";
import { useResearchStore } from "./store";
import {
  useAgentChatOperation,
  type AgentChatOperation,
} from "./useAgentChatOperation";
import {
  chatImagePng,
  readChatImage,
  type ChatImageSource,
} from "./chat-image-actions";

type Props = Omit<ComponentProps<typeof Image>, "preview"> & {
  source: ChatImageSource;
  originalUrl?: string;
  disabled?: boolean;
  onReply?: () => void;
  messageMenu?: MenuProps;
};

export default function ChatImage({
  source,
  originalUrl,
  disabled,
  onReply,
  messageMenu,
  ...imageProps
}: Props) {
  const capture = useAgentChatOperation();
  const operation = useRef<AgentChatOperation>();
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [extracted, setExtracted] = useState<string>();
  const generation = useResearchStore((s) => s.generation);
  const conversationID = useConversationStore(
    (s) => s.currentConversation?.conversationID,
  );
  useEffect(() => {
    busyRef.current = false;
    setBusy(false);
    setPreview(false);
    setExtracted(undefined);
    return () => {
      operation.current?.dispose();
    };
  }, [imageProps.src, generation, conversationID]);

  const act = async (action: string) => {
    if (disabled || busyRef.current) return;
    if (action === "reply") {
      setPreview(false);
      onReply?.();
      return;
    }
    busyRef.current = true;
    setBusy(true);
    const scoped = capture();
    operation.current = scoped;
    const ocrID = crypto.randomUUID();
    const cancel = () => {
      void window.electronAPI?.cancelChatImageOcr(ocrID).catch(() => {});
    };
    if (action === "ocr")
      scoped.signal.addEventListener("abort", cancel, { once: true });
    try {
      const file = await readChatImage(source, scoped.isCurrent);
      if (!scoped.isCurrent()) return;
      if (action === "save") {
        if (window.electronAPI?.saveChatImage) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          if (!scoped.isCurrent()) return;
          const saved = await window.electronAPI.saveChatImage(file.name, bytes);
          if (saved && scoped.isCurrent()) feedbackToast({ msg: "图片已保存" });
        } else {
          const url = URL.createObjectURL(file),
            link = document.createElement("a");
          link.href = url;
          link.download = file.name;
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 30000);
        }
        return;
      }
      const png = await chatImagePng(file);
      const bytes = new Uint8Array(await png.arrayBuffer());
      if (!scoped.isCurrent()) return;
      if (action === "copy") {
        if (window.electronAPI?.copyChatImage)
          await window.electronAPI.copyChatImage(bytes);
        else if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined")
          await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
        else throw new Error("当前环境不支持复制图片，请使用桌面客户端或先另存为。");
        if (scoped.isCurrent()) feedbackToast({ msg: "图片已复制" });
      } else if (action === "ocr") {
        if (!window.electronAPI?.recognizeChatImage)
          throw new Error("提取文字需要 Windows 桌面客户端。");
        const result = await window.electronAPI.recognizeChatImage(ocrID, bytes);
        if (scoped.isCurrent()) {
          setPreview(false);
          setExtracted(result.text || "");
        }
      }
    } catch (error) {
      if (scoped.isCurrent())
        feedbackToast({
          error,
          msg: error instanceof Error ? error.message : "图片操作失败，请重试。",
        });
    } finally {
      scoped.signal.removeEventListener("abort", cancel);
      if (operation.current === scoped) {
        busyRef.current = false;
        if (scoped.isCurrent()) setBusy(false);
      }
      scoped.dispose();
    }
  };
  const sharedItems = (messageMenu?.items || []).filter(
    (item) => item && (!("type" in item) || item.type !== "divider"),
  );
  const items: MenuProps["items"] = [
    {
      key: "copy",
      label: "复制",
      icon: <CopyOutlined />,
      disabled: disabled || busy,
    },
    { type: "divider" },
    ...sharedItems.filter((item) => item?.key !== "delete" && item?.key !== "withdraw"),
    ...(!messageMenu && onReply
      ? [
          {
            key: "reply",
            label: "引用",
            icon: <CommentOutlined />,
            disabled: disabled || busy,
          },
        ]
      : []),
    { type: "divider" },
    {
      key: "save",
      label: "另存为…",
      icon: <DownloadOutlined />,
      disabled: disabled || busy,
    },
    ...(window.electronAPI?.recognizeChatImage
      ? [
          {
            key: "ocr",
            label: "提取文字",
            icon: <ScanOutlined />,
            disabled: disabled || busy,
          },
        ]
      : []),
    ...(messageMenu
      ? [
          { type: "divider" as const },
          ...sharedItems.filter(
            (item) => item?.key === "delete" || item?.key === "withdraw",
          ),
        ]
      : []),
  ];
  // Image previews are React portals. Stop their context event from reaching a message's text menu.
  const menu = (node: ReactElement) => (
    <Dropdown
      trigger={["contextMenu"]}
      overlayStyle={{ zIndex: 1400 }}
      overlayClassName="chat-message-menu"
      menu={{
        items,
        onClick: (info) => {
          if (["copy", "save", "ocr"].includes(info.key) || !messageMenu)
            void act(info.key);
          else {
            setPreview(false);
            messageMenu.onClick?.(info);
          }
        },
      }}
    >
      <span className="contents" onContextMenu={(event) => event.stopPropagation()}>
        {node}
      </span>
    </Dropdown>
  );
  return (
    <>
      {menu(
        <Image
          {...imageProps}
          preview={{
            src: originalUrl || imageProps.src,
            visible: preview,
            onVisibleChange: setPreview,
            imageRender: (node) => menu(node),
            toolbarRender: (node) => (
              <Space>
                {node}
                <Button
                  icon={<CopyOutlined />}
                  disabled={disabled || busy}
                  onClick={() => void act("copy")}
                >
                  复制图片
                </Button>
                <Button
                  icon={<DownloadOutlined />}
                  disabled={disabled || busy}
                  onClick={() => void act("save")}
                >
                  另存为
                </Button>
              </Space>
            ),
          }}
        />,
      )}
      <Modal
        title="提取图片文字"
        open={extracted !== undefined}
        zIndex={1300}
        onCancel={() => setExtracted(undefined)}
        footer={
          <Button
            disabled={!extracted}
            onClick={() => {
              if (extracted)
                if (!navigator.clipboard)
                  feedbackToast({
                    error: new Error("剪贴板不可用"),
                    msg: "复制暂不可用，请选中文字复制",
                  });
                else
                  void navigator.clipboard
                    .writeText(extracted)
                    .then(() => feedbackToast({ msg: "识别文字已复制" }))
                    .catch((error) =>
                      feedbackToast({ error, msg: "复制失败，请选中文字复制" }),
                    );
            }}
          >
            复制识别文字
          </Button>
        }
      >
        {extracted ? (
          <Input.TextArea
            readOnly
            value={extracted}
            autoSize={{ minRows: 6, maxRows: 18 }}
          />
        ) : (
          <p>没有识别到文字，请换一张更清晰的图片。</p>
        )}
      </Modal>
    </>
  );
}
