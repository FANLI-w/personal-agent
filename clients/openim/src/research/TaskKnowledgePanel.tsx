import { Alert, Checkbox, Select } from "antd";

import type {
  DshTaskState,
  TaskTarget,
} from "../../../../integrations/deepseek-harness/desktop/task-workspace";
import { usePersonalOperation } from "./usePersonalOperation";
import { useResearchRead } from "./useResearchRead";

const scopeLabel = { lab: "课题组", project: "项目", personal: "个人" };

/**
 * Rules are already enforced by the executor; this panel only answers "what did
 * this run carry". Everything else lives where it is edited, not here.
 */
export function TaskKnowledgePanel({
  target,
  state,
  canWork,
  busy,
  command,
}: {
  target: TaskTarget;
  state?: DshTaskState;
  canWork: boolean;
  busy: boolean;
  command: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const bridge = window.electronAPI?.localDsh;
  const operation = usePersonalOperation(
    true,
    `task-knowledge:${target.kind}:${target.taskId}`,
  );
  const knowledge = useResearchRead(
    () => bridge!.taskKnowledge(target),
    `knowledge:${target.kind}:${target.taskId}`,
    Boolean(bridge),
  );
  const policy = knowledge.data?.policy,
    binding = state?.binding,
    preferences = binding?.preferences || { personalMemory: false, skills: [] };
  const active = (policy?.records || []).filter((r) => r.status === "active"),
    candidates = (policy?.records || []).filter((r) => r.status === "candidate"),
    lab = active.filter((r) => r.scope === "lab").length,
    project = active.filter((r) => r.scope === "project").length,
    latest = binding?.handoffs?.at(-1);
  return (
    <section className="task-knowledge" aria-label="规则与记忆">
      {knowledge.error && (
        <Alert
          type="warning"
          message="暂时无法读取本轮规则"
          description={knowledge.error}
        />
      )}
      {!policy && !knowledge.error && <p>正在读取本轮规则…</p>}
      {policy && (
        <>
          <p className="task-knowledge-summary">
            本轮带：平台规则 v{policy.platform.version} · 课题组 {lab} 条 · 项目约定{" "}
            {project} 条
            {candidates.length > 0 ? ` · ${candidates.length} 条待确认` : ""} · 个人记忆
            {preferences.personalMemory ? "已启用" : "未启用"}
            {preferences.skills.length > 0
              ? ` · 方法 ${preferences.skills.length} 个`
              : ""}
          </p>
          <details>
            <summary>看具体规则（{active.length}）</summary>
            {!active.length && <p>还没有生效的课题组或项目规则。</p>}
            {active.map((record) => (
              <article key={record.id}>
                <strong>
                  {scopeLabel[record.scope]} · {record.title}
                </strong>
                <p>{record.content}</p>
              </article>
            ))}
            <p className="task-knowledge-hint">
              要改规则，去「资料 → 课题组规范」；个人偏好去「我的 → 我的助理」。
            </p>
          </details>
          {latest && (
            <details>
              <summary>上次交接（v{latest.version}）</summary>
              <p>{latest.conclusion}</p>
              <p>下一步：{latest.next}</p>
            </details>
          )}
          <details>
            <summary>高级：个人记忆与方法</summary>
            <Checkbox
              disabled={busy || !binding || !canWork || !policy.privateMemoryAllowed}
              checked={preferences.personalMemory && policy.privateMemoryAllowed}
              onChange={(e) =>
                void command(() =>
                  bridge!.taskPreferences(target, {
                    ...preferences,
                    personalMemory: e.target.checked,
                  }),
                )
              }
            >
              本轮使用我的记忆（只读已确认的）
            </Checkbox>
            <Select
              aria-label="本任务使用的方法"
              mode="multiple"
              style={{ width: "100%" }}
              disabled={busy || !binding || !canWork}
              value={preferences.skills}
              placeholder="本轮要用哪些内置方法（可不选）"
              onChange={(skills) =>
                void command(() =>
                  bridge!.taskPreferences(target, { ...preferences, skills }),
                )
              }
              options={(knowledge.data?.skills || []).map((skill) => ({
                value: skill.name,
                label: skill.name,
                title: skill.description,
              }))}
            />
          </details>
        </>
      )}
    </section>
  );
}
