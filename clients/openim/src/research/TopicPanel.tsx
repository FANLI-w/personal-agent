import { Alert } from "antd";
import type { AssistantTopicIndex } from "@research-agent-platform/contracts";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import "./personal-memory.scss";

const stateLabel = (state: AssistantTopicIndex["state"]) =>
  state === "active" ? "活动中" : state === "paused" ? "已暂停" : "已关闭";

/**
 * Read-only topic list. Editing stays in the owner's own flows until the topic
 * editor lands; this view exists so the owner can audit what the curator wrote.
 */
export function TopicPanel({ assistantId }: { assistantId: string }) {
  const { data, error } = useResearchRead(
    (signal) =>
      researchApi("assistantTopics", {
        signal,
        query: { assistantId, state: "all", limit: 50 },
      }),
    `assistant-topics:${assistantId}`,
  );
  return (
    <section aria-label="助理话题" className="scoped-memory-panel space-y-3">
      <header className="scoped-memory-heading">
        <h3>话题</h3>
      </header>
      <p className="text-xs text-slate-600">
        助理整理出的长期话题。只有活动中的话题会进入后续对话，暂停与关闭的话题仅保留可查。
      </p>
      {error && <Alert type="error" showIcon message={error} />}
      {!data && !error && (
        <p role="status" className="habit-row-meta">
          正在读取话题…
        </p>
      )}
      {data?.data.map((topic) => (
        <article key={topic.id} className="assistant-habit-row">
          <strong>{topic.title}</strong>
          <span className="text-xs text-slate-500"> · {stateLabel(topic.state)}</span>
          <p className="whitespace-pre-wrap">{topic.summary}</p>
          <p className="text-xs text-slate-500">
            最近活动 {new Date(topic.lastActiveAt).toLocaleString("zh-CN")} · 版本{" "}
            {topic.version}
          </p>
        </article>
      ))}
      {data && !data.data.length && (
        <p className="text-slate-500">这位助理还没有话题。</p>
      )}
    </section>
  );
}
