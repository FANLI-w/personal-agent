import { Button } from "antd";
import { DownloadOutlined, FileOutlined, FileWordOutlined, FileExcelOutlined, FilePdfOutlined, FilePptOutlined } from "@ant-design/icons";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { researchApi } from "./api";
import { readResearchFileBytes } from "./research-library-api";
import { saveTaskArtifact } from "./task-artifact-download";
import { usePersonalOperation } from "./usePersonalOperation";
import type { TaskTarget } from "../../../../integrations/deepseek-harness/desktop/task-workspace";
import { useResearchRead } from "./useResearchRead";
import { workbenchTaskPath } from "./workbench-links";
export function TaskDeliveryDownload({
  target,
  locator,
  label,
  appearance = "file",
}: {
  target: TaskTarget;
  locator: string;
  label: string;
  appearance?: "file" | "link" | "attachment";
}) {
  const match =
    /^research-library:([A-Za-z0-9_-]+):v([1-9][0-9]*):([a-f0-9]{64})$/.exec(locator);
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  const operation = usePersonalOperation(true, locator);
  const location = useLocation(),
    navigate = useNavigate();
  const native = window.electronAPI?.localDsh?.taskDownloadDelivery;
  const params = new URLSearchParams(location.search);
  const nativeAllowed =
    ["/workbench", "/dsh"].includes(location.pathname) &&
    params.get("task") === target.taskId &&
    (params.get("taskKind") || "personal") === target.kind;
  const metadata = useResearchRead(
    (signal) => researchApi("researchFile", { params: { id: match![1] }, signal }),
    `review-file:${locator}`,
    Boolean(match && appearance === "attachment"),
    { poll: false },
  );
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
        await native(target, locator);
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
  if (appearance === "attachment") {
    const version = metadata.data?.data.versions.find(
      (version) => version.version === Number(match[2]) && version.sha256 === match[3],
    );
    const size = version?.byteLength;
    const Icon = /\.docx?$/i.test(label) ? FileWordOutlined : /\.xlsx?$/i.test(label) ? FileExcelOutlined :
      /\.pptx?$/i.test(label) ? FilePptOutlined : /\.pdf$/i.test(label) ? FilePdfOutlined : FileOutlined;
    return (
      <div className="blue-task-attachment">
        <span className="blue-task-attachment-icon"><Icon aria-hidden /></span>
        <span className="blue-task-attachment-copy">
          <strong>{label}</strong>
          {size !== undefined && <small>{size < 1024 ? `${size} B` : size < 1048576 ?
            `${Math.round(size / 1024)} KB` : `${(size / 1048576).toFixed(1)} MB`}</small>}
        </span>
        <Button type="text" icon={<DownloadOutlined />} aria-label={`下载 ${label}`}
          loading={busy} onClick={() => void download()} />
        {failure && <p className="task-review-error" role="alert">{failure}</p>}
      </div>
    );
  }
  if (appearance === "link")
    return (
      <>
        <Button
          type="link"
          className="task-review-download"
          title={native && !nativeAllowed ? "打开任务下载" : "下载交付文件"}
          loading={busy}
          onClick={() => void download()}
        >
          {label}
        </Button>
        {failure && <p className="task-review-error" role="alert">{failure}</p>}
      </>
    );
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
