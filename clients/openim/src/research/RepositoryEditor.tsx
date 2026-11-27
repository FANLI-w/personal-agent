import { Alert, Button, Input, Modal } from "antd";
import { useId, useRef, useState } from "react";
import { TeamRepositoryUrl, type ResponseFor } from "@research-agent-platform/contracts";
import { researchApi } from "./api";
import { usePersonalOperation } from "./usePersonalOperation";

type RepositoryStatus = ResponseFor<"teamRepository">["data"];
const message = (error: unknown) =>
  error instanceof Error
    ? error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "")
    : "连接未完成，请重试。";

export function RepositoryEditor({
  current,
  readOnly = false,
  inline = false,
  onClose,
  onSaved,
}: {
  current?: RepositoryStatus;
  readOnly?: boolean;
  inline?: boolean;
  onClose?: () => void;
  onSaved: () => Promise<void>;
}) {
  const [url, setUrl] = useState(current?.binding?.url || ""),
    [error, setError] = useState(""),
    [invalid, setInvalid] = useState(false),
    [busy, setBusy] = useState(false);
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const operation = usePersonalOperation(true, "team-repository-editor"),
    key = useRef(crypto.randomUUID()),
    submitting = useRef(false);
  const save = async () => {
    const address = url.trim().replace(/\/$/, "");
    if (readOnly || submitting.current || !url.trim()) return;
    if (!TeamRepositoryUrl.safeParse(address).success) {
      setInvalid(true);
      setError("请输入 GitHub HTTPS 仓库地址，例如 https://github.com/your-lab/research-materials。");
      return;
    }
    submitting.current = true;
    const ticket = operation.capture();
    setBusy(true);
    setError("");
    try {
      const bridge = window.electronAPI?.teamLibrary;
      if (!bridge?.discover) throw Error("请使用更新后的 Windows 客户端连接仓库。");
      const value = await bridge.discover(address);
      if (!ticket.isCurrent()) return;
      await researchApi("saveTeamRepository", {
        body: { ...value, expectedVersion: current?.binding?.version || 0 },
        idempotencyKey: key.current,
      });
      if (ticket.isCurrent()) await onSaved();
    } catch (e) {
      if (ticket.isCurrent()) setError(message(e));
    } finally {
      submitting.current = false;
      if (ticket.isCurrent()) setBusy(false);
    }
  };
  const field = (
    <Input
      id={inputId}
      autoFocus={!inline}
      disabled={busy}
      readOnly={readOnly}
      placeholder="https://github.com/your-lab/research-materials"
      autoComplete="off"
      spellCheck={false}
      aria-invalid={invalid || undefined}
      aria-describedby={error ? `${hintId} ${errorId}` : hintId}
      status={invalid ? "error" : undefined}
      value={url}
      onPressEnter={inline ? undefined : () => void save()}
      onChange={(e) => {
        setUrl(e.target.value);
        setError("");
        setInvalid(false);
        key.current = crypto.randomUUID();
      }}
    />
  );
  const hint = (
    <p id={hintId} className="team-library-repository-hint">
      地址末尾有无 .git 均可。私有仓库需要本机 Git 已有访问权限；公开仓库中的资料对所有人可见。
    </p>
  );
  const errorNotice = error && (
    <div id={errorId} className="team-library-connect-error">
      <Alert type="error" showIcon message={error} />
    </div>
  );
  if (inline) {
    return (
      <form
        className="team-library-connect-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label htmlFor={inputId}>GitHub 仓库地址</label>
        <div className="team-library-connect-field">
          {field}
          <Button type="primary" htmlType="submit" loading={busy} disabled={readOnly || !url.trim()}>
            {busy ? "正在连接" : "连接仓库"}
          </Button>
        </div>
        {hint}
        {errorNotice}
      </form>
    );
  }
  return (
    <Modal
      open
      title={current?.binding ? "团队仓库设置" : "连接团队仓库"}
      className="team-library-editor"
      closable={!busy}
      maskClosable={!busy}
      cancelButtonProps={{ disabled: busy }}
      onCancel={onClose}
      onOk={save}
      cancelText={readOnly ? "关闭" : "取消"}
      okButtonProps={{
        disabled: readOnly || !url.trim(),
        style: readOnly ? { display: "none" } : undefined,
      }}
      confirmLoading={busy}
      okText={busy ? "正在连接" : "连接仓库"}
    >
      <p>
        {readOnly
          ? "这是课题组当前使用的仓库地址。如需修改，请联系课题组管理员。"
          : "粘贴 GitHub 仓库地址，连接后即可按文件夹浏览团队资料。"}
      </p>
      {errorNotice}
      <label htmlFor={inputId}>GitHub 仓库地址</label>
      {field}
      {hint}
    </Modal>
  );
}
