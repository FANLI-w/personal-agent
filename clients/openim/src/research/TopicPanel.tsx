import { Alert, Button } from "antd";
import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import type { AssistantTopicIndex } from "@research-agent-platform/contracts";
import { researchApi } from "./api";
import { subscribeServiceVersion, supportsClosedTopicResume } from "./service-version";
import { useResearchRead } from "./useResearchRead";
import { usePersonalOperation } from "./usePersonalOperation";
import "./personal-memory.scss";

const stateLabel = (state: AssistantTopicIndex["state"]) =>
  state === "active" ? "活动中" : state === "paused" ? "已暂停" : "已关闭";

export function TopicPanel({ assistantId }: { assistantId: string }) {
  const operation = usePersonalOperation(true, `assistant-topics:${assistantId}`);
  const canResumeClosed = useSyncExternalStore(
    subscribeServiceVersion,
    supportsClosedTopicResume,
    supportsClosedTopicResume,
  );
  const [saving, setSaving] = useState<string>();
  const [notice, setNotice] = useState<{ text: string; error: boolean }>();
  useLayoutEffect(() => {
    setSaving(undefined);
    setNotice(undefined);
  }, [operation.scope]);
  const { data, error, refresh } = useResearchRead(
    (signal) =>
      researchApi("assistantTopics", {
        signal,
        query: { assistantId, state: "all", limit: 50 },
      }),
    `assistant-topics:${assistantId}`,
  );
  const resume = async (topic: AssistantTopicIndex) => {
    const captured = operation.capture();
    if (!captured.isCurrent() || saving) return;
    setSaving(topic.id);
    setNotice(undefined);
    try {
      await researchApi("resumeAssistantTopic", {
        params: { id: topic.id },
        body: { expectedVersion: topic.version },
      });
      if (captured.isCurrent()) {
        setNotice({ text: "已恢复这个话题。回到聊天就可以接着聊。", error: false });
        await refresh();
      }
    } catch (failure) {
      if (captured.isCurrent()) {
        setNotice({ text: failure instanceof Error ? failure.message : "无法恢复话题。", error: true });
        await refresh();
      }
    } finally {
      if (captured.isCurrent()) setSaving(undefined);
    }
  };
  return (
    <section aria-label="助理话题" className="scoped-memory-panel space-y-3">
      <header className="scoped-memory-heading">
        <h3>话题</h3>
      </header>
      <p className="text-xs text-slate-600">
        助理会在聊天里接着当前话题。点击「继续这个话题」可以切换。
      </p>
      {error && <Alert type="error" showIcon message={error} />}
      {notice && <Alert type={notice.error ? "error" : "success"} message={notice.text} />}
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
          {(topic.state === "paused" || (topic.state === "closed" && canResumeClosed)) && (
            <Button size="small" disabled={Boolean(saving)} loading={saving === topic.id} onClick={() => void resume(topic)}>
              继续这个话题
            </Button>
          )}
        </article>
      ))}
      {data && !data.data.length && (
        <p className="text-slate-500">这位助理还没有话题。</p>
      )}
    </section>
  );
}
