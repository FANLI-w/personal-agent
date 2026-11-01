import "./local-library.scss";

import { Alert, Button, Checkbox, Input, Modal, Spin } from "antd";
import { useEffect, useState } from "react";

import type { LocalLibraryFile } from "@/types/localLibrary";

/**
 * Picks files from the registered local folder. Only relative paths leave this
 * dialog, so a template stays portable between machines with the same layout.
 */
export function LocalLibraryPicker({
  open,
  selected = [],
  confirmLabel = "用这些文件",
  onClose,
  onPick,
}: {
  open: boolean;
  selected?: string[];
  confirmLabel?: string;
  onClose: () => void;
  onPick: (rels: string[]) => void;
}) {
  const bridge = window.electronAPI?.localLibrary;
  const [files, setFiles] = useState<LocalLibraryFile[]>();
  const [truncated, setTruncated] = useState(false);
  const [failure, setFailure] = useState("");
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setFailure("");
    setChosen(selected);
    setFiles(undefined);
    void (async () => {
      try {
        const manifest = await bridge!.scan();
        setFiles(manifest.files);
        setTruncated(manifest.truncated);
      } catch (e) {
        setFailure(e instanceof Error ? e.message : "读取本地资料文件夹失败。");
      }
    })();
    // The selection resets each time the dialog opens, not on every prop change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const shown = (files || []).filter(
    (file) =>
      !query ||
      file.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) ||
      file.rel.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const toggle = (rel: string) =>
    setChosen((value) =>
      value.includes(rel) ? value.filter((item) => item !== rel) : [...value, rel],
    );
  return (
    <Modal
      title="从本地资料文件夹取用"
      open={open}
      onCancel={onClose}
      width={720}
      footer={null}
      destroyOnClose
    >
      <p className="workspace-muted">
        只记录文件夹路径，不上传；选中的文件会复制到任务的工作文件夹。
      </p>
      {!bridge && (
        <Alert type="info" message="需要在 Windows 客户端里使用本地资料文件夹。" />
      )}
      {failure && <Alert type="error" message={failure} />}
      {bridge && !files && !failure && <Spin tip="正在读取文件列表" />}
      {files && (
        <>
          <Input.Search
            aria-label="查找文件"
            placeholder="按文件名或路径查找"
            allowClear
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="local-library-list">
            {shown.map((file) => (
              <label key={file.rel} className="local-library-row">
                <Checkbox
                  checked={chosen.includes(file.rel)}
                  onChange={() => toggle(file.rel)}
                />
                <span>
                  <strong>{file.name}</strong>
                  <small>{file.rel}</small>
                </span>
                <em>{Math.max(1, Math.round(file.size / 1024))} KB</em>
              </label>
            ))}
            {!shown.length && <p className="workspace-muted">没有匹配的文件。</p>}
          </div>
          {truncated && (
            <p className="workspace-muted">
              文件夹较大，只列出了最近修改的一部分；用搜索框缩小范围。
            </p>
          )}
          <div className="workspace-standards-actions">
            <Button
              type="primary"
              disabled={!chosen.length}
              onClick={() => onPick(chosen)}
            >
              {confirmLabel}
            </Button>
            <Button onClick={onClose}>取消</Button>
            <span className="workspace-muted">已选 {chosen.length} 个</span>
          </div>
        </>
      )}
    </Modal>
  );
}
