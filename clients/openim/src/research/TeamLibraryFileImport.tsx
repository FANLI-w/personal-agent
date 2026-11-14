import { Alert, Input, Modal, Select } from "antd";
import { FileOutlined } from "@ant-design/icons";
import { useEffect, useRef, useState } from "react";
import { TeamLibraryEntry } from "@research-agent-platform/contracts";
import type { TeamLibraryProposal, TeamLibrarySnapshot } from "@/types/teamLibrary";
import { usePersonalOperation } from "./usePersonalOperation";

export function TeamLibraryFileImport({
  file,
  snapshot,
  projectId,
  targetId,
  onClose,
  onSaved,
}: {
  file: File;
  snapshot: TeamLibrarySnapshot;
  projectId: string;
  targetId: string;
  onClose: () => void;
  onSaved: (value: TeamLibraryProposal) => void;
}) {
  const matches = snapshot.manifest.entries.filter(
    (entry) => entry.source.kind === "git" && entry.name === file.name,
  );
  const [target, setTarget] = useState(
    targetId || (matches.length === 1 ? matches[0].id : "new"),
  );
  const [project, setProject] = useState(
    projectId || snapshot.manifest.projects[0]?.id || "",
  );
  const [purpose, setPurpose] = useState<TeamLibraryEntry["purpose"]>(
    /\.(pptx?|potx)$/i.test(file.name)
      ? "template"
      : /\.(png|jpe?g|webp)$/i.test(file.name)
      ? "figure"
      : "reference",
  );
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const operation = usePersonalOperation(true, "team-library-file-import");
  const newId = useRef("material_" + crypto.randomUUID().replaceAll("-", ""));
  const [thumbnail, setThumbnail] = useState("");
  useEffect(() => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return;
    const url = URL.createObjectURL(file);
    setThumbnail(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const previous = snapshot.manifest.entries.find((entry) => entry.id === target);
  const save = async () => {
    const ticket = operation.capture();
    setBusy(true);
    setError("");
    try {
      if (file.size > 20 * 1024 * 1024)
        throw Error("单份仓库文件最多20 MiB，更大文件请从共享原件导入。");
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!ticket.isCurrent()) return;
      if (
        previous?.source.kind === "git" &&
        previous.source.path.split(".").pop()?.toLowerCase() !==
          file.name.split(".").pop()?.toLowerCase()
      )
        throw Error("新版文件格式与原件不同，请选择新增资料，或换成同一格式的文件。");
      const parsed = TeamLibraryEntry.safeParse(
        previous
          ? { ...previous, summary: summary.trim() || previous.summary }
          : {
              id: newId.current,
              projectId: project,
              name: file.name,
              purpose,
              summary: summary.trim(),
              maintainer: "",
              recommended: false,
              source: {
                kind: "git",
                path: `原件/${project}/${file.name}`,
                sha256: "0".repeat(64),
              },
            },
      );
      if (!parsed.success)
        throw Error("请检查项目与文件名，文件名不能以点或空格结尾。");
      const result = await window.electronAPI!.teamLibrary.propose(
        snapshot.revision,
        parsed.data,
        undefined,
        bytes,
      );
      if (ticket.isCurrent()) onSaved(result);
    } catch (cause) {
      if (ticket.isCurrent())
        setError(
          cause instanceof Error
            ? cause.message.replace(
                /^Error invoking remote method '[^']+': (?:Error: )?/,
                "",
              )
            : "文件更新未完成，请重试。",
        );
    } finally {
      if (ticket.isCurrent()) setBusy(false);
    }
  };
  return (
    <Modal
      open
      title="确认资料更新"
      className="team-library-editor"
      width={600}
      onCancel={onClose}
      closable={!busy}
      maskClosable={!busy}
      cancelButtonProps={{ disabled: busy }}
      onOk={save}
      confirmLoading={busy}
      okButtonProps={{ disabled: !previous && !project }}
      okText="提交审核"
    >
      {error && <Alert type="error" message={error} showIcon />}
      <div className="team-library-import-file">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={file.name}
            width={64}
            height={64}
            style={{ objectFit: "contain" }}
          />
        ) : (
          <FileOutlined />
        )}
        <div>
          <strong>{file.name}</strong>
          <small>{(file.size / 1024 / 1024).toFixed(2)} MiB</small>
        </div>
      </div>
      <label>
        更新哪份资料
        <Select
          value={target}
          onChange={setTarget}
          style={{ width: "100%" }}
          showSearch
          optionFilterProp="label"
          options={[
            { value: "new", label: "作为新资料" },
            ...snapshot.manifest.entries
              .filter((entry) => entry.source.kind === "git")
              .map((entry) => ({
                value: entry.id,
                label: `${entry.name} · ${
                  snapshot.manifest.projects.find((p) => p.id === entry.projectId)
                    ?.name || entry.projectId
                }`,
              })),
          ]}
        />
      </label>
      {previous ? (
        <div className="team-library-version-change">
          <span>
            当前版本<strong>{previous.name}</strong>
            <small>
              {previous.source.sha256?.slice(0, 8)} · {snapshot.revision.slice(0, 8)}
            </small>
          </span>
          <b aria-hidden>→</b>
          <span>
            待审新版<strong>{file.name}</strong>
            <small>审核通过后团队同步可见</small>
          </span>
        </div>
      ) : (
        <>
          <label>
            所属项目
            <Select
              value={project}
              onChange={setProject}
              style={{ width: "100%" }}
              options={snapshot.manifest.projects.map((p) => ({
                value: p.id,
                label: p.name,
              }))}
            />
          </label>
          {!snapshot.manifest.projects.length && (
            <Alert type="info" message="请先新建一个资料项目，再导入文件。" />
          )}
          <label>
            用途
            <Select
              value={purpose}
              onChange={setPurpose}
              style={{ width: "100%" }}
              options={[
                { value: "template", label: "模板与案例" },
                { value: "figure", label: "图与素材" },
                { value: "reference", label: "参考资料" },
                { value: "output", label: "归档成果" },
              ]}
            />
          </label>
        </>
      )}
      <label>
        更新说明（可选）
        <Input.TextArea
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          maxLength={4000}
          autoSize={{ minRows: 2, maxRows: 4 }}
          placeholder={previous?.summary || "例如：补充最新实验结果，沿用原版式"}
        />
      </label>
      <p>文件将提交到团队仓库的待审分支。公开仓库中的文件对所有人可见。</p>
    </Modal>
  );
}
