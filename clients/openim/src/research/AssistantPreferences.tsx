import { Alert, Button, Input, Popconfirm, Space } from "antd";
import { useRef, useState } from "react";
import type { PersonalMemory } from "@research-agent-platform/contracts";
import { researchApi } from "./api";
import { usePersonalOperation } from "./usePersonalOperation";
import { useResearchRead } from "./useResearchRead";
export function AssistantPreferences({ contactId }: { contactId: string }) {
  const personal = useResearchRead(
    (signal) =>
      researchApi("personalMemories", {
        query: { status: "confirmed", limit: 100 },
        signal,
      }),
    contactId,
    true,
    { poll: false }
  );
  const agent = useResearchRead(
    (signal) =>
      researchApi("chatMemories", {
        query: { scope: "private_agent", scopeId: contactId, limit: 100 },
        signal,
      }),
    contactId,
    true,
    { poll: false }
  );
  const operation = usePersonalOperation(true, "assistant-habits:" + contactId);
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [editing, setEditing] = useState<PersonalMemory>();
  const [draft, setDraft] = useState("");
  const save = async (memory: PersonalMemory, forget: boolean) => {
    const op = operation.capture();
    if (lock.current || !op.isCurrent()) return;
    lock.current = true;
    setBusy(true);
    setFailure("");
    try {
      if (forget) {
        await researchApi("decidePersonalMemory", {
          params: { id: memory.id },
          body: { expectedVersion: memory.version, decision: "revoke" },
        });
      } else {
        await researchApi("updatePersonalMemory", {
          params: { id: memory.id },
          body: {
            expectedVersion: memory.version,
            topic: memory.topic,
            scope: memory.scope,
            content: draft.trim(),
          },
        });
      }
      if (op.isCurrent()) {
        setEditing(undefined);
        await personal.refreshChecked();
      }
    } catch (error) {
      if (op.isCurrent()) {
        setFailure(
          error instanceof Error ? error.message : "习惯未能更新，请刷新后再试。"
        );
        await personal.refresh();
      }
    } finally {
      lock.current = false;
      if (op.isCurrent()) setBusy(false);
    }
  };
  const lines = [
    ...(agent.data?.data ?? [])
      .filter(
        (m) => m.source === "本人明确保存的本助手交流偏好" && m.status === "active"
      )
      .flatMap((m) =>
        m.content
          .split("\n")
          .filter((line) => line.startsWith("- "))
          .reverse()
          .map((line) => line.slice(2))
      ),
    ...(agent.data?.data ?? [])
      .filter(
        (m) => m.status === "active" && m.source?.startsWith("聊天中形成的习惯：")
      )
      .map((m) => m.content),
  ];
  return (
    <section className="rounded-lg bg-slate-50 p-4">
      <h3 className="mb-2 text-sm font-medium">我们的交流习惯</h3>
      {(personal.data?.data ?? [])
        .filter((m) =>
          ["交流与工作习惯", "回复方式", "称呼", "语言", "写作"].includes(m.topic)
        )
        .map((m) => (
          <div className="border-b border-slate-200 py-2" key={m.id}>
            {editing?.id === m.id ? (
              <>
                <Input.TextArea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  aria-label="修改习惯"
                  autoFocus
                  maxLength={1000}
                  autoSize
                />
                <Space>
                  <Button
                    type="primary"
                    size="small"
                    loading={busy}
                    disabled={!draft.trim()}
                    onClick={() => void save(editing, false)}
                  >
                    保存
                  </Button>
                  <Button
                    size="small"
                    disabled={busy}
                    onClick={() => setEditing(undefined)}
                  >
                    取消
                  </Button>
                </Space>
              </>
            ) : (
              <>
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
                {m.allowedActions.includes("edit") && (
                  <Button
                    type="link"
                    size="small"
                    disabled={busy}
                    onClick={() => {
                      setEditing(m);
                      setDraft(m.content);
                      setFailure("");
                    }}
                  >
                    修改
                  </Button>
                )}
                {m.allowedActions.includes("revoke") && (
                  <Popconfirm
                    title="忘记这条习惯？"
                    okText="忘记"
                    cancelText="取消"
                    onConfirm={() => save(m, true)}
                  >
                    <Button type="text" size="small" disabled={busy}>
                      忘记
                    </Button>
                  </Popconfirm>
                )}
              </>
            )}
          </div>
        ))}
      {failure && <Alert type="error" message={failure} />}
      {lines.length > 0 && (
        <ul className="space-y-2">
          {Array.from(new Set(lines)).map((line) => (
            <li key={line} className="whitespace-pre-wrap break-words">
              {line}
            </li>
          ))}
        </ul>
      )}
      {(agent.error || personal.error) && (
        <p role="status">
          部分交流习惯暂时无法读取。
          <Button
            type="link"
            onClick={() => {
              void personal.refresh();
              void agent.refresh();
            }}
          >
            重试
          </Button>
        </p>
      )}
      <p className="mt-2 text-sm text-slate-600">
        想调整时，直接告诉我就好。比如「以后回答先给结论」。
      </p>
    </section>
  );
}
