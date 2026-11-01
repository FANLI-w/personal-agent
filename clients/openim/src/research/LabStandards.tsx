import { Alert, Button, Input } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { researchApi } from "./api";
import {
  composePptTemplate,
  isPptTemplate,
  parsePptTemplate,
  pptStartPrompt,
  pptTemplateTitle,
} from "./ppt-template";
import { useResearchStore } from "./store";
import { usePersonalOperation } from "./usePersonalOperation";
import { useResearchRead } from "./useResearchRead";
import { useWorkspaceAvailability } from "./useWorkspaceAvailability";
import { WorkspaceUnavailable } from "./WorkspaceUnavailable";

const statusLabels = {
  active: "生效中",
  candidate: "待负责人确认",
  revoked: "已撤回",
} as const;

const statusClasses = {
  active: "bg-emerald-50 text-emerald-700",
  candidate: "bg-amber-50 text-amber-700",
  revoked: "bg-slate-100 text-slate-500",
} as const;

/**
 * Lab rules used to be reachable only from inside a task, so nobody could tell
 * what the group actually works by. This page is the one place to read them,
 * change them, and see which materials are the group's own templates.
 */
export function LabStandards() {
  const availability = useWorkspaceAvailability(true);
  const supported = availability.supports(40);
  const navigate = useNavigate();
  const actor = useResearchStore((s) => s.actor);
  const operation = usePersonalOperation(supported, "lab-standards");
  const read = useResearchRead(
    () => researchApi("labWorkRules"),
    "lab-work-rules",
    supported && Boolean(actor),
  );
  const collections = useResearchRead(
    () => researchApi("researchCollections", { query: { limit: 100 } }),
    "lab-standards-collections",
    supported && Boolean(actor),
  );
  const [editing, setEditing] = useState<{
    id?: string;
    version: number;
    mode: "rule" | "ppt";
    /** A rule keeps its title; a PPT template keeps only the name after the prefix. */
    title: string;
    content: string;
    /** One file per line, only for PPT templates. */
    files: string;
  }>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const data = read.data?.data;
  const records = data?.records || [];
  const templates = records.filter((r) => isPptTemplate(r.title));
  const rules = records.filter((r) => !isPptTemplate(r.title));
  const groups = [
    {
      key: "active",
      label: "生效中",
      items: rules.filter((r) => r.status === "active"),
    },
    {
      key: "candidate",
      label: "待负责人确认",
      items: rules.filter((r) => r.status === "candidate"),
    },
    {
      key: "revoked",
      label: "已撤回",
      items: rules.filter((r) => r.status === "revoked"),
    },
  ].filter((group) => group.items.length);
  const labCollections = (collections.data?.data || []).filter(
    (c) => c.scope === "lab_shared",
  );
  const submit = async (
    action: "save" | "confirm" | "revoke",
    record?: { id: string; version: number; title: string; content: string },
  ) => {
    const draft = record
      ? {
          id: record.id,
          version: record.version,
          mode: "rule" as const,
          title: record.title,
          content: record.content,
          files: "",
        }
      : editing;
    if (!draft) return;
    const template = !record && draft.mode === "ppt";
    const captured = operation.capture();
    setBusy(true);
    setFailure("");
    setNotice("");
    try {
      await researchApi("saveLabWorkRule", {
        body: {
          scope: "lab",
          kind: "rule",
          title: template ? pptTemplateTitle(draft.title) : draft.title.trim(),
          content: template
            ? composePptTemplate({
                name: draft.title,
                requirements: draft.content,
                files: draft.files.split("\n"),
              })
            : draft.content.trim(),
          recordId: draft.id ?? null,
          expectedVersion: draft.version,
          action,
        },
        idempotencyKey: crypto.randomUUID(),
      });
      if (!captured.isCurrent()) return;
      setEditing(undefined);
      setNotice(
        action === "revoke"
          ? "已撤回，这条不会再进入新任务。"
          : action === "confirm"
          ? "已确认生效，之后的任务会带上它。"
          : data?.canPublish
          ? "已保存并生效，之后的任务会带上它。"
          : "已提交，负责人确认后生效。",
      );
      await read.refresh();
    } catch (e) {
      if (captured.isCurrent())
        setFailure(e instanceof Error ? e.message : "未保存，内容已保留。");
    } finally {
      if (captured.isCurrent()) setBusy(false);
    }
  };
  // Starting a deck reuses the template's requirements instead of retyping them.
  const startWithTemplate = (record: { title: string; content: string }) => {
    const template = parsePptTemplate(record.title, record.content);
    navigate(
      `/workbench?${new URLSearchParams({
        view: "tasks",
        draft: pptStartPrompt(template),
      })}`,
    );
  };
  if (!supported)
    return (
      <div className="library-workspace-content">
        <WorkspaceUnavailable
          feature="课题组规范"
          pending={!availability.data && !availability.error}
          error={availability.error}
          onRetry={availability.refresh}
        />
      </div>
    );
  return (
    <section className="workspace-standards" aria-label="课题组规范">
      <div className="workspace-standards-intro">
        <h2>课题组按什么工作</h2>
        <p>
          <strong>规则</strong>
          会自动进入任务：平台基本规则、课题组规则、项目约定三层叠在一起。
          <strong>资料</strong>
          只是参考材料，放在资料库里，任务里按需取用，不会自动变成规则。
          个人任务只带平台规则，不继承课题组约定。
        </p>
      </div>
      {read.error && (
        <Alert
          type="error"
          message="课题组规则暂不可用"
          description={read.error}
          action={<Button onClick={read.refresh}>重试读取</Button>}
        />
      )}
      {notice && <Alert type="success" message={notice} />}
      {failure && <Alert type="error" message={failure} />}
      {!data && !read.error && <p role="status">正在读取课题组规则…</p>}
      {data && (
        <>
          <details className="workspace-standards-platform">
            <summary>
              平台基本规则 · v{data.platform.version} · 产品维护者发布（所有任务都带）
            </summary>
            <p>{data.platform.content}</p>
          </details>
          <div className="workspace-standards-heading">
            <div>
              <h3>课题组规则</h3>
              <p>
                {data.canPublish
                  ? "你是课题组负责人：保存即生效，也可以确认或撤回其他人提的候选。"
                  : "成员新增的规则先进入「待负责人确认」，确认后才进入任务。"}
              </p>
            </div>
            {data.canPublish && (
              <Button
                type="primary"
                disabled={busy || Boolean(editing)}
                onClick={() =>
                  setEditing({
                    version: 0,
                    mode: "rule",
                    title: "",
                    content: "",
                    files: "",
                  })
                }
              >
                新增规则
              </Button>
            )}
          </div>
          {editing && (
            <div className="workspace-standards-editor" aria-label="编辑课题组规则">
              <Input
                aria-label={editing.mode === "ppt" ? "模板名称" : "规则标题"}
                maxLength={80}
                placeholder={
                  editing.mode === "ppt"
                    ? "模板名称，例如：组会汇报 / 项目申报答辩"
                    : "一句话说明这条约定，例如：项目书按 7 个小节写"
                }
                value={editing.title}
                disabled={busy}
                onChange={(e) =>
                  setEditing((s) => s && { ...s, title: e.target.value })
                }
              />
              <Input.TextArea
                aria-label={editing.mode === "ppt" ? "模板要求" : "规则正文"}
                rows={4}
                maxLength={2000}
                placeholder={
                  editing.mode === "ppt"
                    ? "每次都要重复说的要求：受众、页数、每页信息量、配色、字体、结构（背景-方法-结果-结论）、图表风格。"
                    : "写清楚要求本身，例如：摘要 300 字以内；引用统一 GB/T 7714；结果先给结论再给证据。"
                }
                value={editing.content}
                disabled={busy}
                onChange={(e) =>
                  setEditing((s) => s && { ...s, content: e.target.value })
                }
              />
              {editing.mode === "ppt" && (
                <Input.TextArea
                  aria-label="要准备的文件"
                  rows={3}
                  maxLength={1000}
                  placeholder={
                    "这次要放进工作文件夹的文件，每行一个：\n组会母版.pptx\n实验室介绍.pptx\n成果统计.xlsx"
                  }
                  value={editing.files}
                  disabled={busy}
                  onChange={(e) =>
                    setEditing((s) => s && { ...s, files: e.target.value })
                  }
                />
              )}
              <div>
                <Button
                  type="primary"
                  loading={busy}
                  disabled={!editing.title.trim() || !editing.content.trim()}
                  onClick={() => void submit("save")}
                >
                  保存
                </Button>
                <Button disabled={busy} onClick={() => setEditing(undefined)}>
                  取消
                </Button>
              </div>
            </div>
          )}
          {!groups.length && !editing && (
            <p className="workspace-muted">
              还没有课题组规则。先写一条最常被问到的约定（比如“引用格式”“项目书结构”“专利交底必须写清问题—手段—效果”），之后每项任务都会带上它。
            </p>
          )}
          {groups.map((group) => (
            <section key={group.key} aria-label={group.label}>
              <h4 className="workspace-standards-group">
                {group.label} · {group.items.length}
              </h4>
              {group.items.map((record) => (
                <article className="workspace-standards-record" key={record.id}>
                  <header>
                    <strong>{record.title}</strong>
                    <span className={statusClasses[record.status]}>
                      {statusLabels[record.status]}
                    </span>
                    <small>
                      v{record.version} · {record.authorName} ·{" "}
                      {new Date(record.updatedAt).toLocaleString("zh-CN")}
                    </small>
                  </header>
                  <p>{record.content}</p>
                  <div className="workspace-standards-actions">
                    {record.allowedActions.includes("revise") && (
                      <Button
                        size="small"
                        disabled={busy}
                        onClick={() =>
                          setEditing({
                            id: record.id,
                            version: record.version,
                            mode: "rule",
                            title: record.title,
                            content: record.content,
                            files: "",
                          })
                        }
                      >
                        修改
                      </Button>
                    )}
                    {record.allowedActions.includes("confirm") && (
                      <Button
                        size="small"
                        disabled={busy}
                        onClick={() => void submit("confirm", record)}
                      >
                        确认生效
                      </Button>
                    )}
                    {record.allowedActions.includes("revoke") && (
                      <Button
                        size="small"
                        danger
                        disabled={busy}
                        onClick={() => void submit("revoke", record)}
                      >
                        撤回
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </section>
          ))}
          <div className="workspace-standards-heading">
            <div>
              <h3>PPT 工作模板</h3>
              <p>
                把每次都要重说一遍的要求存下来：受众、页数、配色、字体、结构，加上这次要准备的文件。
                下次点「用它开始」，要求自动带进任务，你只补本次变化。
              </p>
            </div>
            {data.canPublish && (
              <Button
                disabled={busy || Boolean(editing)}
                onClick={() =>
                  setEditing({
                    version: 0,
                    mode: "ppt",
                    title: "",
                    content: "",
                    files: "",
                  })
                }
              >
                新增 PPT 模板
              </Button>
            )}
          </div>
          {!templates.length && (
            <p className="workspace-muted">
              还没有 PPT
              模板。挑一次做得满意的汇报，把要求和要用的文件记下来，下次就不用重新讲了。
            </p>
          )}
          {templates.map((record) => {
            const template = parsePptTemplate(record.title, record.content);
            return (
              <article className="workspace-standards-record" key={record.id}>
                <header>
                  <strong>{template.name}</strong>
                  <span className={statusClasses[record.status]}>
                    {statusLabels[record.status]}
                  </span>
                  <small>
                    v{record.version} · {record.authorName} ·{" "}
                    {new Date(record.updatedAt).toLocaleString("zh-CN")}
                  </small>
                </header>
                <p>{template.requirements}</p>
                {template.files.length > 0 && (
                  <p className="workspace-standards-files">
                    要准备：{template.files.join(" · ")}
                  </p>
                )}
                <div className="workspace-standards-actions">
                  {record.status === "active" && (
                    <Button
                      size="small"
                      type="primary"
                      disabled={busy}
                      onClick={() => startWithTemplate(record)}
                    >
                      用它开始
                    </Button>
                  )}
                  {record.allowedActions.includes("revise") && (
                    <Button
                      size="small"
                      disabled={busy}
                      onClick={() =>
                        setEditing({
                          id: record.id,
                          version: record.version,
                          mode: "ppt",
                          title: template.name,
                          content: template.requirements,
                          files: template.files.join("\n"),
                        })
                      }
                    >
                      修改
                    </Button>
                  )}
                  {record.allowedActions.includes("confirm") && (
                    <Button
                      size="small"
                      disabled={busy}
                      onClick={() => void submit("confirm", record)}
                    >
                      确认生效
                    </Button>
                  )}
                  {record.allowedActions.includes("revoke") && (
                    <Button
                      size="small"
                      danger
                      disabled={busy}
                      onClick={() => void submit("revoke", record)}
                    >
                      撤回
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
          <div className="workspace-standards-heading">
            <div>
              <h3>模板与范文</h3>
              <p>
                这些是资料，不是规则：论文模板、项目书样例、专利交底模板都放在课题组的资料集里，任务里按需取用，或直接问资料助手。
              </p>
            </div>
            <Button onClick={() => navigate("/library")}>去资料库上传或更新</Button>
          </div>
          {collections.error && <Alert type="warning" message={collections.error} />}
          {labCollections.length > 0 && (
            <ul className="workspace-standards-collections">
              {labCollections.map((collection) => (
                <li key={collection.id}>
                  <strong>{collection.name}</strong>
                  <span>课题组可见</span>
                </li>
              ))}
            </ul>
          )}
          {!labCollections.length && !collections.error && (
            <p className="workspace-muted">
              还没有课题组范围的资料集。到资料库新建一个（范围选「课题组」），把模板和范文传进去，全组都能用。
            </p>
          )}
        </>
      )}
    </section>
  );
}
