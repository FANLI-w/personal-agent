import { Button } from "antd";
import { DownloadOutlined, FileOutlined } from "@ant-design/icons";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { researchApi } from "./api";
import { readResearchFileBytes } from "./research-library-api";
import { saveTaskArtifact } from "./task-artifact-download";
import { usePersonalOperation } from "./usePersonalOperation";
import type { TaskTarget } from "../../../../integrations/deepseek-harness/desktop/task-workspace";
import { workbenchTaskPath } from "./workbench-links";
export function TaskDeliveryDownload({
  target,
  locator,
  label,
}: {
  target: TaskTarget;
  locator: string;
  label: string;
}) {
  const match =
    /^research-library:([A-Za-z0-9_-]+):v([1-9][0-9]*):([a-f0-9]{64})$/.exec(locator);
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  const operation = usePersonalOperation(true, locator);
  const location = useLocation(),
    navigate = useNavigate();
  const native = window.electronAPI?.localDsh?.taskDownloadDelivery;
  const nativeAllowed =
    ["/workbench", "/dsh"].includes(location.pathname) &&
    new URLSearchParams(location.search).get("task") === target.taskId;
  if (!match)
    return (
      <p className="text-xs">
        {label}：{locator}
      </p>
    );
  const download = async () => {
    if (busy) return;
    const { isCurrent } = operation.capture();
    setBusy(true);
    setFailure("");
    try {
      if (native) {
        if (!nativeAllowed) {
          navigate(workbenchTaskPath(target.taskId, target.kind));
          return;
        }
        await window.electronAPI.localDsh.taskDownloadDelivery(target, locator);
        return;
      }
      const result = await researchApi("researchFile", { params: { id: match[1] } });
      const version = result.data.versions.find(
        (item) => item.version === Number(match[2]) && item.sha256 === match[3],
      );
      if (!version) throw Error("这份交付版本暂不可读取，请联系提交人。");
      if (version.byteLength > 10 * 1048576)
        throw Error("请在桌面客户端中下载这份大文件。");
      const bytes = await readResearchFileBytes(match[1], version);
      if (isCurrent()) saveTaskArtifact(bytes, version.filename);
    } catch (error) {
      if (isCurrent())
        setFailure(error instanceof Error ? error.message : "下载未完成，请重试。");
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };
  return (
    <div className="task-delivery-file">
      <FileOutlined />
      <strong>{label}</strong>
      <Button
        icon={<DownloadOutlined />}
        loading={busy}
        onClick={() => void download()}
      >
        {native && !nativeAllowed ? "打开任务下载" : "下载文件"}
      </Button>
      {failure && <p role="alert">{failure}</p>}
    </div>
  );
}
