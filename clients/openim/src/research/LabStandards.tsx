import { Alert, Button, Input, Select } from "antd";
import { useEffect, useLayoutEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { LocalLibraryStatus } from "@/types/localLibrary";

import { researchApi } from "./api";
import { LocalLibraryPicker } from "./LocalLibraryPicker";
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
import { workbenchTaskPath } from "./workbench-links";

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
  const linksSupported = availability.supports(45);
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
    mode: "rule" | "ppt" | "link";
    /** A rule keeps its title; a PPT template keeps only the name after the prefix. */
    title: string;
    content: string;
    /** One file per line, only for PPT templates. */
    files: string;
    /** Links may cite the task they came from; that task's dispatcher confirms them. */
    sourceTask?: string;
  }>();
  const sourceTasks = useResearchRead(async (signal) => {
    const tasks: {value:string;label:string}[]=[];
    const seen=new Set<string>(); let cursor:string|undefined;
    do {
      const response=await researchApi("tasks",{signal,query:{labId:actor!.member.labId,scope:"mine",status:"completed",limit:100,cursor}});
      for(const task of response.data) if("leadId" in task && task.leadId===actor?.member.id) tasks.push({value:task.id,label:task.title});
      cursor=response.nextCursor ?? undefined;
      if(cursor&&seen.has(cursor))throw Error("任务分页未完成，请重新读取。");
      if(cursor)seen.add(cursor);
    } while(cursor);
    return tasks;
  },"link-source-tasks",linksSupported&&Boolean(actor)&&editing?.mode==="link"&&!editing.id,{poll:false});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const [library, setLibrary] = useState<LocalLibraryStatus>();
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  useLayoutEffect(() => { setEditing(undefined); setBusy(false); setFailure(""); setNotice(""); setLibrary(undefined); }, [operation.scope]);
  const data = read.data?.data;
  const records = data?.records || [];
  const templates = records.filter((r) => r.kind === "rule" && isPptTemplate(r.title));
  const links = records.filter((r) => r.kind === "link");
  const rules = records.filter((r) => r.kind !== "link" && !isPptTemplate(r.title));
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
    record?: {
      id: string;
      version: number;
      title: string;
      content: string;
      kind: "rule" | "link" | "memory";
      sourceTaskId: string | null;
    },
  ) => {
    const draft = record
      ? {
          id: record.id,
          version: record.version,
          mode: record.kind === "link" ? ("link" as const) : ("rule" as const),
          title: record.title,
          content: record.content,
          files: "",
          sourceTask: record.sourceTaskId ?? "",
        }
      : editing;
    if (!draft) return;
    const template = !record && draft.mode === "ppt";
    const link = draft.mode === "link";
    const captured = operation.capture();
    setBusy(true);
    setFailure("");
    setNotice("");
    try {
      await researchApi("saveLabWorkRule", {
        body: {
          scope: "lab",
          kind: link ? "link" : "rule",
          title: template ? pptTemplateTitle(draft.title) : draft.title.trim(),
          content: template
            ? composePptTemplate({
                name: draft.title,
                requirements: draft.content,
                files: draft.files.split("\n"),
              })
            : draft.content.trim(),
          ...(link && draft.sourceTask?.trim()
            ? { sourceTaskId: draft.sourceTask.trim() }
            : {}),
          recordId: draft.id ?? null,
          expectedVersion: draft.version,
          action,
        },
      });
      if (!captured.isCurrent()) return;
      setEditing(undefined);
      setNotice(
        link
          ? action === "revoke"
            ? "已撤回这条方法。"
            : action === "confirm" || data?.canPublish
            ? "方法已生效，可按需查阅；不会自动加入规划或聊天。"
            : "方法已提交，等待派发人或负责人确认。"
          : action === "revoke"
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
  const readLibrary = async () => {
    const bridge = window.electronAPI?.localLibrary;
    if (!bridge) {
      setLibrary({ registered: false });
      return;
    }
    try {
      setLibrary(await bridge.status());
    } catch {
      setLibrary({ registered: false });
    }
  };
  useEffect(() => {
    void readLibrary();
  }, []);
  const pickLibrary = async () => {
    const bridge = window.electronAPI?.localLibrary;
    if (!bridge) return;
    setLibraryBusy(true);
    setFailure("");
    try {
      const manifest = await bridge.pick();
      if (manifest)
        setNotice(
          `已登记「${manifest.name}」，共 ${manifest.files.length} 个可用文件${
            manifest.truncated ? "（列表已截断）" : ""
          }。`,
        );
      await readLibrary();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "无法读取这个文件夹。");
    } finally {
      setLibraryBusy(false);
    }
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
          本人个人任务使用平台及个人规则；共享个人任务不带私人规则，也不继承课题组约定。
        </p>
      </div>
      <div className="workspace-standards-heading">
        <div>
          <h3>本地资料文件夹</h3>
          <p>
            只记录路径，不上传、不复制。模板里的文件从这里选，任务里一键复制进工作文件夹。
          </p>
        </div>
        <Button loading={libraryBusy} onClick={() => void pickLibrary()}>
          {library?.registered ? "更换文件夹" : "选择文件夹"}
        </Button>
      </div>
      {library?.registered ? (
        <p className="workspace-muted">
          {library.available
            ? `当前：${library.name} · ${library.root}`
            : `登记的「${library.name}」现在打不开，可能被移动或断开；点「更换文件夹」重新选一次。`}
        </p>
      ) : (
        <p className="workspace-muted">
          还没有登记。选一次实验室资料所在的文件夹即可，之后不用再选。
        </p>
      )}
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
                aria-label={
                  editing.mode === "ppt"
                    ? "模板名称"
                    : editing.mode === "link"
                    ? "链路名称"
                    : "规则标题"
                }
                maxLength={80}
                placeholder={
                  editing.mode === "ppt"
                    ? "模板名称，例如：组会汇报 / 项目申报答辩"
                    : editing.mode === "link"
                    ? "一句话说明这个链路解决什么问题，例如：审稿意见逐条回复"
                    : "一句话说明这条约定，例如：项目书按 7 个小节写"
                }
                value={editing.title}
                disabled={busy}
                onChange={(e) =>
                  setEditing((s) => s && { ...s, title: e.target.value })
                }
              />
              <Input.TextArea
                aria-label={
                  editing.mode === "ppt"
                    ? "模板要求"
                    : editing.mode === "link"
                    ? "链路正文"
                    : "规则正文"
                }
                rows={4}
                maxLength={2000}
                placeholder={
                  editing.mode === "ppt"
                    ? "每次都要重复说的要求：受众、页数、每页信息量、配色、字体、结构（背景-方法-结果-结论）、图表风格。"
                    : editing.mode === "link"
                    ? "做法本身：几步、每步判断依据、容易出错的地方。写结论不写过程。"
                    : "写清楚要求本身，例如：摘要 300 字以内；引用统一 GB/T 7714；结果先给结论再给证据。"
                }
                value={editing.content}
                disabled={busy}
                onChange={(e) =>
                  setEditing((s) => s && { ...s, content: e.target.value })
                }
              />
              {editing.mode === "ppt" && (
                <>
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
                  <div className="workspace-standards-actions">
                    <Button
                      size="small"
                      disabled={busy || !library?.registered}
                      onClick={() => setPicking(true)}
                    >
                      从本地资料文件夹选择
                    </Button>
                    <span className="workspace-muted">
                      选完写成相对路径，换机器只要目录结构相同就能用。
                    </span>
                  </div>
                </>
              )}
              {editing.mode === "link" && (
                <>
                <Select
                  aria-label="来源任务"
                  showSearch optionFilterProp="label" style={{width:"100%"}}
                  placeholder="选择你承接并已完成的来源任务"
                  value={editing.sourceTask || undefined}
                  loading={sourceTasks.loading}
                  options={editing.id?[{value:editing.sourceTask,label:"已关联的来源任务"}]:sourceTasks.data||[]}
                  disabled={busy || Boolean(editing.id)}
                  onChange={(value) =>
                    setEditing((s) => s && { ...s, sourceTask: value })
                  }
                />
                {sourceTasks.error && <Alert type="error" message={sourceTasks.error} action={<Button onClick={sourceTasks.refresh}>重新读取</Button>}/>}
                </>
              )}
              <div>
                <Button
                  type="primary"
                  loading={busy}
                  disabled={!editing.title.trim() || !editing.content.trim() || (editing.mode==="link"&&!editing.sourceTask)}
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
              <h3>组内可复用链路</h3>
              {!linksSupported && <p>更新配套后台后可提交和审核可复用方法。</p>}
              <p>
                任务做完后把做法留下来：几步、每步判断依据、容易出错的地方。
                承接人提交，来源任务的派发人或负责人确认后全组可读；链路不进入规划与聊天的自动注入，按需查阅。
              </p>
            </div>
            <Button
              disabled={busy || Boolean(editing) || !linksSupported}
              onClick={() =>
                setEditing({
                  version: 0,
                  mode: "link",
                  title: "",
                  content: "",
                  files: "",
                  sourceTask: "",
                })
              }
            >
              提交链路
            </Button>
          </div>
          {!links.length && !editing && (
            <p className="workspace-muted">
              还没有链路。第一次做完一类任务后，把可复用的那几步写在这里，下一次就不用重新摸索。
            </p>
          )}
          {links.map((record) => (
            <article className="workspace-standards-record" key={record.id}>
              <header>
                <strong>{record.title}</strong>
                <span className={statusClasses[record.status]}>
                  {record.status === "candidate" && record.sourceTaskId
                    ? "待派发人确认"
                    : statusLabels[record.status]}
                </span>
                <small>
                  v{record.version} · {record.authorName}
                </small>
                {record.sourceTaskId && (
                  <Button
                    size="small"
                    type="link"
                    onClick={() => navigate(workbenchTaskPath(record.sourceTaskId!, "research"))}
                  >
                    查看来源任务
                  </Button>
                )}
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
                        mode: "link",
                        title: record.title,
                        content: record.content,
                        files: "",
                        sourceTask: record.sourceTaskId ?? "",
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
      <LocalLibraryPicker
        open={picking}
        selected={(editing?.files || "")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)}
        confirmLabel="填进模板"
        onClose={() => setPicking(false)}
        onPick={(rels) => {
          setEditing((s) => s && { ...s, files: rels.join("\n") });
          setPicking(false);
        }}
      />
    </section>
  );
}
